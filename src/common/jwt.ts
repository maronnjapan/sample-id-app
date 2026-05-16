// モック Auth0 が発行する JWT（RS256）の署名・検証。
// 外部ライブラリを使わず node:crypto だけで完結させる（検証用途として十分）。
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from 'node:crypto';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

export interface JwtClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  scope?: string;
  azp?: string;
  [k: string]: unknown;
}

/** モック Auth0 として access token / My Account API token を発行する */
export function signJwt(claims: Omit<JwtClaims, 'iat'> & { iat?: number }, privateKeyPem: string): string {
  const key: KeyObject = createPrivateKey(privateKeyPem);
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: JwtClaims = { ...claims, iat: claims.iat ?? now } as JwtClaims;
  const signingInput = `${b64urlJson(header)}.${b64urlJson(fullClaims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(key).toString('base64url');
  return `${signingInput}.${signature}`;
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  /** exp 検証の許容ずれ秒（デフォルト 60） */
  clockToleranceSec?: number;
}

export class JwtError extends Error {}

/**
 * RS256 JWT を検証する。privateKeyPem からは公開鍵を導出して使うので、
 * モック環境では秘密鍵だけを Secrets Manager に置けばよい。
 */
export function verifyJwt(token: string, privateKeyPem: string, opts: VerifyOptions): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed token');
  const [encHeader, encPayload, encSig] = parts;

  let header: { alg?: string };
  let claims: JwtClaims;
  try {
    header = JSON.parse(Buffer.from(encHeader, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(encPayload, 'base64url').toString('utf8'));
  } catch {
    throw new JwtError('invalid token encoding');
  }
  if (header.alg !== 'RS256') throw new JwtError(`unsupported alg: ${header.alg}`);

  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encHeader}.${encPayload}`);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(encSig, 'base64url'))) {
    throw new JwtError('signature verification failed');
  }

  const tol = opts.clockToleranceSec ?? 60;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || now > claims.exp + tol) {
    throw new JwtError('token expired');
  }
  if (claims.iss !== opts.issuer) {
    throw new JwtError('issuer mismatch');
  }
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(opts.audience)) {
    throw new JwtError('audience mismatch');
  }
  return claims;
}
