// POST /oauth/token — Auth0 互換の Token Exchange エンドポイント。
// subject_token_type で内部分岐し、JWT Authorizer は使わず Lambda 本体で検証する。
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  GRANT_TYPE_TOKEN_EXCHANGE,
  REFRESH_SKEW_SEC,
  SUBJECT_TOKEN_TYPE_ACCESS,
  SUBJECT_TOKEN_TYPE_REFRESH,
  TOKEN_TYPE_FEDERATED_CONNECTION,
} from '../common/constants';
import { authenticateClient, ClientAuthError } from '../common/clients';
import { findConnectedAccounts, putConnectedAccount } from '../common/dynamo';
import { kmsDecrypt, kmsEncrypt } from '../common/kms';
import { getProvider } from '../common/providers';
import { getProviderCreds } from '../common/secrets';
import {
  ProviderTokenError,
  refreshProviderToken,
  SubjectTokenError,
  verifyAccessSubjectToken,
  verifyRefreshSubjectToken,
} from '../common/tokens';
import { oauthError, parseBody, json } from '../common/http';
import { log } from '../common/logger';
import type { ApiClientRecord, ConnectedAccountRecord } from '../types';

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const startedAt = Date.now();
  const requestId = event.requestContext.requestId;
  const body = parseBody(event);
  const connection = body.connection;
  const subjectTokenType = body.subject_token_type;
  const auditBase = {
    request_id: requestId,
    client_id: body.client_id,
    connection,
    operation: 'exchange' as const,
    subject_token_type:
      subjectTokenType === SUBJECT_TOKEN_TYPE_ACCESS
        ? ('access_token' as const)
        : ('refresh_token' as const),
  };

  const fail = (
    status: number,
    code: string,
    description: string,
    result: 'failure' | 'reconsent_required' = 'failure',
  ): APIGatewayProxyStructuredResultV2 => {
    log.audit({
      ...auditBase,
      result,
      error_code: code,
      duration_ms: Date.now() - startedAt,
    });
    return oauthError(status, code, description);
  };

  // 1. リクエストパース / grant_type 検証
  if (body.grant_type !== GRANT_TYPE_TOKEN_EXCHANGE) {
    return fail(400, 'unsupported_grant_type', 'unsupported grant_type');
  }
  if (
    body.requested_token_type &&
    body.requested_token_type !== TOKEN_TYPE_FEDERATED_CONNECTION
  ) {
    return fail(400, 'invalid_request', 'unsupported requested_token_type');
  }
  if (!body.subject_token) {
    return fail(400, 'invalid_request', 'subject_token is required');
  }
  if (!connection) {
    return fail(400, 'invalid_request', 'connection is required');
  }
  const provider = getProvider(connection);
  if (!provider) {
    return fail(400, 'invalid_request', `unsupported connection: ${connection}`);
  }

  // 2. クライアント認証（共通）
  let client: ApiClientRecord;
  try {
    client = await authenticateClient(
      body.client_id,
      body.client_secret,
      GRANT_TYPE_TOKEN_EXCHANGE,
    );
  } catch (e) {
    if (e instanceof ClientAuthError) {
      return fail(401, 'invalid_client', e.message);
    }
    throw e;
  }

  // 3. subject_token_type による分岐
  let userId: string;
  try {
    if (subjectTokenType === SUBJECT_TOKEN_TYPE_REFRESH) {
      ({ userId } = await verifyRefreshSubjectToken(body.subject_token, client));
    } else if (subjectTokenType === SUBJECT_TOKEN_TYPE_ACCESS) {
      ({ userId } = await verifyAccessSubjectToken(body.subject_token, client));
    } else {
      return fail(400, 'invalid_request', 'unsupported subject_token_type');
    }
  } catch (e) {
    if (e instanceof SubjectTokenError) {
      // ユーザー特定不可は仕様どおり 401。
      return fail(401, 'invalid_grant', e.message);
    }
    throw e;
  }

  // 4. Connected Account 検索（共通）
  const accounts = await findConnectedAccounts(userId, connection);
  let account: ConnectedAccountRecord | undefined = accounts[0];
  if (body.login_hint) {
    account = accounts.find((a) => a.provider_account_id === body.login_hint);
  }
  if (!account) {
    // ユーザーの connected_accounts に当該 connection が無い扱い → 401。
    return fail(401, 'invalid_grant', 'no connected account for this connection');
  }

  // 5. 外部 access token の取得（共通）
  let accessToken = await kmsDecrypt(account.access_token_ct);
  let expiresAt = account.access_token_exp;
  let scope = account.granted_scopes.join(' ');
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt <= now + REFRESH_SKEW_SEC) {
    // 期限切れ / 間近 → provider に refresh をかける。
    log.audit({ ...auditBase, user_id: userId, result: 'refresh_triggered' });
    try {
      const refreshToken = await kmsDecrypt(account.refresh_token_ct);
      const creds = await getProviderCreds(
        provider.providerKey as 'google' | 'slack' | 'github',
      );
      const refreshed = await refreshProviderToken({
        provider,
        clientId: creds.client_id,
        clientSecret: creds.client_secret,
        refreshToken,
      });
      accessToken = refreshed.access_token;
      expiresAt = refreshed.access_token_exp;
      scope = refreshed.scope || scope;

      const updated: ConnectedAccountRecord = {
        ...account,
        access_token_ct: await kmsEncrypt(refreshed.access_token),
        refresh_token_ct: refreshed.refresh_token
          ? await kmsEncrypt(refreshed.refresh_token)
          : account.refresh_token_ct,
        access_token_exp: refreshed.access_token_exp,
        granted_scopes: refreshed.scope ? refreshed.scope.split(' ') : account.granted_scopes,
        updated_at: new Date().toISOString(),
      };
      await putConnectedAccount(updated);
    } catch (e) {
      if (e instanceof ProviderTokenError) {
        // refresh 失敗 = 再同意が必要。
        return fail(401, 'invalid_grant', 'refresh failed, reconsent required', 'reconsent_required');
      }
      throw e;
    }
  }

  // 6. レスポンス（Auth0 形式）
  log.audit({
    ...auditBase,
    user_id: userId,
    result: 'success',
    duration_ms: Date.now() - startedAt,
  });
  return json(200, {
    access_token: accessToken,
    scope,
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    issued_token_type: TOKEN_TYPE_FEDERATED_CONNECTION,
    token_type: 'Bearer',
  });
};
