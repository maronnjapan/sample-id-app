# アプローチ1: Factors API で Okta Verify プッシュ承認を実現する

## 概要

Okta Management API の Factors API を使い、バックエンドから直接 Okta Verify へプッシュ通知を送信する。ユーザーがスマートフォン上で承認/拒否するまで処理を進めない。

**CIBAとの共通点**: 「バックエンド起点 → スマホにプッシュ → ポーリングで確認」という構造が同じ。

**CIBAとの違い**: OAuth トークンは返らない。Factors API のトランザクション結果（SUCCESS/REJECTED/TIMEOUT）が承認の証跡になる。

---

## フロー

```
ブラウザ              Workers API                    Okta Management API         Okta Verify (スマホ)
  │                      │                               │                          │
  │ ① 支払い開始          │                               │                          │
  │ (email, amount)      │                               │                          │
  │ ────────────────→    │                               │                          │
  │                      │ ② ユーザーID取得               │                          │
  │                      │ GET /api/v1/users/{login}      │                          │
  │                      │ ────────────────→              │                          │
  │                      │                               │                          │
  │                      │ ③ Push Factor ID 取得          │                          │
  │                      │ GET /api/v1/users/{id}/factors │                          │
  │                      │ ────────────────→              │                          │
  │                      │                               │                          │
  │                      │ ④ プッシュ通知送信              │                          │
  │                      │ POST /factors/{id}/verify      │                          │
  │                      │ ────────────────→              │                          │
  │                      │                               │ ⑤ プッシュ通知             │
  │                      │  transactionId                │ ────────────────→         │
  │                      │ ←────────────────             │                          │
  │ ⑥ pending            │                               │                          │
  │ ←────────────────    │                               │         ⑦ ユーザーが      │
  │                      │                               │           承認/拒否       │
  │ ⑧ ポーリング          │                               │                          │
  │ GET /status          │                               │                          │
  │ ────────────────→    │ ⑨ トランザクション確認           │                          │
  │                      │ GET /transactions/{id}         │                          │
  │                      │ ────────────────→              │                          │
  │                      │  factorResult: SUCCESS         │                          │
  │                      │ ←────────────────             │                          │
  │                      │                               │                          │
  │                      │ ⑩ 承認確認 → 支払い実行         │                          │
  │ ⑪ completed          │                               │                          │
  │ ←────────────────    │                               │                          │
```

---

## 前提条件

- Okta Identity Engine (OIE) が有効
- テストユーザーが Okta Verify を登録済み（Push notification 有効）
- Okta API Token（SSWS）を発行済み

---

## Okta側の設定手順

### Step 1: Okta Verify Authenticator の確認

1. Okta Admin Console → **Security** → **Authenticators**
2. **Okta Verify** が有効であることを確認
3. **Actions** → **Edit** で以下を確認:
   - **Push notification**: 有効
   - **Number challenge**: 有効（推奨、フィッシング対策）

### Step 2: テストユーザーの Okta Verify 登録

1. テストユーザーでOktaにブラウザからログイン
2. Okta Verify のセットアップを完了（QRコードスキャン）
3. 再ログインしてプッシュ通知が届くことを確認

### Step 3: API Token の発行

1. Okta Admin Console → **Security** → **API** → **Tokens**
2. **Create Token** をクリック
3. トークン名を入力して作成
4. 表示されたトークンを控える（一度しか表示されない）

### Step 4: ユーザーの Push Factor ID を確認

```bash
OKTA_DOMAIN="dev-XXXXXXXX.okta.com"
OKTA_API_TOKEN="00xxxxxxxxxx"
USER_LOGIN="example@example.com"

# ユーザーIDを取得
USER_ID=$(curl -s "https://${OKTA_DOMAIN}/api/v1/users/${USER_LOGIN}" \
  -H "Authorization: SSWS ${OKTA_API_TOKEN}" | jq -r '.id')
echo "USER_ID: ${USER_ID}"

# Push Factor を取得
curl -s "https://${OKTA_DOMAIN}/api/v1/users/${USER_ID}/factors" \
  -H "Authorization: SSWS ${OKTA_API_TOKEN}" \
  | jq '.[] | select(.factorType == "push") | {id, factorType, provider, status}'
```

