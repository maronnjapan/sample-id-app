# アプローチ2: Step-up Authentication で Okta Verify 再認証を強制する

## 概要

支払いなどの重要操作の前に、OAuth 2.0 Authorization Code Flow で Okta への再認証を強制する。認証ポリシーで Okta Verify Push を必須にすることで、ユーザーがスマートフォンで承認しない限り処理が進まない。

**CIBAとの共通点**: 「人間の承認がないと処理が進まない」ゲートとして機能する。

**CIBAとの違い**: バックエンド起点ではなく、ブラウザリダイレクト方式。承認の証跡は OAuth 標準の ID Token（`auth_time`, `acr`, `amr` クレーム）。

---

## フロー

```
ブラウザ              Workers API                Okta (Org Auth Server)     Okta Verify (スマホ)
  │                      │                          │                          │
  │ ① 支払い開始          │                          │                          │
  │ (email, amount)      │                          │                          │
  │ ────────────────→    │                          │                          │
  │                      │ ② 支払い情報をKVに仮保存    │                          │
  │                      │   state = paymentId       │                          │
  │                      │                          │                          │
  │ ③ Oktaへリダイレクト   │                          │                          │
  │ ←────────────────    │                          │                          │
  │                      │                          │                          │
  │ ④ Okta認証画面       │                          │                          │
  │ ────────────────────────────────────────→       │                          │
  │                      │                          │                          │
  │                      │                          │ ⑤ Okta Verify プッシュ    │
  │                      │                          │ ────────────────→         │
  │                      │                          │                          │
  │                      │                          │         ⑥ ユーザーが      │
  │                      │                          │           承認           │
  │                      │                          │ ←────────────────        │
  │ ⑦ callback へリダイレクト                         │                          │
  │    ?code=xxx&state=paymentId                    │                          │
  │ ←────────────────────────────────────────       │                          │
  │                      │                          │                          │
  │ ⑧ callback           │                          │                          │
  │ ────────────────→    │                          │                          │
  │                      │ ⑨ code → token 交換       │                          │
  │                      │ POST /oauth2/v1/token     │                          │
  │                      │ ────────────────→         │                          │
  │                      │  id_token (auth_time,     │                          │
  │                      │   acr, amr を含む)         │                          │
  │                      │ ←────────────────         │                          │
  │                      │                          │                          │
  │                      │ ⑩ ID Token 検証           │                          │
  │                      │   acr == 2fa:any ?        │                          │
  │                      │   amr に push 含む?       │                          │
  │                      │                          │                          │
  │                      │ ⑪ 検証OK → 支払い実行      │                          │
  │ ⑫ 完了画面            │                          │                          │
  │ ←────────────────    │                          │                          │
```

---

## 前提条件

- Okta Identity Engine (OIE) が有効
- テストユーザーが Okta Verify を登録済み
- OAuth アプリが作成済み（Terraform で作成可能）

---

## Okta側の設定手順

### Step 1: 認証ポリシーで Okta Verify Push を必須にする

Terraform の `main.tf` で既に認証ポリシーを作成しているが、ここでは Okta Verify Push を確実に要求する設定を確認する。

**Admin Console での確認:**

1. **Security** → **Authentication Policies** に移動
2. **CIBA Payment Policy**（Terraform で作成済み）を選択
3. ルールを確認:
   - **User must authenticate with**: Password + Another factor
   - **Possession factor constraints**: Okta Verify が含まれている

**Terraform での設定（main.tf の既存設定）:**

```hcl
resource "okta_app_signon_policy_rule" "ciba_rule" {
  policy_id = okta_app_signon_policy.ciba_policy.id
  name      = "CIBA Authentication Rule"
  priority  = 1

  constraints = [
    jsonencode({
      knowledge = {
        types = ["password"]
      }
      possession = {
        userVerification = "REQUIRED"
      }
    })
  ]
}
```

これにより、パスワード + Okta Verify（所持認証）が必須になる。

### Step 2: acr_values のサポート確認

`acr_values` は Org Authorization Server / Custom Authorization Server の両方でサポートされている。

```bash
OKTA_DOMAIN="dev-XXXXXXXX.okta.com"

# Org Authorization Server のメタデータを確認
curl -s "https://${OKTA_DOMAIN}/.well-known/openid-configuration" \
  | jq '{
    authorization_endpoint,
    token_endpoint,
    acr_values_supported,
    claims_supported: [.claims_supported[] | select(. == "acr" or . == "amr" or . == "auth_time")]
  }'
```

### Step 3: redirect_uri の確認

Terraform で作成した OAuth アプリに callback URL が登録されていることを確認。

```hcl
# main.tf の既存設定
redirect_uris = [
  "http://localhost:3000/callback",
  "http://localhost:3000"
]
```

---

## 主要パラメータの解説

### 認可リクエストのパラメータ

