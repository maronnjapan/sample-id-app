// Auth0 互換のための固定文字列。

export const GRANT_TYPE_TOKEN_EXCHANGE =
  'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token';

export const SUBJECT_TOKEN_TYPE_REFRESH = 'urn:ietf:params:oauth:token-type:refresh_token';
export const SUBJECT_TOKEN_TYPE_ACCESS = 'urn:ietf:params:oauth:token-type:access_token';

export const TOKEN_TYPE_FEDERATED_CONNECTION =
  'http://auth0.com/oauth/token-type/federated-connection-access-token';

/** access token の有効期限がこの秒数以内なら事前に refresh する */
export const REFRESH_SKEW_SEC = 120;

export const SESSION_TTL_SEC = 300;
