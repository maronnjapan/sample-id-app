import { importPKCS8, SignJWT } from 'jose';
import type {
  Bindings,
  FactorPollResponse,
  FactorVerifyResponse,
} from '../types';

const MANAGEMENT_SCOPES =
  'okta.users.read okta.users.manage okta.factors.read okta.factors.manage';
const TOKEN_PATH = '/oauth2/v1/token';

let privateKeyPromise: Promise<CryptoKey> | null = null;
let cachedAccessToken: { token: string; exp: number } | null = null;

function buildOktaUrl(env: Bindings, path: string): string {
  if (path.startsWith('https://')) {
    return path;
  }
  return `https://${env.OKTA_DOMAIN}${path}`;
}

async function getPrivateKey(env: Bindings): Promise<CryptoKey> {
  if (!privateKeyPromise) {
    privateKeyPromise = importPKCS8(env.OKTA_MGMT_PRIVATE_KEY, 'RS256');
  }
  return privateKeyPromise;
}

async function getManagementAccessToken(env: Bindings): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp - 30 > now) {
    return cachedAccessToken.token;
  }

  const tokenUrl = buildOktaUrl(env, TOKEN_PATH);
  const privateKey = await getPrivateKey(env);

  const clientAssertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: env.OKTA_MGMT_KID, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1m')
    .setIssuer(env.OKTA_MGMT_CLIENT_ID)
    .setSubject(env.OKTA_MGMT_CLIENT_ID)
    .setAudience(tokenUrl)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: MANAGEMENT_SCOPES,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain management token: ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number; scope?: string };
  cachedAccessToken = {
    token: data.access_token,
    exp: now + Math.max(data.expires_in - 30, 30),
  };
  return data.access_token;
}

async function authorizedFetch(
  env: Bindings,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getManagementAccessToken(env);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (init.method === 'POST' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(buildOktaUrl(env, path), { ...init, headers });
}

export async function getUserId(env: Bindings, email: string): Promise<string> {
  const response = await authorizedFetch(
    env,
    `/api/v1/users/${email}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `User lookup failed for ${email} (${response.status}): ${errorText}`
    );
  }

  const user = (await response.json()) as { id: string };
  return user.id;
}

export async function getPushFactorId(env: Bindings, userId: string): Promise<string> {
  const response = await authorizedFetch(env, `/api/v1/users/${userId}/factors`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to fetch user factors (${response.status}): ${errorText}`);
  }

  const factors = (await response.json()) as Array<{
    id: string;
    factorType: string;
    status: string;
  }>;

  const pushFactor = factors.find(
    (factor) => factor.factorType === 'push' && factor.status === 'ACTIVE'
  );

  if (!pushFactor) {
    throw new Error('No active Okta Verify Push factor found');
  }

  return pushFactor.id;
}

export async function sendPushVerification(
  env: Bindings,
  userId: string,
  factorId: string
): Promise<FactorVerifyResponse> {
  const response = await authorizedFetch(
    env,
    `/api/v1/users/${userId}/factors/${factorId}/verify`,
    {
      method: 'POST',
      body: JSON.stringify({
        useNumberMatchingChallenge: true
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Push verification failed: ${errorText}`);
  }

  return response.json() as Promise<FactorVerifyResponse>;
}

export async function pollTransaction(
  env: Bindings,
  pollUrl: string
): Promise<FactorPollResponse> {
  const response = await authorizedFetch(env, pollUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polling failed: ${errorText}`);
  }
  return response.json() as Promise<FactorPollResponse>;
}

export function extractTransactionId(pollUrl: string): string {
  try {
    const url = new URL(pollUrl);
    const parts = url.pathname.split('/');
    return parts[parts.length - 1] || pollUrl;
  } catch {
    return pollUrl;
  }
}
