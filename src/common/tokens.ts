// subject token の検証（refresh / access の2系統）と、外部 provider との
// HTTP token 交換（authorization_code / refresh_token）。
import { getRefreshToken } from './dynamo';
import { hashRefreshToken } from './ids';
import { verifyJwt, JwtError } from './jwt';
import { getMockJwtPrivateKey } from './secrets';
import { env } from './env';
import type { ApiClientRecord, ProviderConfig, TokenSet } from '../types';

export class SubjectTokenError extends Error {}

export interface SubjectResult {
  userId: string;
  scopes: string[];
}

/** 方式1: Auth0 refresh token（不透明文字列）を RefreshTokens テーブルで検証 */
export async function verifyRefreshSubjectToken(
  subjectToken: string,
  client: ApiClientRecord,
): Promise<SubjectResult> {
  const rec = await getRefreshToken(hashRefreshToken(subjectToken));
  if (!rec) throw new SubjectTokenError('refresh token not found');
  if (rec.status !== 'active') throw new SubjectTokenError('refresh token revoked');
  if (rec.expires_at !== null && rec.expires_at < Math.floor(Date.now() / 1000)) {
    throw new SubjectTokenError('refresh token expired');
  }
  if (rec.client_id !== client.client_id) {
    throw new SubjectTokenError('refresh token not bound to this client');
  }
  return { userId: rec.user_id, scopes: rec.scopes };
}

/** 方式2: Auth0 access token（JWT, RS256）を自前 JWKS（秘密鍵由来）で検証 */
export async function verifyAccessSubjectToken(
  subjectToken: string,
  client: ApiClientRecord,
): Promise<SubjectResult> {
  if (client.client_type !== 'custom_api_client' || !client.api_identifier) {
    throw new SubjectTokenError('client is not a custom api client');
  }
  const privateKey = await getMockJwtPrivateKey();
  try {
    const claims = verifyJwt(subjectToken, privateKey, {
      issuer: env.jwtIssuer,
      audience: client.api_identifier,
    });
    const scope = typeof claims.scope === 'string' ? claims.scope : '';
    return { userId: claims.sub, scopes: scope ? scope.split(' ') : [] };
  } catch (e) {
    if (e instanceof JwtError) throw new SubjectTokenError(`access token invalid: ${e.message}`);
    throw e;
  }
}

interface ProviderTokenRequest {
  provider: ProviderConfig;
  clientId: string;
  clientSecret: string;
  params: Record<string, string>;
}

async function callTokenEndpoint(req: ProviderTokenRequest): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: req.clientId,
    client_secret: req.clientSecret,
    ...req.params,
  });
  const res = await fetch(req.provider.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...(req.provider.extraTokenHeaders ?? {}),
    },
    body: body.toString(),
  });
  const text = await res.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    raw = Object.fromEntries(new URLSearchParams(text));
  }
  if (!res.ok || raw.error) {
    throw new ProviderTokenError(
      typeof raw.error === 'string' ? raw.error : `provider token endpoint failed (${res.status})`,
    );
  }
  return req.provider.parseTokenResponse(raw);
}

export class ProviderTokenError extends Error {}

/** authorization code → token（Connected Accounts callback で使用） */
export async function exchangeAuthorizationCode(input: {
  provider: ProviderConfig;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<TokenSet> {
  return callTokenEndpoint({
    provider: input.provider,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    params: {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
    },
  });
}

/** refresh_token → 新しい access token（/oauth/token の refresh トリガで使用） */
export async function refreshProviderToken(input: {
  provider: ProviderConfig;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenSet> {
  return callTokenEndpoint({
    provider: input.provider,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    params: {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    },
  });
}
