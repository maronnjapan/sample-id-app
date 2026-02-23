import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'
import {
  generateRandomString,
  generateCodeChallenge,
  buildAuthUrl,
  exchangeCode,
  getUserInfo,
  initiateConnectedAccount,
  completeConnectedAccount,
  listConnectedAccounts,
  deleteConnectedAccount,
  type ConnectedAccount,
  exchangeTokenByRefreshToken,
} from './auth'
import { COMPLETE_CONNECT_ACCOUNT_PATH, INITIATE_CONNECT_ACCOUNT_PATH } from './const'

type Bindings = {
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_CALLBACK_URL: string
  AUTH0_CONNECT_CALLBACK_URL: string
}

interface Session {
  accessToken: string
  refreshToken?: string
  idToken: string
  userId: string
}

function getSession(sessionCookie: string | undefined): Session | null {
  if (!sessionCookie) return null
  try {
    return JSON.parse(atob(sessionCookie)) as Session
  } catch {
    return null
  }
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

// ─── Home ─────────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  return c.render(
    <div class="container center-content">
      <div class="hero">
        <div class="hero-icon">🔐</div>
        <h1>Auth0 Token Vault</h1>
        <h2>Connected Account デモ</h2>
        <p class="hero-description">
          Auth0 Token Vault を使った外部アカウント連携のクライアント実装サンプルです。
          ログイン後、Google アカウントを安全に連携できます。
        </p>
        <a href="/login" class="btn btn-primary btn-lg">
          ログインする
        </a>
      </div>

      <div class="flow-diagram">
        <h3>Token Vault の仕組み</h3>
        <div class="flow-steps">
          <div class="flow-step">
            <span class="step-num">1</span>
            <div>
              <strong>ログイン</strong>
              <p>Auth0 で認証 (PKCE フロー)</p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <span class="step-num">2</span>
            <div>
              <strong>アカウント連携</strong>
              <p>Google に OAuth 認可を要求</p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <span class="step-num">3</span>
            <div>
              <strong>Token Vault 保存</strong>
              <p>Auth0 が外部トークンを暗号化して保管</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// ─── Login (PKCE フロー開始) ───────────────────────────────────────────────────

app.get('/login', async (c) => {
  const codeVerifier = generateRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateRandomString(32)

  const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, path: '/' }
  setCookie(c, 'pkce_verifier', codeVerifier, cookieOpts)
  setCookie(c, 'oauth_state', state, cookieOpts)

  const authUrl = buildAuthUrl({
    domain: c.env.AUTH0_DOMAIN,
    clientId: c.env.AUTH0_CLIENT_ID,
    redirectUri: c.env.AUTH0_CALLBACK_URL,
    codeChallenge,
    state,
    scope: 'openid profile offline_access create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts',
    audience: `https://${c.env.AUTH0_DOMAIN}/me/`,
  })

  return c.redirect(authUrl)
})

// ─── Callback (ログイン完了) ───────────────────────────────────────────────────