期待される出力:

```json
{
  "id": "opfXXXXXXXXXXXXXXX",
  "factorType": "push",
  "provider": "OKTA",
  "status": "ACTIVE"
}
```

### Step 5: プッシュ送信のテスト

```bash
FACTOR_ID="opfXXXXXXXXXXXXXXX"

# プッシュ通知を送信（空ボディ）
VERIFY_RESPONSE=$(curl -s -X POST \
  "https://${OKTA_DOMAIN}/api/v1/users/${USER_ID}/factors/${FACTOR_ID}/verify" \
  -H "Authorization: SSWS ${OKTA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Content-Length: 0")

echo "$VERIFY_RESPONSE" | jq .
```

期待される出力（202 Accepted）:

```json
{
  "expiresAt": "2026-02-11T06:10:00.000Z",
  "factorResult": "WAITING",
  "_links": {
    "poll": {
      "href": "https://dev-XXXXXXXX.okta.com/api/v1/users/{userId}/factors/{factorId}/transactions/{transactionId}",
      "hints": { "allow": ["GET"] }
    },
    "cancel": {
      "href": "https://dev-XXXXXXXX.okta.com/api/v1/users/{userId}/factors/{factorId}/transactions/{transactionId}",
      "hints": { "allow": ["DELETE"] }
    }
  }
}
```

この時点でスマートフォンの Okta Verify にプッシュ通知が届く。

### Step 6: ポーリングで結果を確認

```bash
# _links.poll.href から取得したURL
POLL_URL="https://${OKTA_DOMAIN}/api/v1/users/${USER_ID}/factors/${FACTOR_ID}/transactions/{transactionId}"

curl -s "${POLL_URL}" \
  -H "Authorization: SSWS ${OKTA_API_TOKEN}" | jq .
```

| factorResult | 意味 |
|-------------|------|
| `WAITING` | ユーザーが未操作 |
| `SUCCESS` | 承認された |
| `REJECTED` | 拒否された |
| `TIMEOUT` | 期限切れ |

---

## Workers アプリの実装変更

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `workers/src/services/ciba.ts` | Factors API 呼び出しに置き換え → `factors.ts` にリネーム推奨 |
| `workers/src/routes/payment.ts` | CIBA関数の呼び出し先を変更 |
| `workers/src/types/index.ts` | CIBA型をFactors API型に変更 |
| `workers/wrangler.toml` | `OKTA_API_TOKEN` を環境変数に追加 |

### 型定義の変更（types/index.ts）

```typescript
export interface Bindings {
  PAYMENT_STORE: KVNamespace;
  OKTA_DOMAIN: string;
  OKTA_CLIENT_ID: string;
  OKTA_CLIENT_SECRET: string;
  OKTA_API_TOKEN: string;        // 追加
}

export interface PaymentRecord {
  payment_id: string;
  user_email: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  // auth_req_id: string;        // 削除（CIBA用）
  user_id: string;               // 追加
  factor_id: string;             // 追加
  transaction_id: string;        // 追加
  poll_url: string;              // 追加
  created_at: string;
  expires_at: string;
  completed_at?: string;
  approval_result?: FactorResult; // 追加（証跡）
}

export type FactorResult = 'WAITING' | 'SUCCESS' | 'REJECTED' | 'TIMEOUT';

export interface FactorVerifyResponse {
  expiresAt: string;
  factorResult: FactorResult;
  _links: {
    poll: { href: string };
    cancel: { href: string };
  };
}

export interface FactorPollResponse {
  expiresAt: string;
  factorResult: FactorResult;
}
```

### Factors サービス（services/factors.ts）

