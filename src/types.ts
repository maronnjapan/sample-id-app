// 共通型定義。Token Vault 風実装で使い回す。

/** 外部プロバイダーから受け取るトークン一式（正規化後） */
export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  /** epoch sec。プロバイダーが expires_in を返した場合は now+expires_in で算出 */
  access_token_exp: number;
  scope: string;
  token_type: string;
}

/** provider 差分吸収のための設定 */
export interface ProviderConfig {
  /** Auth0 のコネクション名（クライアントが指定する値） */
  connectionName: string;
  /** 内部用 provider 識別子 */
  providerKey: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  defaultScopes: string[];
  scopeSeparator: ' ' | ',';
  extraAuthParams?: Record<string, string>;
  extraTokenHeaders?: Record<string, string>;
  /** 生のトークンレスポンスを TokenSet に正規化する */
  parseTokenResponse: (raw: Record<string, unknown>) => TokenSet;
}

export type ClientType = 'regular' | 'custom_api_client';

export interface ApiClientRecord {
  client_id: string;
  client_secret_hash: string;
  client_name: string;
  client_type: ClientType;
  allowed_grant_types: string[];
  api_identifier?: string;
  created_at: string;
}

export interface RefreshTokenRecord {
  refresh_token_id: string;
  user_id: string;
  client_id: string;
  scopes: string[];
  issued_at: string;
  expires_at: number | null;
  status: 'active' | 'revoked';
}

export interface ConnectedAccountRecord {
  PK: string;
  SK: string;
  connected_account_id: string;
  connection: string;
  provider: string;
  provider_account_id: string;
  granted_scopes: string[];
  access_token_ct: string;
  refresh_token_ct: string;
  access_token_exp: number;
  access_type: 'offline' | 'online';
  created_at: string;
  updated_at: string;
  GSI1PK: string;
  GSI2PK: string;
}

export interface ConnectSessionRecord {
  ticket: string;
  auth_session: string;
  user_id: string;
  connection: string;
  redirect_uri: string;
  state: string;
  scopes: string[];
  created_at: string;
  ttl: number;
}

export interface PendingConnectionRecord {
  connect_code: string;
  user_id: string;
  connection: string;
  provider_tokens_ct: string;
  scopes: string[];
  redirect_uri: string;
  auth_session: string;
  created_at: string;
  ttl: number;
}

/** 監査ログの構造化フィールド（仕様の「監査ログ要件」に準拠） */
export interface AuditFields {
  request_id?: string;
  user_id?: string;
  client_id?: string;
  subject_token_type?: 'refresh_token' | 'access_token';
  connection?: string;
  operation?: 'connect' | 'complete' | 'exchange' | 'refresh' | 'list' | 'delete' | 'authorize' | 'callback';
  result?: 'success' | 'failure' | 'refresh_triggered' | 'reconsent_required';
  error_code?: string;
  duration_ms?: number;
}
