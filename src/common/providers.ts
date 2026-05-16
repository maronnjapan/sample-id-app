// provider 差分吸収。connection 名は Auth0 のコネクション名に合わせる。
import type { ProviderConfig, TokenSet } from '../types';

function expFromExpiresIn(raw: Record<string, unknown>): number {
  const expiresIn = Number(raw.expires_in ?? 3600);
  return Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) ? expiresIn : 3600);
}

const google: ProviderConfig = {
  connectionName: 'google-oauth2',
  providerKey: 'google',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  defaultScopes: ['openid', 'profile', 'email'],
  scopeSeparator: ' ',
  extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  parseTokenResponse: (raw): TokenSet => ({
    access_token: String(raw.access_token),
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
    access_token_exp: expFromExpiresIn(raw),
    scope: String(raw.scope ?? ''),
    token_type: String(raw.token_type ?? 'Bearer'),
  }),
};

const slack: ProviderConfig = {
  connectionName: 'slack',
  providerKey: 'slack',
  authorizationEndpoint: 'https://slack.com/oauth/v2/authorize',
  tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
  defaultScopes: ['openid', 'profile'],
  scopeSeparator: ',',
  parseTokenResponse: (raw): TokenSet => {
    // Slack は authed_user.access_token に user token が入るケースがある。
    const authedUser = (raw.authed_user as Record<string, unknown> | undefined) ?? {};
    const accessToken = String(raw.access_token ?? authedUser.access_token ?? '');
    return {
      access_token: accessToken,
      refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
      access_token_exp: expFromExpiresIn(raw),
      scope: String(raw.scope ?? authedUser.scope ?? ''),
      token_type: String(raw.token_type ?? 'Bearer'),
    };
  },
};

const github: ProviderConfig = {
  connectionName: 'github',
  providerKey: 'github',
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  defaultScopes: ['read:user'],
  scopeSeparator: ',',
  // GitHub はデフォルトで form-encoded を返すため Accept ヘッダで JSON を強制する。
  extraTokenHeaders: { Accept: 'application/json' },
  parseTokenResponse: (raw): TokenSet => ({
    access_token: String(raw.access_token),
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
    // GitHub の OAuth App トークンは無期限のことが多い。1年先を仮の exp にする。
    access_token_exp: raw.expires_in
      ? expFromExpiresIn(raw)
      : Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    scope: String(raw.scope ?? ''),
    token_type: String(raw.token_type ?? 'Bearer'),
  }),
};

const byConnection: Record<string, ProviderConfig> = {
  [google.connectionName]: google,
  [slack.connectionName]: slack,
  [github.connectionName]: github,
};

export function getProvider(connection: string): ProviderConfig | undefined {
  return byConnection[connection];
}

export function listProviders(): ProviderConfig[] {
  return Object.values(byConnection);
}
