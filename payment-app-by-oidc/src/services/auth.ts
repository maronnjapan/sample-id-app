import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Bindings, IdTokenPayload } from '../types';

const AUTH_SCOPES = 'openid email';
const JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function getAppBaseUrl(env: Bindings): string {
  const base = env.APP_BASE_URL?.trim();
  if (!base) {
    throw new Error('APP_BASE_URL is not configured');
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function buildAuthorizeUrl(
  env: Bindings,
  paymentId: string,
  nonce: string
): string {
  const url = new URL(`https://${env.OKTA_DOMAIN}/oauth2/v1/authorize`);
  url.searchParams.set('client_id', env.OKTA_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', AUTH_SCOPES);
  url.searchParams.set('redirect_uri', `${getAppBaseUrl(env)}/callback`);
  url.searchParams.set('state', paymentId);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('acr_values', 'urn:okta:loa:2fa:any');
  url.searchParams.set('max_age', '0');
  return url.toString();
}

export async function exchangeCodeForTokens(
  env: Bindings,
  code: string
): Promise<{ id_token: string; access_token?: string }> {
  const tokenUrl = `https://${env.OKTA_DOMAIN}/oauth2/v1/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${getAppBaseUrl(env)}/callback`,
    client_id: env.OKTA_CLIENT_ID,
    client_secret: env.OKTA_CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as { id_token: string; access_token?: string };
  return data;
}

function getRemoteJwks(domain: string) {
  if (!JWKS_CACHE.has(domain)) {
    JWKS_CACHE.set(domain, createRemoteJWKSet(new URL(`https://${domain}/oauth2/v1/keys`)));
  }
  return JWKS_CACHE.get(domain)!;
}

export async function verifyIdToken(
  env: Bindings,
  idToken: string
): Promise<IdTokenPayload> {
  const jwks = getRemoteJwks(env.OKTA_DOMAIN);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: `https://${env.OKTA_DOMAIN}`,
    audience: env.OKTA_CLIENT_ID,
  });
  return payload as unknown as IdTokenPayload;
}

export function validateApproval(
  payload: IdTokenPayload,
  referenceTime: number,
  expectedNonce?: string
): { valid: boolean; reason?: string } {
  if (payload.auth_time * 1000 < referenceTime - 60 * 1000) {
    return { valid: false, reason: 'Authentication happened too early' };
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    return { valid: false, reason: 'Nonce mismatch' };
  }

  return { valid: true };
}
