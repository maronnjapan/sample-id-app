// PKCE utilities

import { COMPLETE_CONNECT_ACCOUNT_PATH, INITIATE_CONNECT_ACCOUNT_PATH } from "./const"

function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64URLEncode(digest)
}

// Auth URL builder

export function buildAuthUrl(params: {
  domain: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
  connection?: string
  scope?: string
  audience?: string
}): string {
  const url = new URL(`https://${params.domain}/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', params.scope ?? 'openid profile email')
  if (params.audience) url.searchParams.set('audience', params.audience)
  if (params.connection) url.searchParams.set('connection', params.connection)
  return url.toString()
}

// Token exchange (Authorization Code + PKCE)

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token: string
  expires_in: number
  token_type: string
}

export async function exchangeCode(params: {
  domain: string
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenResponse> {
  const res = await fetch(`https://${params.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<TokenResponse>
}

// UserInfo endpoint

export async function getUserInfo(
  domain: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://${domain}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to get userinfo')
  return res.json() as Promise<Record<string, unknown>>
}

// ─── My Account API – Connected Accounts ──────────────────────────────────────

export interface ConnectedAccountsInitResponse {
  auth_session: string
  connect_uri: string
  connect_params: { ticket: string }
  expires_in: number
}

export async function initiateConnectedAccount(params: {
  domain: string
  accessToken: string
  connection: string
  redirectUri: string
  state: string
  scopes?: string[]
}): Promise<ConnectedAccountsInitResponse> {
  const body: Record<string, unknown> = {
    connection: params.connection,
    redirect_uri: params.redirectUri,
    state: params.state,
  }
  if (params.scopes) body['scopes'] = params.scopes

  const res = await fetch(`https://${params.domain}${INITIATE_CONNECT_ACCOUNT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Connected Account 開始エラー (${res.status}): ${text}`)
  }
  return res.json() as Promise<ConnectedAccountsInitResponse>
}

export interface ConnectedAccount {
  id: string
  connection: string
  access_type: string
  scopes: string[]
  created_at: string
}

export async function completeConnectedAccount(params: {
  domain: string
  accessToken: string
  authSession: string
  connectCode: string
  redirectUri: string
}): Promise<ConnectedAccount> {
  const res = await fetch(`https://${params.domain}${COMPLETE_CONNECT_ACCOUNT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      auth_session: params.authSession,
      connect_code: params.connectCode,
      redirect_uri: params.redirectUri,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Connected Account 完了エラー (${res.status}): ${text}`)
  }
  return res.json() as Promise<ConnectedAccount>
}

export async function listConnectedAccounts(params: {
  domain: string
  accessToken: string
  connection?: string
}): Promise<ConnectedAccount[]> {
  const url = new URL(`https://${params.domain}/me/v1/connected-accounts/accounts`)
  if (params.connection) url.searchParams.set('connection', params.connection)

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Connected Account 一覧取得エラー (${res.status}): ${text}`)
  }
  const data = await res.json() as { accounts: ConnectedAccount[] }
  return data.accounts
}

export async function deleteConnectedAccount(params: {
  domain: string
  accessToken: string
  accountId: string
}): Promise<void> {
  const res = await fetch(
    `https://${params.domain}/me/v1/connected-accounts/accounts/${params.accountId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
    }
  )
  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    throw new Error(`Connected Account 削除エラー (${res.status}): ${text}`)
  }
}

export async function exchangeTokenByRefreshToken(params: {
  domain: string
  clientId: string
  clientSecret: string
  refreshToken: string
}) {

  const res = await fetch(`https://${params.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      subject_token: params.refreshToken,
      grant_type: 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:refresh_token',
      requested_token_type: 'http://auth0.com/oauth/token-type/federated-connection-access-token',
      connection: "google-oauth2"
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<TokenResponse>
} 