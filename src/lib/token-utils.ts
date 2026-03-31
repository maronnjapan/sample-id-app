/**
 * JWTトークンのペイロード型定義
 */
export interface TokenPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  scope?: string;
  [key: string]: unknown;
}

/**
 * JWTトークンのペイロード部分をBase64デコードする
 * 署名検証は行わない（decoded only / not verified）
 * ブラウザ・Node.js両方で動作するようにatobベースで実装
 */
export function decodeJWTPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // base64url → base64 に変換
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const decoded = atob(padded);
    // バイナリ文字列をUTF-8に変換
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Token Exchangeリクエストのパラメータを構築する
 */
export interface TokenExchangeParams {
  idToken: string;
  audience?: string;
  scope?: string;
}

/**
 * Okta Org認可サーバー向けToken Exchangeリクエストボディを構築
 *
 * RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693
 */
export function buildTokenExchangeBody(params: TokenExchangeParams): URLSearchParams {
  const body = new URLSearchParams({
    'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
    'subject_token': params.idToken,
    'subject_token_type': 'urn:ietf:params:oauth:token-type:id_token',
    'requested_token_type': 'urn:ietf:params:oauth:token-type:id-jag',
    'resource': 'https://example.com', // Resource Serverの識別子（必要に応じて変更）
  });

  if (params.audience) {
    console.log('Token Exchange audience:', params.audience);
    body.append('audience', params.audience);
  }

  if (params.scope) {
    body.append('scope', params.scope);
  }

  return body;
}

/**
 * テキストをクリップボードにコピーする
 */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
