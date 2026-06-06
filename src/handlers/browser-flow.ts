// 外部プロバイダー連携のブラウザ動線。
//  - GET /connected-accounts/connect?ticket=...  → provider 認可画面へ 302
//  - GET /_internal/provider-callback?code=&state=ticket → connect_code 発行して
//    クライアントの redirect_uri へ 302
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { SESSION_TTL_SEC } from '../common/constants';
import { getConnectSessionByTicket, putPendingConnection } from '../common/dynamo';
import { kmsEncrypt } from '../common/kms';
import { getProvider } from '../common/providers';
import { getProviderCreds } from '../common/secrets';
import { exchangeAuthorizationCode, ProviderTokenError } from '../common/tokens';
import { generateConnectCode } from '../common/ids';
import { baseUrl, html, redirect } from '../common/http';
import { env } from '../common/env';
import { log } from '../common/logger';
import type { ProviderConfig } from '../types';

/** id_token / JWT の payload を「検証せず」デコードする（provider 側 sub 取得用） */
function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function callbackRedirectUri(event: APIGatewayProxyEventV2): string {
  return `${baseUrl(event)}${env.providerCallbackPath}`;
}

function buildAuthorizeUrl(
  provider: ProviderConfig,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  ticket: string,
): string {
  const url = new URL(provider.authorizationEndpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(provider.scopeSeparator));
  url.searchParams.set('state', ticket);
  for (const [k, v] of Object.entries(provider.extraAuthParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const path = event.requestContext.http.path;
  const requestId = event.requestContext.requestId;

  if (path === env.connectEntryPath) {
    return handleConnectEntry(event, requestId);
  }
  if (path === env.providerCallbackPath) {
    return handleProviderCallback(event, requestId);
  }
  return html(404, '<h1>404 Not Found</h1>');
};

async function handleConnectEntry(
  event: APIGatewayProxyEventV2,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const ticket = event.queryStringParameters?.ticket;
  if (!ticket) return html(400, '<h1>400</h1><p>ticket is required</p>');

  const session = await getConnectSessionByTicket(ticket);
  if (!session) return html(400, '<h1>400</h1><p>invalid or expired ticket</p>');

  const provider = getProvider(session.connection);
  if (!provider) return html(400, '<h1>400</h1><p>unsupported connection</p>');

  const creds = await getProviderCreds(
    provider.providerKey as 'google' | 'slack' | 'github',
  );
  const authorizeUrl = buildAuthorizeUrl(
    provider,
    creds.client_id,
    callbackRedirectUri(event),
    session.scopes,
    ticket,
  );

  log.audit({
    request_id: requestId,
    user_id: session.user_id,
    connection: session.connection,
    operation: 'authorize',
    result: 'success',
  });

  return redirect(authorizeUrl);
}

async function handleProviderCallback(
  event: APIGatewayProxyEventV2,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const code = event.queryStringParameters?.code;
  const ticket = event.queryStringParameters?.state;
  if (!code || !ticket) return html(400, '<h1>400</h1><p>code/state required</p>');

  const session = await getConnectSessionByTicket(ticket);
  if (!session) return html(400, '<h1>400</h1><p>invalid or expired session</p>');

  const provider = getProvider(session.connection);
  if (!provider) return html(400, '<h1>400</h1><p>unsupported connection</p>');

  const creds = await getProviderCreds(
    provider.providerKey as 'google' | 'slack' | 'github',
  );

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode({
      provider,
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
      code,
      redirectUri: callbackRedirectUri(event),
    });
  } catch (e) {
    if (e instanceof ProviderTokenError) {
      log.audit({
        request_id: requestId,
        user_id: session.user_id,
        connection: session.connection,
        operation: 'callback',
        result: 'failure',
        error_code: 'provider_token_error',
      });
      return html(502, '<h1>502</h1><p>provider token exchange failed</p>');
    }
    throw e;
  }

  // provider 側ユーザー ID は id_token があれば sub を、無ければ代替値を使う。
  const idTokenRaw = (tokens as unknown as { id_token?: string }).id_token;
  const idClaims = idTokenRaw ? decodeJwtPayloadUnsafe(idTokenRaw) : undefined;
  const providerAccountId =
    (idClaims?.sub as string | undefined) ??
    (idClaims?.email as string | undefined) ??
    `${session.connection}|${session.user_id}`;

  const connectCode = generateConnectCode();
  const nowSec = Math.floor(Date.now() / 1000);
  await putPendingConnection({
    connect_code: connectCode,
    user_id: session.user_id,
    connection: session.connection,
    provider_tokens_ct: await kmsEncrypt(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_exp: tokens.access_token_exp,
        scope: tokens.scope,
        provider_account_id: providerAccountId,
      }),
    ),
    scopes: session.scopes,
    redirect_uri: session.redirect_uri,
    auth_session: session.auth_session,
    created_at: new Date().toISOString(),
    ttl: nowSec + SESSION_TTL_SEC,
  });

  // ConnectSessions は /complete で auth_session 引き当てに使うのでここでは消さない
  // （ticket は TTL で失効。connect_code が一回使い切りの本体）。
  const target = new URL(session.redirect_uri);
  target.searchParams.set('connect_code', connectCode);
  if (session.state) target.searchParams.set('state', session.state);

  log.audit({
    request_id: requestId,
    user_id: session.user_id,
    connection: session.connection,
    operation: 'callback',
    result: 'success',
  });

  return redirect(target.toString());
}
