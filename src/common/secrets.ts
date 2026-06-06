// Secrets Manager から provider の client_secret とモック JWT 秘密鍵を取得する。
// 1 つのシークレットに JSON でまとめる。
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { env } from './env';

interface ProviderCreds {
  client_id: string;
  client_secret: string;
}

interface SecretShape {
  google?: ProviderCreds;
  slack?: ProviderCreds;
  github?: ProviderCreds;
  /** モック Auth0 の RS256 秘密鍵（PEM, PKCS#8） */
  mock_jwt_private_key_pem?: string;
}

const sm = new SecretsManagerClient({});
let cache: SecretShape | undefined;

async function load(): Promise<SecretShape> {
  if (cache) return cache;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: env.providerSecretName }));
  if (!res.SecretString) throw new Error('provider secret is empty');
  cache = JSON.parse(res.SecretString) as SecretShape;
  return cache;
}

export async function getProviderCreds(providerKey: 'google' | 'slack' | 'github'): Promise<ProviderCreds> {
  const secret = await load();
  const creds = secret[providerKey];
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error(`provider creds not configured: ${providerKey}`);
  }
  return creds;
}

export async function getMockJwtPrivateKey(): Promise<string> {
  const secret = await load();
  if (!secret.mock_jwt_private_key_pem) {
    throw new Error('mock_jwt_private_key_pem not configured');
  }
  return secret.mock_jwt_private_key_pem;
}
