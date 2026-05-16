/**
 * モック Auth0 として RS256 JWT を発行する開発用スクリプト。
 *
 *   # 鍵を新規生成しつつ access token / My Account token を発行
 *   npx tsx scripts/mint-jwt.ts --sub 'auth0|123' \
 *     --api-identifier https://api.example.com \
 *     --my-account-audience https://token-vault.example.com/me/
 *
 *   # 既存の秘密鍵を使う場合は MOCK_JWT_PRIVATE_KEY に PEM を入れる
 *
 * 出力された private key PEM を Secrets Manager のシークレット
 * （token-vault/providers）の mock_jwt_private_key_pem に貼り付ける。
 */
import { generateKeyPairSync } from 'node:crypto';
import { signJwt } from '../src/common/jwt';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const issuer = arg('issuer', 'https://mock-auth0.example.com/');
const sub = arg('sub', 'auth0|test-user');
const apiIdentifier = arg('api-identifier', 'https://api.example.com');
const myAccountAudience = arg('my-account-audience', 'https://token-vault.example.com/me/');
const clientId = arg('client-id', 'spa-client');
const scope = arg('scope', 'openid profile email');
const ttl = Number(arg('ttl', '3600'));

let privateKeyPem = process.env.MOCK_JWT_PRIVATE_KEY;
if (!privateKeyPem) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

const now = Math.floor(Date.now() / 1000);

const accessToken = signJwt(
  { iss: issuer, sub, aud: apiIdentifier, azp: clientId, scope, exp: now + ttl },
  privateKeyPem,
);

const myAccountToken = signJwt(
  { iss: issuer, sub, aud: myAccountAudience, azp: clientId, scope, exp: now + ttl },
  privateKeyPem,
);

// eslint-disable-next-line no-console
console.log(
  JSON.stringify(
    {
      access_token_subject_token: accessToken,
      my_account_api_token: myAccountToken,
      secrets_manager_field: { mock_jwt_private_key_pem: privateKeyPem },
    },
    null,
    2,
  ),
);
