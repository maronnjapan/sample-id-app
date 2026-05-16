// Lambda 環境変数の集約。CDK 側でこの名前に揃えて注入する。

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env: ${name}`);
  return v;
}

export const env = {
  get tableConnectedAccounts() {
    return req('TABLE_CONNECTED_ACCOUNTS');
  },
  get tableConnectSessions() {
    return req('TABLE_CONNECT_SESSIONS');
  },
  get tablePendingConnections() {
    return req('TABLE_PENDING_CONNECTIONS');
  },
  get tableRefreshTokens() {
    return req('TABLE_REFRESH_TOKENS');
  },
  get tableApiClients() {
    return req('TABLE_API_CLIENTS');
  },
  get connectedAccountsGsi1() {
    return process.env.CONNECTED_ACCOUNTS_GSI1 ?? 'GSI1';
  },
  get connectedAccountsGsi2() {
    return process.env.CONNECTED_ACCOUNTS_GSI2 ?? 'GSI2';
  },
  get connectSessionsAuthSessionIndex() {
    return process.env.CONNECT_SESSIONS_AUTHSESSION_INDEX ?? 'AuthSessionIndex';
  },
  get kmsKeyId() {
    return req('KMS_KEY_ID');
  },
  get providerSecretName() {
    return req('PROVIDER_SECRET_NAME');
  },
  get jwtIssuer() {
    return req('JWT_ISSUER');
  },
  get myAccountAudience() {
    return req('MY_ACCOUNT_AUDIENCE');
  },
  /** 内部 provider callback のパス（API Gateway 配下） */
  get providerCallbackPath() {
    return process.env.PROVIDER_CALLBACK_PATH ?? '/_internal/provider-callback';
  },
  /** ブラウザがリダイレクトされてくる connect 入口のパス */
  get connectEntryPath() {
    return process.env.CONNECT_ENTRY_PATH ?? '/connected-accounts/connect';
  },
};
