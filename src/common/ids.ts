// 各種 ID / シークレットの生成と、refresh token のハッシュ化。
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function base62(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE62[bytes[i] % 62];
  }
  return out;
}

/** ブラウザに渡す ticket（UUID） */
export function generateTicket(): string {
  return randomUUID();
}

/** クライアントが保持する auth_session（不透明・URL safe） */
export function generateAuthSession(): string {
  return randomBytes(48).toString('base64url');
}

/** /complete で一回使い切りの connect_code（UUID） */
export function generateConnectCode(): string {
  return randomUUID();
}

/** connected account ID（Auth0 の cac_ プレフィックスに揃える） */
export function generateConnectedAccountId(): string {
  return `cac_${base62(22)}`;
}

/**
 * RefreshTokens テーブルの PK。refresh token 文字列そのものは保存せず
 * SHA-256 ハッシュをキーにする。
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
