// /me/v1/connected-accounts/* — My Account API（JWT Authorizer 配下）。
// connect / complete / connections / accounts(list) / accounts(delete) を担当。
import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { SESSION_TTL_SEC } from '../common/constants';
import {
  buildConnectedAccountRecord,
  deleteConnectSession,
  deleteConnectedAccount,
  deletePendingConnection,
  getConnectSessionByAuthSession,
  getConnectedAccount,
  getPendingConnection,
  listConnectedAccountsForUser,
  putConnectedAccount,
  putConnectSession,
} from '../common/dynamo';
import { kmsDecrypt, kmsEncrypt } from '../common/kms';
import { getProvider, listProviders } from '../common/providers';
import { generateAuthSession, generateConnectedAccountId, generateTicket } from '../common/ids';
import { baseUrl, json, oauthError, parseBody } from '../common/http';
import { env } from '../common/env';
import { log } from '../common/logger';
import type { ConnectSessionRecord } from '../types';

interface AuthCtx {
  sub: string;
  scope: string;
  client_id: string;
}
type Event = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthCtx>;

function parseScopes(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as unknown[];
      return arr.map(String);
    } catch {
      /* fallthrough */
    }
  }
  return trimmed.split(/[\s,]+/).filter(Boolean);
}

export const handler = async (event: Event): Promise<APIGatewayProxyStructuredResultV2> => {
  const userId = event.requestContext.authorizer.lambda.sub;
  const requestId = event.requestContext.requestId;
  const routeKey = event.routeKey;

  if (!userId) return oauthError(401, 'unauthorized', 'missing subject');

  try {
    if (routeKey === 'POST /me/v1/connected-accounts/connect') {
      return await handleConnect(event, userId, requestId);
    }
    if (routeKey === 'POST /me/v1/connected-accounts/complete') {
      return await handleComplete(event, userId, requestId);
    }
    if (routeKey === 'GET /me/v1/connected-accounts/connections') {
      return handleConnections(requestId);
    }
    if (routeKey === 'GET /me/v1/connected-accounts/accounts') {
      return await handleListAccounts(event, userId, requestId);
    }
    if (routeKey === 'DELETE /me/v1/connected-accounts/accounts/{connectedAccountId}') {
      return await handleDeleteAccount(event, userId, requestId);
    }
    return oauthError(404, 'not_found', `unsupported route: ${routeKey}`);
  } catch (e) {
    log.error('connected-accounts handler error', {
      request_id: requestId,
      route: routeKey,
      error: (e as Error).message,
    });
    return oauthError(500, 'server_error', 'internal error');
  }
};

async function handleConnect(
  event: Event,
  userId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseBody(event);
  const connection = body.connection;
  const redirectUri = body.redirect_uri;
  const state = body.state ?? '';
  const scopes = parseScopes(body.scopes);

  const provider = connection ? getProvider(connection) : undefined;
  if (!provider) {
    return oauthError(400, 'invalid_request', `unsupported connection: ${connection}`);
  }
  if (!redirectUri) {
    return oauthError(400, 'invalid_request', 'redirect_uri is required');
  }

  const authSession = generateAuthSession();
  const ticket = generateTicket();
  const nowSec = Math.floor(Date.now() / 1000);
  const session: ConnectSessionRecord = {
    ticket,
    auth_session: authSession,
    user_id: userId,
    connection,
    redirect_uri: redirectUri,
    state,
    scopes: scopes.length ? scopes : provider.defaultScopes,
    created_at: new Date().toISOString(),
    ttl: nowSec + SESSION_TTL_SEC,
  };
  await putConnectSession(session);

  log.audit({
    request_id: requestId,
    user_id: userId,
    connection,
    operation: 'connect',
    result: 'success',
  });

  return json(200, {
    auth_session: authSession,
    connect_uri: `${baseUrl(event)}${env.connectEntryPath}`,
    connect_params: { ticket },
    expires_in: SESSION_TTL_SEC,
  });
}