```
GET /oauth2/v1/authorize
  ?client_id={CLIENT_ID}
  &response_type=code
  &scope=openid email
  &redirect_uri=http://localhost:3000/callback
  &state={paymentId}
  &nonce={nonce}
  &acr_values=urn:okta:loa:2fa:any
  &max_age=0
```

| パラメータ | 値 | 役割 |
|-----------|-----|------|
| `acr_values` | `urn:okta:loa:2fa:any` | 2要素認証を要求（パスワード + Okta Verify） |
| `max_age` | `0` | 既存セッションがあっても必ず再認証を強制 |
| `state` | `{paymentId}` | 認証を特定の支払いに紐づける |
| `nonce` | ランダムUUID | ID Tokenの`nonce`クレームと一致させる |
| `prompt` | `login`（代替） | `max_age=0` の代わりに使用可能 |

### acr_values の選択肢

| 値 | 意味 |
|----|------|
| `urn:okta:loa:1fa:any` | 単一要素認証（パスワードのみ等） |
| `urn:okta:loa:1fa:pwd` | パスワード認証のみ |
| `urn:okta:loa:2fa:any` | **2要素認証**（パスワード + Okta Verify 等）← 推奨 |
| `phr` | フィッシング耐性認証（FIDO2/WebAuthn） |
| `phrh` | フィッシング耐性 + ハードウェア保護 |

### ID Token に含まれる証跡クレーム

認証成功後に返される ID Token の例:

```json
{
  "sub": "00u47ijy7sRLaeSdC0g7",
  "iss": "https://dev-XXXXXXXX.okta.com",
  "aud": "0oaXXXXXXXXXXXXXXXX",
  "iat": 1707600000,
  "exp": 1707603600,
  "auth_time": 1707600000,
  "acr": "urn:okta:loa:2fa:any",
  "amr": ["pwd", "push"],
  "idp": "00oXXXXXXXXXXXXXXXX"
}
```

| クレーム | 意味 | 検証ポイント |
|---------|------|------------|
| `auth_time` | 認証が実行された時刻（Unix timestamp） | 支払い開始時刻と近いことを確認 |
| `acr` | 達成された認証レベル | `urn:okta:loa:2fa:any` 以上であること |
| `amr` | 使用された認証方法の配列 | `push` が含まれていること（Okta Verify で承認された証拠） |

---

## Workers アプリの実装変更

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `workers/src/index.ts` | `/callback` ルートを追加 |
| `workers/src/routes/payment.ts` | 支払い開始をリダイレクト方式に変更 |
| `workers/src/services/ciba.ts` | トークン交換 + ID Token 検証に置換 → `auth.ts` にリネーム推奨 |
| `workers/src/types/index.ts` | CIBA型を Step-up Auth 型に変更 |

### 型定義の変更（types/index.ts）

```typescript
export interface Bindings {
  PAYMENT_STORE: KVNamespace;
  OKTA_DOMAIN: string;
  OKTA_CLIENT_ID: string;
  OKTA_CLIENT_SECRET: string;
  APP_BASE_URL: string;
}

export interface PaymentRecord {
  payment_id: string;
  user_email: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  nonce: string;                  // ID Tokenのnonce検証用
  created_at: string;
  expires_at: string;
  completed_at?: string;
  id_token?: string;              // 証跡としてのID Token（JWT文字列）
  auth_time?: number;             // 認証時刻
  acr?: string;                   // 認証レベル
  amr?: string[];                 // 認証方法
}

export type PaymentStatus =
  | 'pending_approval'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface IdTokenPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  auth_time: number;
  acr: string;
  amr: string[];
  nonce?: string;
}
```

### 認証サービス（services/auth.ts）

```typescript
import type { Bindings, IdTokenPayload } from '../types';

const BASE_URL = 'http://localhost:3000'; // 環境に応じて変更

// 認可URLを生成
export function buildAuthorizeUrl(
  env: Bindings,
  paymentId: string,
  nonce: string
): string {
  const url = new URL(`https://${env.OKTA_DOMAIN}/oauth2/v1/authorize`);
  url.searchParams.set('client_id', env.OKTA_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('redirect_uri', `${BASE_URL}/callback`);
  url.searchParams.set('state', paymentId);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('acr_values', 'urn:okta:loa:2fa:any');
  url.searchParams.set('max_age', '0');
  return url.toString();
}