app.get('/callback', async (c) => {
  const { code, state, error, error_description } = c.req.query()

  if (error) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>認証エラー</h1>
          <p class="error-code">{error}</p>
          <p>{error_description}</p>
          <a href="/" class="btn btn-secondary">トップへ戻る</a>
        </div>
      </div>
    )
  }

  const savedState = getCookie(c, 'oauth_state')
  const codeVerifier = getCookie(c, 'pkce_verifier')

  if (!code || state !== savedState || !codeVerifier) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>エラー</h1>
          <p>無効なコールバックリクエストです (state mismatch またはパラメータ不足)</p>
          <a href="/" class="btn btn-secondary">トップへ戻る</a>
        </div>
      </div>
    )
  }

  try {
    const tokens = await exchangeCode({
      domain: c.env.AUTH0_DOMAIN,
      clientId: c.env.AUTH0_CLIENT_ID,
      clientSecret: c.env.AUTH0_CLIENT_SECRET,
      code,
      codeVerifier,
      redirectUri: c.env.AUTH0_CALLBACK_URL,
    })

    const userInfo = await getUserInfo(c.env.AUTH0_DOMAIN, tokens.access_token)

    const session: Session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      userId: userInfo['sub'] as string,
    }

    setCookie(c, 'session', btoa(JSON.stringify(session)), {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 3600,
    })
    deleteCookie(c, 'pkce_verifier')
    deleteCookie(c, 'oauth_state')

    return c.redirect('/dashboard')
  } catch (err) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>認証エラー</h1>
          <p>{String(err)}</p>
          <a href="/" class="btn btn-secondary">トップへ戻る</a>
        </div>
      </div>
    )
  }
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.get('/dashboard', async (c) => {
  const session = getSession(getCookie(c, 'session'))
  if (!session) return c.redirect('/login')

  const execInfo = getCookie(c, 'exec_list')
  const execList = execInfo ? JSON.parse(execInfo) : []

  const refreshExecInfo = getCookie(c, 'refresh_exec_list')
  const refreshExecList = refreshExecInfo ? JSON.parse(refreshExecInfo) : []

  const { connected, disconnected } = c.req.query()

  let accounts: ConnectedAccount[] = []
  let fetchError: string | null = null
  try {
    accounts = await listConnectedAccounts({
      domain: c.env.AUTH0_DOMAIN,
      accessToken: session.accessToken,
    })
  } catch (err) {
    fetchError = String(err)
  }

  const googleAccount = accounts.find(a => a.connection === 'google-oauth2')

  return c.render(
    <div class="container">
      {/* ヘッダー */}
      <header class="dashboard-header">
        <div class="header-brand">
          <span class="brand-icon">🔐</span>
          <span class="brand-name">Token Vault Demo</span>
        </div>
        <a href="/logout" class="btn btn-ghost btn-sm">ログアウト</a>
      </header>

      {/* 通知 */}
      {connected && (
        <div class="alert alert-success">✅ Google アカウントの連携が完了しました。</div>
      )}
      {disconnected && (
        <div class="alert alert-info">🔓 Google アカウントの連携を解除しました。</div>
      )}
      {fetchError && (
        <div class="alert alert-error">⚠️ 連携アカウントの取得に失敗しました: {fetchError}</div>
      )}

      <div class="dashboard-grid">
        {/* Google 連携カード */}
        <div class="card" style="grid-column: 1 / -1;">
          <h2 class="card-title">🔗 外部アカウント連携 (Token Vault)</h2>
          <p class="card-description">
            連携すると Auth0 Token Vault に外部プロバイダのアクセストークンが安全に保管されます。
          </p>

          <div class="provider-grid">
            <div class={`provider-card ${googleAccount ? 'linked' : ''} `}>
              <span class="provider-icon">🔵</span>
              <div class="provider-info">
                <span class="provider-name">Google</span>
                <span class="provider-desc">Google サービスへのアクセス (google-oauth2)</span>
              </div>
              {googleAccount ? (
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                  <span class="linked-badge">✓ 連携済み</span>
                  <form method="post" action={`/connect/disconnect/${googleAccount.id}`}>
                    <button type="submit" class="btn btn-danger btn-sm">連携解除</button>
                  </form>
                </div>
              ) : (
                <a href="/connect/google-oauth2" class="btn btn-primary btn-sm" style="flex-shrink:0;">
                  連携する
                </a>
              )}
            </div>
          </div>
          {/* 実行説明 */}
          <div class="card" style="margin-top:24px;background:#f1f5f9;">
            <h2 class="card-title">アカウント連携実行ログ</h2>
            <p class="card-description">
              連携開始・完了の各ステップで、クライアントが Auth0 API に対してどのようなリクエストを送っているかを記録しています。(            <a href='https://auth0.com/docs/secure/call-apis-on-users-behalf/token-vault/connected-accounts-for-token-vault'>ドキュメント</a>)
            </p>

            {execList.length === 0 ? (
              <p style="color:#64748b;">まだAPIコールは実行されていません。</p>
            ) : (
              <ol style="padding-left:16px;color:#64748b;">
                {execList.map((exec: any, index: number) => (
                  <li key={index} style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                    <p style="font-weight:600;color:#1e293b;margin-bottom:8px;">{exec.description}</p>
                    {exec.imageUrl && (
                      <img
                        src={exec.imageUrl}
                        alt={exec.description}
                        style="max-width:100%;border-radius:8px;margin-bottom:8px;border:1px solid #e2e8f0;"
                      />
                    )}
                    <p style="margin-bottom:6px;">
                      <strong>エンドポイント：</strong>
                      <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:0.8rem;">{exec.method} {exec.endpoint}</code>
                    </p>
                    {exec.requestHeaders && (
                      <>
                        <p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストヘッダー</p>
                        <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                          {JSON.stringify(exec.requestHeaders, null, 2)}
                        </pre>
                      </>
                    )}
                    {exec.requestBody && (
                      <>
                        <p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストボディ</p>
                        <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                          {JSON.stringify(exec.requestBody, null, 2)}
                        </pre>
                      </>
                    )}
                    {exec.responseBody && (
                      <>
                        <p style="margin-bottom:4px;font-weight:600;color:#475569;">レスポンスボディ</p>
                        <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                          {JSON.stringify(exec.responseBody, null, 2)}
                        </pre>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* 連携済みアカウント詳細 */}
        {googleAccount && (
          <div class="card" style="grid-column: 1 / -1;">
            <h2 class="card-title">📋 連携アカウント詳細</h2>
            <div class="identity-item">
              <span class="identity-icon">🔵</span>
              <div class="identity-info">
                <span class="identity-provider">Google (google-oauth2)</span>
                <span class="identity-id">ID: {googleAccount.id}</span>
                <span class="identity-connection">
                  アクセスタイプ: {googleAccount.access_type}
                </span>
                <span class="identity-connection">
                  連携日時: {new Date(googleAccount.created_at).toLocaleString('ja-JP')}
                </span>
                <span class="token-status stored">✓ Token Vault に保管済み</span>
                <details style="margin-top:8px;">
                  <summary style="cursor:pointer;font-size:0.8rem;color:#64748b;">
                    付与されたスコープ ({googleAccount.scopes.length}件)
                  </summary>
                  <ul style="margin-top:6px;padding-left:16px;font-size:0.75rem;color:#64748b;">
                    {googleAccount.scopes.map(s => <li key={s}>{s}</li>)}
                  </ul>
                </details>
              </div>
            </div>
          </div>
        )}



        {/* リフレッシュトークン交換 */}
        <div class="card" style="grid-column: 1 / -1;">
          <h2 class="card-title">リフレッシュトークン交換</h2>
          <p class="card-description">
            Auth0 セッションのリフレッシュトークンを使って外部プロバイダのアクセストークンを取得します。
          </p>
          <button id="exchange-refresh-btn" class="btn btn-secondary">
            トークンを交換する
          </button>
          <pre
            id="exchange-refresh-result"
            style="display:none;margin-top:12px;padding:12px;background:#0f172a;color:#e2e8f0;border-radius:8px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;"
          />

          {/* 実行ログ */}
          <div class="card" style="margin-top:24px;background:#f1f5f9;">
            <h2 class="card-title">リフレッシュトークン交換実行ログ</h2>
            <p class="card-description">
              Auth0 リフレッシュトークンを外部プロバイダのアクセストークンへ変換するステップで、クライアントが Auth0 API に対してどのようなリクエストを送っているかを記録しています。(
              <a href='https://auth0.com/docs/secure/tokens/token-vault/refresh-token-exchange-with-token-vault'>ドキュメント</a>)
            </p>

            <div id="refresh-exec-log">
              {refreshExecList.length === 0 ? (
                <p style="color:#64748b;">まだAPIコールは実行されていません。</p>
              ) : (
                <ol style="padding-left:16px;color:#64748b;">
                  {refreshExecList.map((exec: any, index: number) => (
                    <li key={index} style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                      <p style="font-weight:600;color:#1e293b;margin-bottom:8px;">{exec.description}</p>
                      <p style="margin-bottom:6px;">
                        <strong>エンドポイント：</strong>
                        <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:0.8rem;">{exec.method} {exec.endpoint}</code>
                      </p>
                      {exec.requestHeaders && (
                        <>
                          <p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストヘッダー</p>
                          <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                            {JSON.stringify(exec.requestHeaders, null, 2)}
                          </pre>
                        </>
                      )}
                      {exec.requestBody && (
                        <>
                          <p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストボディ</p>
                          <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                            {JSON.stringify(exec.requestBody, null, 2)}
                          </pre>
                        </>
                      )}
                      {exec.responseBody && (
                        <>
                          <p style="margin-bottom:4px;font-weight:600;color:#475569;">レスポンスボディ</p>
                          <pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">
                            {JSON.stringify(exec.responseBody, null, 2)}
                          </pre>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

app.post('/exchange-refresh', async (c) => {
  const session = getSession(getCookie(c, 'session'))
  if (!session) return c.redirect('/login')

  const requestBody = {
    client_id: c.env.AUTH0_CLIENT_ID,
    client_secret: '***',
    subject_token: '(Auth0リフレッシュトークン)',
    grant_type: 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:refresh_token',
    requested_token_type: 'http://auth0.com/oauth/token-type/federated-connection-access-token',
    connection: 'google-oauth2',
  }

  try {
    const newToken = await exchangeTokenByRefreshToken({
      domain: c.env.AUTH0_DOMAIN,
      clientId: c.env.AUTH0_CLIENT_ID,
      clientSecret: c.env.AUTH0_CLIENT_SECRET,
      refreshToken: session.refreshToken!,
    })

    const execInfo = {
      description: 'リフレッシュトークンを使って外部プロバイダのアクセストークンを取得',
      method: 'POST',
      endpoint: '/oauth/token',
      requestHeaders: { 'Content-Type': 'application/json' },
      requestBody,
      responseBody: {
        access_token: `${newToken.access_token.slice(0, 20)}...`,
        scope: newToken.scope,
        expires_in: newToken.expires_in,
        issued_token_type: newToken.issued_token_type,
        token_type: newToken.token_type,
      },
    }

    setCookie(c, 'refresh_exec_list', JSON.stringify([execInfo]), {
      httpOnly: true,
      sameSite: 'Lax',
    })

    return c.json({ success: true, execInfo })
  } catch (err) {
    return c.json({ success: false, error: String(err) })
  }
})

// ─── Connected Accounts: 連携開始 (Google) ────────────────────────────────────

app.get('/connect/google-oauth2', async (c) => {
  const session = getSession(getCookie(c, 'session'))
  if (!session) return c.redirect('/login')

  const state = generateRandomString(32)

  try {
    const result = await initiateConnectedAccount({
      domain: c.env.AUTH0_DOMAIN,
      accessToken: session.accessToken,
      connection: 'google-oauth2',
      redirectUri: c.env.AUTH0_CONNECT_CALLBACK_URL,
      state,
      scopes: ['openid', 'profile'],
    })

    const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, path: '/' }
    setCookie(c, 'connect_auth_session', result.auth_session, cookieOpts)
    setCookie(c, 'connect_state', state, cookieOpts)

    const connectUrl = `${result.connect_uri}?ticket=${result.connect_params.ticket}`

    const execInitiateInfo = {
      description: 'Token Vaultの設定開始',
      method: 'POST',
      endpoint: INITIATE_CONNECT_ACCOUNT_PATH,
      imageUrl: '/images/initiate-connect-account.png',
      requestHeaders: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ログイン時に取得したアクセストークン`,
      },
      requestBody: {
        connection: 'google-oauth2',
        redirect_uri: c.env.AUTH0_CONNECT_CALLBACK_URL,
        state,
        scopes: ['openid', 'profile'],
      },
      responseBody: result,
    }

    const execTicketInfo = {
      description: 'Auth0発行の連携URLにリダイレクト',
      method: 'Redirect',
      endpoint: connectUrl,
      imageUrl: '/images/redirect-connect.png',
    }


    setCookie(c, 'exec_list', JSON.stringify([execInitiateInfo, execTicketInfo]), {
      httpOnly: true,
      sameSite: 'Lax',
    })
    return c.redirect(connectUrl)
  } catch (err) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>連携開始エラー</h1>
          <p>{String(err)}</p>
          <a href="/dashboard" class="btn btn-secondary">ダッシュボードに戻る</a>
        </div>
      </div>
    )
  }
})

// ─── Connected Accounts: 連携完了コールバック ─────────────────────────────────

app.get('/connect/callback', async (c) => {
  const session = getSession(getCookie(c, 'session'))
  if (!session) return c.redirect('/login')

  const { connect_code, state, error, error_description } = c.req.query()
  const connectCode = connect_code   // Auth0 may return either key

  if (error) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>連携エラー</h1>
          <p class="error-code">{error}</p>
          <p>{error_description}</p>
          <a href="/dashboard" class="btn btn-secondary">ダッシュボードに戻る</a>
        </div>
      </div>
    )
  }

  const savedState = getCookie(c, 'connect_state')
  const authSession = getCookie(c, 'connect_auth_session')

  if (!connectCode || state !== savedState || !authSession) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>エラー</h1>
          <p>無効なコールバックリクエストです (state mismatch またはパラメータ不足)</p>
          <a href="/dashboard" class="btn btn-secondary">ダッシュボードに戻る</a>
        </div>
      </div>
    )
  }

  try {
    await completeConnectedAccount({
      domain: c.env.AUTH0_DOMAIN,
      accessToken: session.accessToken,
      authSession,
      connectCode,
      redirectUri: c.env.AUTH0_CONNECT_CALLBACK_URL,
    })

    const preExecList = getCookie(c, 'exec_list')
    const execList = preExecList ? JSON.parse(preExecList) : []

    const execCompleteInfo = {
      description: 'connect_codeを使って、連携を完了させる',
      method: 'POST',
      endpoint: COMPLETE_CONNECT_ACCOUNT_PATH,
      imageUrl: '/images/setup-connect.png',
      requestHeaders: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ログイン時に取得したアクセストークン`,
      },
      requestBody: {
        auth_session: authSession,
        connect_code: connectCode,
        redirect_uri: c.env.AUTH0_CONNECT_CALLBACK_URL,
      },
    }
    execList.push(execCompleteInfo)
    setCookie(c, 'exec_list', JSON.stringify(execList), {
      httpOnly: true,
      sameSite: 'Lax',
    })

    deleteCookie(c, 'connect_auth_session')
    deleteCookie(c, 'connect_state')

    return c.redirect('/dashboard?connected=true')
  } catch (err) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>連携完了エラー</h1>
          <p>{String(err)}</p>
          <a href="/dashboard" class="btn btn-secondary">ダッシュボードに戻る</a>
        </div>
      </div>
    )
  }
})

// ─── Connected Accounts: 連携解除 ─────────────────────────────────────────────

app.post('/connect/disconnect/:id', async (c) => {
  const session = getSession(getCookie(c, 'session'))
  if (!session) return c.redirect('/login')

  const accountId = c.req.param('id')

  try {
    await deleteConnectedAccount({
      domain: c.env.AUTH0_DOMAIN,
      accessToken: session.accessToken,
      accountId,
    })
    deleteCookie(c, 'exec_list')
    return c.redirect('/dashboard?disconnected=true')
  } catch (err) {
    return c.render(
      <div class="container">
        <div class="error-card">
          <h1>連携解除エラー</h1>
          <p>{String(err)}</p>
          <a href="/dashboard" class="btn btn-secondary">ダッシュボードに戻る</a>
        </div>
      </div>
    )
  }
})

// ─── Logout ───────────────────────────────────────────────────────────────────

app.get('/logout', (c) => {
  deleteCookie(c, 'session')
  return c.redirect('/')
})

export default app
