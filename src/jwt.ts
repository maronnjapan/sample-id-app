/**
 * JWT生成ユーティリティ（RS256）
 *
 * Web Crypto APIを使用してRS256署名のJWTを生成する。
 * デモ用の秘密鍵をハードコードしている（本番環境では環境変数等から取得すること）。
 */

// デモ用のRSA秘密鍵（PKCS#8形式）
// 実際の運用では環境変数やシークレットマネージャーから取得すること
const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCtzkdfXNb1V0E7
aMDO6dk59QmMg/tz9FUgYwIhXbkzXnp4ho0xcEM/oQ9OVnbyzp5BtVrFMdElGPir
6nIrdPrV0F3eW8fc89UF9MjOWpd8432d/NYmhcpuEWCk0oh7zrHXGJRFahhm8ind
lpdYzSXzylIyY0n0xrgKVEM8DfoBQM3r6lNKPFr8MY7qKTLFM+RtcHgHTgz3P7Gw
kpSPXLgklTbYwIyakjaRRUr9y+F4//fAye+8qHhFIkysMZm47Pwln4wr3EsJoJIO
cB09mzintToC2WKRm6dedki9dlAJ5V+1IB/q5In+p7mfXJI8hYehW6OkjZ8rSnG+
n4XIvvl7AgMBAAECggEAJd70nkrUa9D/XbqNiIhb1M0Xr45yk+mBQvVP2YVafV7w
wKJQ0ZzsikjF1QPyFyX+RcMGbEFWmQa/6HXFOsLahQxJ59GH0xUuLYYQ2yXSLFxF
Ws9kujAc067lqARXyOJYzc2FQTrE5mmNxcKyZ58Lzfsfver0imliYJ3LqKJC/1KK
6o3UIitAbWFjMq1V8WXddkcNaFRguoou6JEgLiYuHsV06YVJWVF+X922uToDdBk3
Qo5B7PaxN4ARDRx2MFI+nDjjSDMy+TWlnDOi9GHW6dNJwbFWzP1MX9avIXOm27g0
r23j9t4FSU0lIm2pRPrvkx8VCJPUpSvwgKYObLu6QQKBgQDuwirxzsAoo/paKufY
16HhJp1sC0H44Nz4Y0rACyptXH93oi35mITeWivoHBoNc5wGJcCC3fFNZ1j8NPvx
hjTM3QvmPOuWm/IvufksuWJ44MqoaUgwr4HCKRkB3sMfXh798c9AWttp6y0uZRW6
SAaC+teGBuGDz14jJXPSI+Nx7QKBgQC6W1tMiyDvyaBSEyUWQfmUoKqJfF+r/F/5
EsQEJNpxs8yJvKDdUr7B47NMYlOpmnX0Q09VJfucMs9T9VFru9GWtwRiE9NkCSJu
DpkWhZHlSWL5oa+74XQ5TWdVo7SeZYRnE3Cmrx8jGZofrBmZzthtz2oCzY7mRtSK
m6J3yfbMBwKBgD2HSjvgdQLEJ0s/TVpDT5NPOThTul+hyzAznlrZRcjDEpJI+CIf
XPZUNIZvX4Nh7K5k4jSXb4zr+jGckeTPGiJFQMDHqEq6y3HjMkSFTcwq2e8GmrT5
Na5MmwYxWwVlYwU8YJWMFIk6Mv2GzU+hKhRtAkem1Ez8jpzuFOftmbqNAoGBAIj8
xNU0ZIa/kQEkH5wH7V4K6LFd4rn7L9VYrQxaxtTUFWOebCWlQKIoLlHU6aj/6Psg
S33NCPLeCret2ic2ji+a4zbxWe/sIwoB4xjCIOgKFR5pc1PJu/SvaGl0iD3zY+ud
R67PhjT4CeqESOFeQowd7tCWqBewM2acV0Z1CN0bAoGBAITDNyOs3ALrxENnw+sF
jFbigi1+pTHc15sgZJw8ai84N5jgXeBXiSpFn8RP2lwPqffwkVjpxYUwjZO52W2p
wcucywF1dKJnkLrr1Gfu4g1DR6YmGzT/Qx2ifMi5A1ICUMfn7XZt9/05knTRho9J
9SILFntXy7BZX6t4i/RpKitg
-----END PRIVATE KEY-----`;

/**
 * Base64URLエンコード
 */
function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * PEM形式の秘密鍵をCryptoKeyに変換
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';

  const pemContents = pem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c: string) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

/**
 * UUID v4を生成（jti用）
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * JWTペイロードの型定義
 */
export interface JWTPayload {
  iss: string;
  sub: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * RS256署名のJWTを生成
 *
 * @param scope - トークンのスコープ
 * @param expiresIn - 有効期限（秒）
 * @returns 署名済みJWT文字列
 */
export async function generateJWT(
  scope: string,
  expiresIn: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // JWTヘッダ
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // JWTペイロード
  const payload: JWTPayload = {
    iss: 'https://cache-control-demo.example.com',
    sub: 'demo-client',
    scope: scope,
    iat: now,
    exp: now + expiresIn,
    jti: generateUUID(),
  };

  // ヘッダとペイロードをBase64URLエンコード
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // 署名対象
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // 秘密鍵をインポート
  const privateKey = await importPrivateKey(PRIVATE_KEY_PEM);

  // RS256で署名
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  // 署名をBase64URLエンコード
  const encodedSignature = base64UrlEncode(signature);

  // JWT文字列を返す
  return `${signingInput}.${encodedSignature}`;
}
