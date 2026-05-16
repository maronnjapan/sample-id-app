// クライアント認証。client_secret は平文保存せずハッシュ比較する。
// bcrypt/argon2 はネイティブ依存になるため、組み込みの scrypt を採用する
// （検証用途として十分な強度。フォーマット: scrypt$<saltB64>$<hashB64>）。
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getApiClient } from './dynamo';
import type { ApiClientRecord } from '../types';

const KEYLEN = 64;

export function hashClientSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyClientSecret(secret: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const actual = scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class ClientAuthError extends Error {}

/**
 * client_id / client_secret を検証し、指定 grant_type が許可されているか確認する。
 * 失敗時は ClientAuthError（呼び出し側で 401 に変換）。
 */
export async function authenticateClient(
  clientId: string | undefined,
  clientSecret: string | undefined,
  requiredGrantType: string,
): Promise<ApiClientRecord> {
  if (!clientId || !clientSecret) {
    throw new ClientAuthError('client_id and client_secret are required');
  }
  const client = await getApiClient(clientId);
  if (!client || !verifyClientSecret(clientSecret, client.client_secret_hash)) {
    throw new ClientAuthError('invalid client credentials');
  }
  if (!client.allowed_grant_types.includes(requiredGrantType)) {
    throw new ClientAuthError(`grant_type not allowed for this client: ${requiredGrantType}`);
  }
  return client;
}
