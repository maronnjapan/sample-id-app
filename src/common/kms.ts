// KMS Direct Encryption（Step1〜3）。token を直接 KMS:Encrypt に渡す。
// Step4 で Envelope Encryption に差し替える前提のため、I/F は文字列 in/out に固定。
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { env } from './env';

const kms = new KMSClient({});

// 暗号文を特定用途にバインドする encryption context（復号時も一致が必要）。
const ENCRYPTION_CONTEXT = { app: 'token-vault' };

/** 平文文字列を暗号化し base64 で返す。4KB 制限に注意（Direct Encryption） */
export async function kmsEncrypt(plaintext: string): Promise<string> {
  const res = await kms.send(
    new EncryptCommand({
      KeyId: env.kmsKeyId,
      Plaintext: Buffer.from(plaintext, 'utf8'),
      EncryptionContext: ENCRYPTION_CONTEXT,
    }),
  );
  if (!res.CiphertextBlob) throw new Error('kms encrypt returned empty ciphertext');
  return Buffer.from(res.CiphertextBlob).toString('base64');
}

/** base64 暗号文を復号して平文文字列を返す */
export async function kmsDecrypt(ciphertextB64: string): Promise<string> {
  const res = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertextB64, 'base64'),
      EncryptionContext: ENCRYPTION_CONTEXT,
    }),
  );
  if (!res.Plaintext) throw new Error('kms decrypt returned empty plaintext');
  return Buffer.from(res.Plaintext).toString('utf8');
}