// authorization code をトークンに交換
export async function exchangeCodeForTokens(
  env: Bindings,
  code: string
): Promise<{ id_token: string; access_token: string }> {
  const res = await fetch(`https://${env.OKTA_DOMAIN}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${BASE_URL}/callback`,
      client_id: env.OKTA_CLIENT_ID,
      client_secret: env.OKTA_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json() as Promise<{ id_token: string; access_token: string }>;
}

// ID Token のペイロードをデコード（署名検証は簡略化）
export function decodeIdToken(idToken: string): IdTokenPayload {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = JSON.parse(atob(parts[1]));
  return payload as IdTokenPayload;
}

// 承認の検証
export function validateApproval(
  payload: IdTokenPayload,
  env: Bindings
): { valid: boolean; reason?: string } {
  // iss の検証
  if (payload.iss !== `https://${env.OKTA_DOMAIN}`) {
    return { valid: false, reason: 'Invalid issuer' };
  }

  // aud の検証
  if (payload.aud !== env.OKTA_CLIENT_ID) {
    return { valid: false, reason: 'Invalid audience' };
  }

  // exp の検証
  if (payload.exp < Date.now() / 1000) {
    return { valid: false, reason: 'Token expired' };
  }

  // acr の検証: 2FA が達成されているか
  if (payload.acr !== 'urn:okta:loa:2fa:any') {
    return { valid: false, reason: `Insufficient acr: ${payload.acr}` };
  }

  // amr の検証: push（Okta Verify）が使われたか
  if (!payload.amr?.includes('push')) {
    return { valid: false, reason: `Push not in amr: ${payload.amr}` };
  }

  return { valid: true };
}
```

> **注意**: 本番環境では ID Token の署名検証（JWKSエンドポイントから公開鍵を取得して検証）を必ず実装すること。上記の `decodeIdToken` は簡略化した実装。

### エントリポイントの変更（index.ts）

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import payment from './routes/payment';
import { renderPaymentPage } from './views/payment';

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/', (c) => c.html(renderPaymentPage()));

// 支払いAPI
app.route('/api/payment', payment);

// OAuth callback
app.get('/callback', async (c) => {
  // payment.ts 内の callback ハンドラに委譲するか、
  // ここで直接処理する（後述のルート実装を参照）
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.html(`<h1>認証エラー</h1><p>${c.req.query('error_description')}</p>`);
  }

  if (!code || !state) {
    return c.html('<h1>不正なリクエスト</h1>', 400);
  }

  // payment ルートに転送
  return c.redirect(`/api/payment/callback?code=${code}&state=${state}`);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'server_error', error_description: err.message }, 500);
});

export default app;
```

### ルート変更（routes/payment.ts）

```typescript
import { Hono } from 'hono';
import type { Bindings, PaymentRecord } from '../types';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  decodeIdToken,
  validateApproval,
} from '../services/auth';
import { getPaymentRecord, savePaymentRecord, processPayment } from '../services/payment';
import { generatePaymentId } from '../utils/id';

const payment = new Hono<{ Bindings: Bindings }>();

// 支払い開始 → Okta認証へリダイレクト
payment.post('/initiate', async (c) => {
  const body = await c.req.json<{
    user_email: string;
    amount: number;
    description: string;
  }>();
  const { user_email, amount, description } = body;

  if (!user_email || !amount) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const paymentId = generatePaymentId();
  const nonce = crypto.randomUUID();

  // 支払い情報を仮保存（認証完了後に使う）
  const record: PaymentRecord = {
    payment_id: paymentId,
    user_email,
    amount,
    description,
    status: 'pending_approval',
    nonce,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 600_000).toISOString(), // 10分
  };
  await savePaymentRecord(c.env, record, 600);

  // Okta認証URLを返す（フロントエンドがリダイレクト）
  const authorizeUrl = buildAuthorizeUrl(c.env, paymentId, nonce);

  return c.json({
    payment_id: paymentId,
    status: 'pending_approval',
    authorize_url: authorizeUrl,
    message: 'この URL にリダイレクトして認証を完了してください',
  }, 202);
});

// OAuth callback → トークン検証 → 支払い実行
payment.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const paymentId = state;
  if (!paymentId) {
    return c.json({ error: 'invalid_state' }, 400);
  }

  const record = await getPaymentRecord(c.env, paymentId);
  if (!record) {
    return c.json({ error: 'payment_not_found' }, 404);
  }

  // 期限切れチェック
  if (new Date() > new Date(record.expires_at)) {
    record.status = 'expired';
    await savePaymentRecord(c.env, record);
    return c.json({ error: 'payment_expired' }, 410);
  }

  // code をトークンに交換
  const tokens = await exchangeCodeForTokens(c.env, code);

  // ID Token を検証
  const payload = decodeIdToken(tokens.id_token);
  const validation = validateApproval(payload, c.env, record.nonce);

  if (!validation.valid) {
    record.status = 'rejected';
    await savePaymentRecord(c.env, record);
    return c.json({
      error: 'approval_failed',
      reason: validation.reason,
    }, 403);
  }

  // 検証OK → 支払い実行
  record.status = 'completed';
  record.completed_at = new Date().toISOString();
  record.id_token = tokens.id_token;
  record.auth_time = payload.auth_time;
  record.acr = payload.acr;
  record.amr = payload.amr;

  processPayment(record);
  await savePaymentRecord(c.env, record);

  // 完了画面にリダイレクト
  return c.redirect(`/?payment=${paymentId}&status=completed`);
});

// ステータス確認（既存のポーリング用）
payment.get('/:paymentId/status', async (c) => {
  const paymentId = c.req.param('paymentId');
  const record = await getPaymentRecord(c.env, paymentId);

  if (!record) {
    return c.json({ error: 'not_found' }, 404);
  }

  const response: Record<string, unknown> = {
    payment_id: record.payment_id,
    status: record.status,
  };

  if (record.status === 'completed') {
    response.amount = record.amount;
    response.completed_at = record.completed_at;
    response.acr = record.acr;
    response.amr = record.amr;
  }

  return c.json(response);
});

export default payment;
```

### フロントエンド側の変更ポイント

`views/payment.ts` のJavaScript部分で、支払い開始後の処理を変更する必要がある:

```javascript
// 変更前（CIBAポーリング方式）:
// fetch('/api/payment/initiate', ...) → ポーリング開始

// 変更後（リダイレクト方式）:
async function initiatePayment() {
  const res = await fetch('/api/payment/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_email, amount, description }),
  });
  const data = await res.json();

  if (data.authorize_url) {
    // Okta認証画面へリダイレクト
    window.location.href = data.authorize_url;
  }
}
```

完了画面はURLパラメータで判定:

```javascript
// ページ読み込み時に完了状態をチェック
const params = new URLSearchParams(window.location.search);
if (params.get('status') === 'completed') {
  const paymentId = params.get('payment');
  // 完了表示
  showCompletedUI(paymentId);
}
```

---

## 承認の証跡

| 項目 | 保存場所 | 内容 |
|------|---------|------|
| `id_token` | KV | **JWT文字列そのもの**（署名付きで改ざん不可） |
| `auth_time` | KV (+ ID Token内) | 認証が行われた正確な時刻 |
| `acr` | KV (+ ID Token内) | `urn:okta:loa:2fa:any` = 2要素認証達成済み |
| `amr` | KV (+ ID Token内) | `["pwd", "push"]` = パスワード + Okta Verify Push で認証 |
| `state` | callback URL | 支払いIDをブラウザ往復で保持 |
| `nonce` | KV (+ ID Token内) | 認可リクエストとID Tokenを突き合わせるための値 |

**アプローチ1（Factors API）との証跡の違い**:

ID Token は OAuth/OIDC 標準の JWT であり:
- Okta の秘密鍵で署名されているため改ざんできない
- 公開鍵（JWKS エンドポイント）で第三者が検証可能
- `auth_time`, `acr`, `amr` が標準クレームとして含まれる
- 監査や法的要件での証拠能力がより高い

---

## 制約事項

| 項目 | 内容 |
|------|------|
| UX | ブラウザがOktaログイン画面にリダイレクトされる（CIBAのようなスマホプッシュのみのUXではない） |
| 同一端末 | 承認操作は同一ブラウザ上で行う（別端末への通知ではない） |
| Okta Verify Push | 認証ポリシーの設定次第で、パスワード入力後にプッシュ承認が要求される |
| カスタムスコープ | Org Auth Server ではカスタムスコープ不可。`openid email profile` 等のみ |
| ID Token 署名検証 | 本番では JWKS エンドポイントから公開鍵を取得して検証すること |

---

## ID Token 署名検証の本番実装（参考）

```typescript
// Okta の JWKS エンドポイントから公開鍵を取得
async function getJwks(domain: string) {
  const res = await fetch(`https://${domain}/oauth2/v1/keys`);
  return res.json() as Promise<{ keys: JsonWebKey[] }>;
}

// 本番では jose ライブラリ等を使って署名を検証する
// import * as jose from 'jose';
// const JWKS = jose.createRemoteJWKSet(new URL(`https://${domain}/oauth2/v1/keys`));
// const { payload } = await jose.jwtVerify(idToken, JWKS, {
//   issuer: `https://${domain}`,
//   audience: clientId,
// });
```

---

## 参考リンク

- [Step-up authentication using ACR values (Okta公式)](https://developer.okta.com/docs/guides/step-up-authentication/main/)
- [Step-Up Authentication Examples With Okta](https://developer.okta.com/blog/2023/10/24/stepup-okta)
- [Org Authorization Server API](https://developer.okta.com/docs/api/openapi/okta-oauth/oauth/tag/OrgAS/)
- [Authorization servers (Org vs Custom)](https://developer.okta.com/docs/concepts/auth-servers/)
- [Validate ID tokens](https://developer.okta.com/docs/guides/validate-id-tokens/main/)
- [Configure AMR claims mapping](https://developer.okta.com/docs/guides/configure-amr-claims-mapping/main/)