```typescript
import type { Bindings, FactorVerifyResponse, FactorPollResponse } from '../types';

// ユーザーIDを取得
export async function getUserId(env: Bindings, email: string): Promise<string> {
  const res = await fetch(
    `https://${env.OKTA_DOMAIN}/api/v1/users/${encodeURIComponent(email)}`,
    { headers: { Authorization: `SSWS ${env.OKTA_API_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`User not found: ${email}`);
  const user = (await res.json()) as { id: string };
  return user.id;
}

// Push Factor ID を取得
export async function getPushFactorId(env: Bindings, userId: string): Promise<string> {
  const res = await fetch(
    `https://${env.OKTA_DOMAIN}/api/v1/users/${userId}/factors`,
    { headers: { Authorization: `SSWS ${env.OKTA_API_TOKEN}` } }
  );
  if (!res.ok) throw new Error('Failed to list factors');
  const factors = (await res.json()) as Array<{
    id: string;
    factorType: string;
    status: string;
  }>;
  const push = factors.find(f => f.factorType === 'push' && f.status === 'ACTIVE');
  if (!push) throw new Error('No active push factor found for user');
  return push.id;
}

// プッシュ通知を送信
export async function sendPushVerification(
  env: Bindings,
  userId: string,
  factorId: string
): Promise<FactorVerifyResponse> {
  const res = await fetch(
    `https://${env.OKTA_DOMAIN}/api/v1/users/${userId}/factors/${factorId}/verify`,
    {
      method: 'POST',
      headers: {
        Authorization: `SSWS ${env.OKTA_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': '0',
      },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Push verification failed: ${err}`);
  }
  return res.json() as Promise<FactorVerifyResponse>;
}

// トランザクションをポーリング
export async function pollTransaction(
  env: Bindings,
  pollUrl: string
): Promise<FactorPollResponse> {
  const res = await fetch(pollUrl, {
    headers: { Authorization: `SSWS ${env.OKTA_API_TOKEN}` },
  });
  if (!res.ok) throw new Error('Poll failed');
  return res.json() as Promise<FactorPollResponse>;
}
```

### ルート変更（routes/payment.ts）

```typescript
import { Hono } from 'hono';
import type { Bindings, PaymentRecord } from '../types';
import {
  getUserId,
  getPushFactorId,
  sendPushVerification,
  pollTransaction,
} from '../services/factors';
import { getPaymentRecord, savePaymentRecord, processPayment } from '../services/payment';
import { generatePaymentId } from '../utils/id';

const payment = new Hono<{ Bindings: Bindings }>();

// 支払い開始
payment.post('/initiate', async (c) => {
  const body = await c.req.json<{
    user_email: string;
    amount: number;
    description: string;
  }>();
  const { user_email, amount, description } = body;

  if (!user_email || !amount) {
    return c.json({ error: 'invalid_request', error_description: 'user_email and amount are required' }, 400);
  }

  // ユーザーID と Push Factor ID を取得
  const userId = await getUserId(c.env, user_email);
  const factorId = await getPushFactorId(c.env, userId);

  // プッシュ通知を送信
  const verifyResponse = await sendPushVerification(c.env, userId, factorId);

  // 支払いレコード作成
  const paymentId = generatePaymentId();
  const record: PaymentRecord = {
    payment_id: paymentId,
    user_email,
    amount,
    description,
    status: 'pending_approval',
    user_id: userId,
    factor_id: factorId,
    transaction_id: '', // poll_url から抽出可能
    poll_url: verifyResponse._links.poll.href,
    created_at: new Date().toISOString(),
    expires_at: verifyResponse.expiresAt,
  };

  await savePaymentRecord(c.env, record, 600);

  return c.json({
    payment_id: paymentId,
    status: 'pending_approval',
    expires_at: verifyResponse.expiresAt,
    message: 'スマートフォンのOkta Verifyで承認してください',
  }, 202);
});

// ステータス確認
payment.get('/:paymentId/status', async (c) => {
  const paymentId = c.req.param('paymentId');
  const record = await getPaymentRecord(c.env, paymentId);

  if (!record) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (record.status === 'pending_approval') {
    if (new Date() > new Date(record.expires_at)) {
      record.status = 'expired';
      await savePaymentRecord(c.env, record);
    } else {
      // Factors API のポーリング
      const pollResult = await pollTransaction(c.env, record.poll_url);

      switch (pollResult.factorResult) {
        case 'SUCCESS':
          record.status = 'completed';
          record.completed_at = new Date().toISOString();
          record.approval_result = 'SUCCESS';
          processPayment(record);
          await savePaymentRecord(c.env, record);
          break;

        case 'REJECTED':
          record.status = 'rejected';
          record.approval_result = 'REJECTED';
          await savePaymentRecord(c.env, record);
          break;

        case 'TIMEOUT':
          record.status = 'expired';
          record.approval_result = 'TIMEOUT';
          await savePaymentRecord(c.env, record);
          break;

        // WAITING → 何もしない
      }
    }
  }

  const response: Record<string, unknown> = {
    payment_id: record.payment_id,
    status: record.status,
  };

  if (record.status === 'pending_approval') {
    response.expires_at = record.expires_at;
  }
  if (record.status === 'completed') {
    response.amount = record.amount;
    response.completed_at = record.completed_at;
  }
  if (record.status === 'rejected') {
    response.reason = 'User denied the request';
  }

  return c.json(response);
});

export default payment;
```

---

## 承認の証跡

| 項目 | 保存場所 | 内容 |
|------|---------|------|
| `payment_id` | KV | 支払いの一意識別子 |
| `user_id` | KV | 承認したOktaユーザーのID |
| `factor_id` | KV | 使用されたPush FactorのID |
| `poll_url` | KV | トランザクションのURL（transactionIdを含む） |
| `approval_result` | KV | `SUCCESS` / `REJECTED` / `TIMEOUT` |
| `completed_at` | KV | 承認完了時刻 |
| `expires_at` | KV | プッシュ通知の有効期限（Oktaが設定） |

**監査時の検証**: `poll_url` に含まれる `transactionId` を使って、Okta の System Log と突合可能。

---

## 制約事項

| 項目 | 内容 |
|------|------|
| カスタムメッセージ | Factors API ではプッシュ通知に**カスタムメッセージを表示できない**（CIBAの `binding_message` に相当する機能がない） |
| 認証方式 | SSWS トークン（管理APIキー）が必要。Workersに管理者権限のトークンを持たせることになる |
| 証跡の形式 | OAuth トークンではなく、Okta 独自のトランザクション結果 |
| OIE での制限 | Factors API 経由での Okta Verify 複数登録は不可（最初の1つのみ） |
| Number Challenge | `{"useNumberMatchingChallenge": true}` をリクエストボディに含めると有効化可能 |

---

## セキュリティ上の考慮

### SSWS トークンの管理

Factors API の呼び出しには管理者権限の API トークン（SSWS）が必要。

- Workers の Secret として保存（`wrangler secret put OKTA_API_TOKEN`）
- トークンは30日間使用しないと失効する（使用するたび自動延長）
- 最小権限の原則: 可能であれば、スコープを絞った OAuth トークン（`okta.users.read` + `okta.users.manage`）を使うことを検討

### SSWS の代替: OAuth for Okta

Okta は SSWS トークンの代わりに OAuth 2.0 スコープ付きトークンの使用を推奨している。

```
Authorization: Bearer {access_token}
```

必要なスコープ: `okta.users.read`, `okta.users.manage`

Client Credentials フローで取得可能。ただし設定がSWSS より複雑になる。

---

## 参考リンク

- [Okta Factors API](https://developer.okta.com/docs/reference/api/factors/)
- [User Factor Operations](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/UserFactor/)
- [Okta API Token 作成](https://developer.okta.com/docs/guides/create-an-api-token/main/)
- [Implement OAuth for Okta](https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/)
