/**
 * Step1 検証用シードスクリプト。
 * ApiClients / RefreshTokens を投入し、任意で ConnectedAccounts を
 * KMS 暗号化付きで投入する（「手動で DynamoDB に投入してまず動かす」用）。
 *
 *   AWS_REGION=ap-northeast-1 npx tsx scripts/seed.ts \
 *     --client-id demo-client --client-secret demo-secret \
 *     --user-id 'auth0|test-user' --refresh-token 'rt_dummy_value' \
 *     --kms-key-arn arn:aws:kms:...:key/xxxx \
 *     --google-access-token ya29.xxx --google-refresh-token 1//xxx
 *
 * google-access-token / refresh-token / kms-key-arn を省略すると
 * ApiClient と RefreshToken のみ投入する。
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import { hashClientSecret } from '../src/common/clients';
import { hashRefreshToken, generateConnectedAccountId } from '../src/common/ids';
import { GRANT_TYPE_TOKEN_EXCHANGE } from '../src/common/constants';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const region = process.env.AWS_REGION ?? arg('region', 'ap-northeast-1');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const kms = new KMSClient({ region });

  const apiClientsTable = arg('api-clients-table', 'ApiClients');
  const refreshTokensTable = arg('refresh-tokens-table', 'RefreshTokens');
  const connectedAccountsTable = arg('connected-accounts-table', 'ConnectedAccounts');

  const clientId = arg('client-id', 'demo-client');
  const clientSecret = arg('client-secret', 'demo-secret');
  const clientType = arg('client-type', 'regular') as 'regular' | 'custom_api_client';
  const apiIdentifier = optional('api-identifier');
  const userId = arg('user-id', 'auth0|test-user');
  const refreshTokenValue = arg('refresh-token', 'rt_dummy_value');
  const connection = arg('connection', 'google-oauth2');
  const provider = arg('provider', 'google');
  const nowIso = new Date().toISOString();

  await doc.send(
    new PutCommand({
      TableName: apiClientsTable,
      Item: {
        client_id: clientId,
        client_secret_hash: hashClientSecret(clientSecret),
        client_name: 'seed demo client',
        client_type: clientType,
        allowed_grant_types: ['refresh_token', GRANT_TYPE_TOKEN_EXCHANGE],
        api_identifier: apiIdentifier,
        created_at: nowIso,
      },
    }),
  );
  console.log(`[ok] ApiClients <- ${clientId} (${clientType})`);

  await doc.send(
    new PutCommand({
      TableName: refreshTokensTable,
      Item: {
        refresh_token_id: hashRefreshToken(refreshTokenValue),
        user_id: userId,
        client_id: clientId,
        scopes: ['offline_access', 'openid'],
        issued_at: nowIso,
        expires_at: null,
        status: 'active',
      },
    }),
  );
  console.log(`[ok] RefreshTokens <- ${userId} (hash of provided refresh token)`);

  const accessToken = optional('google-access-token');
  const refreshToken = optional('google-refresh-token');
  const kmsKeyArn = optional('kms-key-arn');
  if (accessToken && refreshToken && kmsKeyArn) {
    const enc = async (plaintext: string): Promise<string> => {
      const res = await kms.send(
        new EncryptCommand({
          KeyId: kmsKeyArn,
          Plaintext: Buffer.from(plaintext, 'utf8'),
          EncryptionContext: { app: 'token-vault' },
        }),
      );
      return Buffer.from(res.CiphertextBlob as Uint8Array).toString('base64');
    };
    const cacId = generateConnectedAccountId();
    const expSec =
      Number(optional('access-token-exp') ?? '0') ||
      Math.floor(Date.now() / 1000) + 3600;
    await doc.send(
      new PutCommand({
        TableName: connectedAccountsTable,
        Item: {
          PK: `USER#${userId}`,
          SK: `CAC#${cacId}`,
          connected_account_id: cacId,
          connection,
          provider,
          provider_account_id: `${connection}|seed`,
          granted_scopes: ['openid', 'https://www.googleapis.com/auth/calendar'],
          access_token_ct: await enc(accessToken),
          refresh_token_ct: await enc(refreshToken),
          access_token_exp: expSec,
          access_type: 'offline',
          created_at: nowIso,
          updated_at: nowIso,
          GSI1PK: `USER#${userId}#CONN#${connection}`,
          GSI2PK: `CONN#${connection}#ACCOUNT#${connection}|seed`,
        },
      }),
    );
    console.log(`[ok] ConnectedAccounts <- ${cacId} (${connection})`);
  } else {
    console.log('[skip] ConnectedAccounts (google tokens / kms-key-arn 未指定)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