async function handleComplete(
  event: Event,
  userId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseBody(event);
  const { auth_session: authSession, connect_code: connectCode, redirect_uri: redirectUri } = body;
  if (!authSession || !connectCode || !redirectUri) {
    return oauthError(400, 'invalid_request', 'auth_session, connect_code, redirect_uri are required');
  }

  const session = await getConnectSessionByAuthSession(authSession);
  if (!session || session.user_id !== userId) {
    return oauthError(401, 'invalid_grant', 'invalid auth_session');
  }

  const pending = await getPendingConnection(connectCode);
  if (
    !pending ||
    pending.user_id !== userId ||
    pending.auth_session !== authSession ||
    pending.redirect_uri !== redirectUri // 完全一致で検証（部分一致しない）
  ) {
    return oauthError(401, 'invalid_grant', 'invalid connect_code');
  }

  const provider = getProvider(pending.connection);
  if (!provider) {
    return oauthError(400, 'invalid_request', 'unsupported connection');
  }

  const tokensJson = await kmsDecrypt(pending.provider_tokens_ct);
  const tokens = JSON.parse(tokensJson) as {
    access_token: string;
    refresh_token?: string;
    access_token_exp: number;
    scope: string;
    provider_account_id: string;
  };

  const cacId = generateConnectedAccountId();
  const record = buildConnectedAccountRecord({
    userId,
    connectedAccountId: cacId,
    connection: pending.connection,
    provider: provider.providerKey,
    providerAccountId: tokens.provider_account_id,
    grantedScopes: pending.scopes,
    accessTokenCt: await kmsEncrypt(tokens.access_token),
    refreshTokenCt: await kmsEncrypt(tokens.refresh_token ?? ''),
    accessTokenExp: tokens.access_token_exp,
    accessType: 'offline',
  });
  await putConnectedAccount(record);

  // 一回使い切り。pending と session を削除する。
  await deletePendingConnection(connectCode);
  await deleteConnectSession(session.ticket);

  log.audit({
    request_id: requestId,
    user_id: userId,
    connection: pending.connection,
    operation: 'complete',
    result: 'success',
  });

  return json(200, {
    id: cacId,
    connection: pending.connection,
    created_at: record.created_at,
    scopes: pending.scopes,
    access_type: 'offline',
  });
}

function handleConnections(requestId: string): APIGatewayProxyStructuredResultV2 {
  log.audit({ request_id: requestId, operation: 'list', result: 'success' });
  return json(200, {
    connections: listProviders().map((p) => ({
      connection: p.connectionName,
      strategy: p.providerKey,
      scopes: p.defaultScopes,
    })),
  });
}

async function handleListAccounts(
  event: Event,
  userId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const connectionFilter = event.queryStringParameters?.connection;
  const all = await listConnectedAccountsForUser(userId);
  const filtered = connectionFilter
    ? all.filter((a) => a.connection === connectionFilter)
    : all;

  log.audit({
    request_id: requestId,
    user_id: userId,
    connection: connectionFilter,
    operation: 'list',
    result: 'success',
  });

  return json(200, {
    connected_accounts: filtered.map((a) => ({
      id: a.connected_account_id,
      connection: a.connection,
      created_at: a.created_at,
      scopes: a.granted_scopes,
      access_type: a.access_type,
    })),
  });
}

async function handleDeleteAccount(
  event: Event,
  userId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const cacId = event.pathParameters?.connectedAccountId;
  if (!cacId) return oauthError(400, 'invalid_request', 'connectedAccountId is required');

  const existing = await getConnectedAccount(userId, cacId);
  if (!existing) return oauthError(404, 'not_found', 'connected account not found');

  await deleteConnectedAccount(userId, cacId);

  log.audit({
    request_id: requestId,
    user_id: userId,
    connection: existing.connection,
    operation: 'delete',
    result: 'success',
  });

  return { statusCode: 204, body: '' };
}
