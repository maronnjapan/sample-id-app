# Okta CIBA代替アプローチ — コード解説 目次

> **本リポジトリの位置づけ:**
> OktaではCIBA（Client Initiated Backchannel Authentication）の実装ハードルが高いため、特定の操作（高額決済など）の際にのみユーザー承認を求める**代替アプローチ**を2パターン実装したものである。
> - **アプローチ1 — Factors API:** バックエンドからOkta Management APIを呼び出し、ユーザーのスマートフォンへプッシュ通知を送信して承認を求める
> - **アプローチ2 — OIDCフロー（Step-up Authentication）:** OAuth 2.0 Authorization Code Flow + `acr_values` パラメータを用いてブラウザリダイレクトベースで多要素認証を強制する

---

## 第1部　基盤インフラストラクチャ — Terraform

### 第1章　Terraformプロジェクト構成

#### 1.1　ディレクトリ構成とファイル一覧
- `terraform/main.tf` — リソース定義の本体
- `terraform/variables.tf` — 入力変数の宣言
- `terraform/outputs.tf` — 出力値の定義

#### 1.2　使用プロバイダ
- 1.2.1　`okta` プロバイダ（~6.5.5）— Oktaリソースの管理
- 1.2.2　`tls` プロバイダ — RSA鍵ペアの生成
- 1.2.3　`jwks` プロバイダ — RSA公開鍵からJWKS形式への変換

---

### 第2章　入力変数の定義（`variables.tf`）

#### 2.1　`okta_org_name` — Okta組織名
- 型: `string`
- 用途: Oktaテナントの識別子（例: `dev-123456`）

#### 2.2　`okta_base_url` — OktaベースURL
- 型: `string`
- デフォルト値: `okta.com`
- 用途: Oktaのドメインサフィックス（`oktapreview.com` 等に切替可能）

#### 2.3　`okta_api_token` — Okta APIトークン
- 型: `string`
- `sensitive = true`
- 用途: Terraformがokta APIと通信するための管理トークン

#### 2.4　`stepup_redirect_uris` — リダイレクトURI一覧
- 型: `list(string)`
- デフォルト値: `["http://localhost:8787/callback"]`
- 用途: Step-up認証OAuthアプリに登録するリダイレクトURI

---

### 第3章　リソース定義の詳解（`main.tf`）

#### 3.1　認証ポリシーとルール

##### 3.1.1　`okta_app_signon_policy.stepup_policy` — Step-up認証ポリシー
- リソース名: `"StepUp Payment Policy"`
- 用途: Step-up認証用OAuthアプリに紐づく認証ポリシーの定義

##### 3.1.2　`okta_app_signon_policy_rule.stepup_rule` — 認証ポリシールール
- 優先度: `1`（最高優先）
- `constraints` パラメータの構造:
  - `knowledge.types` — `["password"]`（パスワード認証を要求）
  - `possession.userVerification` — `"REQUIRED"`（Okta Verifyプッシュ承認を要求）
- 効果: このポリシーに紐づくアプリへのアクセス時に必ずパスワード＋プッシュ通知の2要素認証を強制する

#### 3.2　OAuthアプリケーション定義

##### 3.2.1　`okta_app_oauth.stepup_client` — Step-up認証用OAuthアプリ
- ラベル: `"stepup-payment-demo"`
- タイプ: `web`（サーバーサイドWebアプリ）
- 許可されるグラントタイプ: `authorization_code`, `refresh_token`
- レスポンスタイプ: `code`
- 認証メソッド: `client_secret_post`（トークンエンドポイントでの認証方式）
- リダイレクトURI: `var.stepup_redirect_uris` から動的に設定
- 認証ポリシーの紐付け: `okta_app_signon_policy.stepup_policy.id`
- 出力される値: `client_id`, `client_secret`

##### 3.2.2　`okta_app_oauth.factors_service` — Factors APIサービスアカウント用OAuthアプリ
- ラベル: `"factors-service-client"`
- タイプ: `service`（マシン間通信用サービスアプリ）
- グラントタイプ: `client_credentials`
- 認証メソッド: `private_key_jwt`（秘密鍵によるJWT署名認証）
- `jwks` ブロック内のJWK構成:
  - `kty` — `"RSA"`（鍵タイプ）
  - `kid` — `jwks_from_key` データソースから取得
  - `e` — RSA公開指数
  - `n` — RSAモジュラス
- 用途: Factors APIにアクセスするためのOAuth for Oktaクレデンシャル

#### 3.3　暗号鍵の生成

##### 3.3.1　`tls_private_key.rsa` — RSA秘密鍵
- アルゴリズム: `RSA`
- 鍵長: `4096` ビット
- 用途: Factors APIサービスアカウントのJWT署名に使用

##### 3.3.2　`data "jwks_from_key" "jwks"` — JWKSデータソース
- 入力: `tls_private_key.rsa` のPEM形式秘密鍵
- `kid`: `"b6474acd-a2f7-4163-b693-116f656e216f"`（固定値）
- 出力: JWKSのJSON形式（`kty`, `kid`, `e`, `n` の各パラメータ）

#### 3.4　デモユーザーとアプリ割り当て

##### 3.4.1　`okta_user.demo` — デモ用ユーザー
- ログインID: `example@example.com`
- メールアドレス: `example@example.com`
- 初期パスワード: `TempPassw0rd!`
- 氏名: First=`Demo`, Last=`User`

##### 3.4.2　`okta_app_user.stepup_assignment` — ユーザーのアプリ割り当て
- 対象アプリ: `okta_app_oauth.stepup_client`
- 対象ユーザー: `okta_user.demo`
- ユーザー名: `example@example.com`

---

### 第4章　出力値の定義（`outputs.tf`）

#### 4.1　`stepup_client_id` — Step-up用OAuthクライアントID
- ソース: `okta_app_oauth.stepup_client.client_id`
- `sensitive = false`

#### 4.2　`stepup_client_secret` — Step-up用OAuthクライアントシークレット
- ソース: `okta_app_oauth.stepup_client.client_secret`
- `sensitive = true`

#### 4.3　`factors_service_client_id` — Factors APIサービスアカウントのクライアントID
- ソース: `okta_app_oauth.factors_service.client_id`
- `sensitive = false`

#### 4.4　`okta_domain` — Oktaドメイン
- ソース: `"${var.okta_org_name}.${var.okta_base_url}"`
- `sensitive = false`

#### 4.5　`okta_private_key` — RSA秘密鍵（PEM形式）
- ソース: `tls_private_key.rsa.private_key_pem`
- `sensitive = true`

#### 4.6　`okta_key_id` — JWKS鍵ID
- ソース: `data.jwks_from_key.jwks.kid`
- `sensitive = false`

---

## 第2部　アプローチ1 — Factors APIによるプッシュ承認

### 第5章　プロジェクト構成とビルド設定

#### 5.1　ディレクトリ構成
```
payment-app-by-factors-api/
├── src/
│   ├── index.ts              # アプリケーションエントリポイント
│   ├── types/index.ts        # TypeScript型定義
│   ├── routes/payment.ts     # HTTPルートハンドラ
│   ├── services/
│   │   ├── factors.ts        # Okta Factors API統合サービス
│   │   └── payment.ts        # 決済レコード管理サービス
│   ├── utils/id.ts           # 決済ID生成ユーティリティ
│   └── views/payment.ts      # フロントエンドHTML/CSS/JS
├── wrangler.toml             # Cloudflare Worker設定
├── tsconfig.json             # TypeScript設定
└── package.json              # 依存関係
```

#### 5.2　依存パッケージ（`package.json`）
- 5.2.1　`hono`（4.11.9）— 軽量Webフレームワーク
- 5.2.2　`jose`（6.1.3）— JWT署名・検証ライブラリ
- 5.2.3　`@cloudflare/workers-types` — Cloudflare Workers型定義（devDependencies）
- 5.2.4　`typescript`（5.3.3）— TypeScriptコンパイラ（devDependencies）
- 5.2.5　`wrangler`（4.64.0）— Cloudflare CLIツール（devDependencies）

#### 5.3　TypeScript設定（`tsconfig.json`）
- ターゲット: `ES2022`
- モジュール: `ESNext`
- `strict: true`（厳格モード有効）
- Workers型定義の参照

#### 5.4　Cloudflare Worker設定（`wrangler.toml`）
- 5.4.1　Worker名: `payment-app-by-factors-api`
- 5.4.2　エントリポイント: `src/index.ts`
- 5.4.3　互換性フラグ: `nodejs_compat`
- 5.4.4　環境変数（`[vars]`）:
  - `OKTA_DOMAIN` — Oktaドメイン
  - `OKTA_MGMT_CLIENT_ID` — サービスアカウントクライアントID
  - `OKTA_MGMT_KID` — JWT署名用鍵ID
- 5.4.5　KV名前空間バインディング:
  - バインディング名: `PAYMENT_STORE`
  - 用途: 決済レコードの永続化ストレージ
- 5.4.6　シークレット（`wrangler secret put`で設定）:
  - `OKTA_MGMT_PRIVATE_KEY` — RSA秘密鍵（PEM形式）

---

### 第6章　型定義（`src/types/index.ts`）

#### 6.1　`Bindings` インターフェース — Cloudflare Workerバインディング
- 6.1.1　`PAYMENT_STORE: KVNamespace` — Cloudflare KV名前空間
- 6.1.2　`OKTA_DOMAIN: string` — Oktaドメイン文字列
- 6.1.3　`OKTA_MGMT_CLIENT_ID: string` — サービスアカウントクライアントID
- 6.1.4　`OKTA_MGMT_KID: string` — JWT署名用鍵ID
- 6.1.5　`OKTA_MGMT_PRIVATE_KEY: string` — RSA秘密鍵（PEM形式文字列）

#### 6.2　`PaymentRecord` インターフェース — 決済レコード
- 6.2.1　`payment_id: string` — 決済の一意識別子（`pay_` プレフィックス）
- 6.2.2　`user_email: string` — ユーザーのメールアドレス
- 6.2.3　`amount: number` — 決済金額
- 6.2.4　`description: string` — 決済の説明テキスト
- 6.2.5　`status: PaymentStatus` — 決済の現在のステータス
- 6.2.6　`user_id: string` — Okta上のユーザーID
- 6.2.7　`factor_id: string` — Oktaプッシュファクタ―ID
- 6.2.8　`transaction_id: string` — Oktaトランザクション識別子
- 6.2.9　`poll_url: string` — Oktaポーリングエンドポイント
- 6.2.10　`approval_result?: FactorResult` — 承認結果（オプション）
- 6.2.11　`created_at: string` — ISO8601形式の作成日時
- 6.2.12　`expires_at: string` — Okta側で設定される有効期限
- 6.2.13　`completed_at?: string` — 完了日時（オプション）

#### 6.3　`PaymentStatus` 型 — 決済ステータス列挙
- `'pending_approval'` — 承認待ち
- `'completed'` — 完了
- `'rejected'` — 拒否
- `'expired'` — 期限切れ

#### 6.4　`FactorResult` 型 — Okta Factorの検証結果列挙
- `'WAITING'` — ユーザーの応答待ち
- `'SUCCESS'` — 承認成功
- `'REJECTED'` — ユーザーが拒否
- `'TIMEOUT'` — タイムアウト

#### 6.5　`FactorVerifyResponse` インターフェース — Factor検証APIレスポンス
- 6.5.1　`expiresAt: string` — トランザクションの有効期限
- 6.5.2　`factorResult: FactorResult` — 現在の検証結果
- 6.5.3　`_links.poll.href: string` — ポーリングURL
- 6.5.4　`_links.cancel.href: string` — キャンセルURL

#### 6.6　`FactorPollResponse` インターフェース — ポーリングAPIレスポンス
- 6.6.1　`expiresAt: string` — トランザクションの有効期限
- 6.6.2　`factorResult: FactorResult` — 最新の検証結果

---

### 第7章　アプリケーションエントリポイント（`src/index.ts`）

#### 7.1　Honoアプリの初期化
- `Hono<{ Bindings: Bindings }>` でジェネリクス型を指定し、環境変数の型安全性を確保

#### 7.2　CORSミドルウェアの設定
- すべてのオリジン・メソッドからのアクセスを許可

#### 7.3　ルート定義一覧
- 7.3.1　`GET /health` — ヘルスチェックエンドポイント（`{ status: 'ok' }` を返却）
- 7.3.2　`GET /` — フロントエンドHTMLページの配信
- 7.3.3　`POST /api/payment/initiate` — 決済開始（paymentRoutesから）
- 7.3.4　`GET /api/payment/:paymentId/status` — 決済ステータス確認（paymentRoutesから）

#### 7.4　エラーハンドリング
- 7.4.1　404 Not Found — 未定義ルートへのアクセス時
- 7.4.2　`app.onError` — 予期しないエラーのキャッチとJSON形式でのレスポンス

---

### 第8章　決済ルートハンドラ（`src/routes/payment.ts`）

#### 8.1　`POST /api/payment/initiate` — 決済開始エンドポイント

##### 8.1.1　リクエストボディのパース
- JSON形式: `{ user_email: string, amount: number, description: string }`

##### 8.1.2　入力バリデーション
- `user_email` — 必須チェック（未指定時400エラー）
- `amount` — 必須チェック（未指定時400エラー）

##### 8.1.3　ユーザーID取得
- `getUserId(env, user_email)` を呼び出し
- OktaからユーザーのID（内部識別子）を取得

##### 8.1.4　プッシュファクタ―ID取得
- `getPushFactorId(env, userId)` を呼び出し
- ユーザーに紐づくアクティブなプッシュ型ファクタ―を検索

##### 8.1.5　プッシュ通知の送信
- `sendPushVerification(env, userId, factorId)` を呼び出し
- Okta Verifyアプリへプッシュ通知を発行

##### 8.1.6　トランザクションIDの抽出
- `extractTransactionId(verifyResult._links.poll.href)` を呼び出し
- ポーリングURLのパスの最終セグメントからトランザクションIDを取得

##### 8.1.7　決済レコードの生成
- `generatePaymentId()` で一意のIDを生成
- `PaymentRecord` オブジェクトの構築:
  - `status`: `'pending_approval'`
  - `expires_at`: Oktaレスポンスの `expiresAt` をそのまま使用
  - `poll_url`: Oktaレスポンスの `_links.poll.href`

##### 8.1.8　KVへの永続化
- `savePaymentRecord(env, record, 600)` でTTL 600秒（10分）として保存
- キー形式: `payment:{payment_id}`

##### 8.1.9　レスポンス（202 Accepted）
- `payment_id` — 生成された決済ID
- `status` — `"pending_approval"`
- `expires_at` — 有効期限のISO8601文字列
- `expires_in` — 残り秒数（計算値）
- `message` — `"スマートフォンのOkta Verifyで承認してください"`

##### 8.1.10　エラーハンドリング
- Okta API呼び出し失敗時の500エラー返却
- エラーメッセージのJSON形式レスポンス

#### 8.2　`GET /api/payment/:paymentId/status` — ステータス確認エンドポイント

##### 8.2.1　KVからの決済レコード取得
- `getPaymentRecord(env, paymentId)` でレコードを読み出し
- レコードが存在しない場合は404エラー

##### 8.2.2　承認待ち状態の場合の処理
- 有効期限チェック: `expires_at` と現在時刻の比較
  - 期限切れの場合: `status` を `'expired'` に更新してKVに保存
- ポーリング実行: `pollTransaction(env, record.poll_url)` でOktaに最新ステータスを問い合わせ

##### 8.2.3　Okta検証結果に基づくステータス遷移
- `SUCCESS` の場合:
  - `status` → `'completed'`
  - `approval_result` → `'SUCCESS'`
  - `completed_at` → 現在時刻のISO8601文字列
  - `processPayment(record)` を呼び出し（決済処理スタブ）
- `REJECTED` の場合:
  - `status` → `'rejected'`
  - `approval_result` → `'REJECTED'`
- `TIMEOUT` の場合:
  - `status` → `'expired'`
  - `approval_result` → `'TIMEOUT'`
- `WAITING` の場合:
  - ステータス変更なし（引き続きポーリングを継続）

##### 8.2.4　レスポンスの構築
- 共通フィールド: `payment_id`, `status`, `amount`, `description`
- 承認待ちの場合: `expires_at`, `expires_in`（残り秒数）
- 完了の場合: `completed_at`, `approval_result`
- 拒否・期限切れの場合: `approval_result`, `reason`（拒否理由文字列）

---

### 第9章　Factors APIサービス（`src/services/factors.ts`）

#### 9.1　アクセストークン管理

##### 9.1.1　トークンキャッシュの仕組み
- モジュールスコープのキャッシュ変数: `cachedToken`, `tokenExpiresAt`
- キャッシュ有効期間: 30秒
- 有効期間内はキャッシュされたトークンを返却し、APIコールを削減

##### 9.1.2　`getManagementAccessToken(env)` — Management APIアクセストークンの取得
- **JWTアサーションの構築:**
  - `jose.importPKCS8()` でPEM形式秘密鍵をインポート
  - `jose.SignJWT` を使用してRS256署名のJWTを生成
  - JWTクレーム:
    - `iss` — クライアントID（`OKTA_MGMT_CLIENT_ID`）
    - `sub` — クライアントID（同上）
    - `aud` — `https://{OKTA_DOMAIN}/oauth2/v1/token`
    - `iat` — 現在時刻
    - `exp` — 現在時刻 + 60秒（1分後）
    - `jti` — `crypto.randomUUID()` によるユニークID
  - JWTヘッダー: `{ alg: 'RS256', kid: OKTA_MGMT_KID }`

- **トークンエンドポイントへのリクエスト:**
  - エンドポイント: `POST https://{OKTA_DOMAIN}/oauth2/v1/token`
  - Content-Type: `application/x-www-form-urlencoded`
  - パラメータ:
    - `grant_type` — `client_credentials`
    - `scope` — `okta.users.read okta.users.manage okta.factors.read okta.factors.manage`
    - `client_assertion_type` — `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
    - `client_assertion` — 上記で生成したJWT文字列

- **レスポンス処理:**
  - `access_token` を抽出
  - キャッシュに保存（30秒間有効）
  - Bearer トークンとして後続のAPI呼び出しに使用

#### 9.2　`getUserId(env, email)` — OktaユーザーIDの取得
- エンドポイント: `GET https://{OKTA_DOMAIN}/api/v1/users/{email}`
- 認証ヘッダー: `Authorization: Bearer {access_token}`
- レスポンスから `id` フィールドを抽出
- エラー時: APIエラーメッセージをthrow

#### 9.3　`getPushFactorId(env, userId)` — プッシュファクタ―IDの取得
- エンドポイント: `GET https://{OKTA_DOMAIN}/api/v1/users/{userId}/factors`
- 認証ヘッダー: `Authorization: Bearer {access_token}`
- フィルタ条件:
  - `factorType === 'push'`（プッシュ型ファクタ―）
  - `status === 'ACTIVE'`（アクティブ状態）
- 最初に見つかったファクタ―の `id` を返却
- プッシュファクタ―が未登録の場合: `"No active push factor found"` をthrow

#### 9.4　`sendPushVerification(env, userId, factorId)` — プッシュ通知の送信
- エンドポイント: `POST https://{OKTA_DOMAIN}/api/v1/users/{userId}/factors/{factorId}/verify`
- 認証ヘッダー: `Authorization: Bearer {access_token}`
- リクエストボディ: `{}` (空のJSONオブジェクト)
- **副作用:** ユーザーのスマートフォン上のOkta Verifyアプリにプッシュ通知を送信
- レスポンス（`FactorVerifyResponse`）:
  - `expiresAt` — トランザクションの有効期限
  - `factorResult` — 初期値は `'WAITING'`
  - `_links.poll.href` — ポーリングエンドポイントURL
  - `_links.cancel.href` — キャンセルエンドポイントURL

#### 9.5　`pollTransaction(env, pollUrl)` — トランザクションステータスのポーリング
- エンドポイント: `GET {pollUrl}`（`sendPushVerification` のレスポンスから取得）
- 認証ヘッダー: `Authorization: Bearer {access_token}`
- レスポンス（`FactorPollResponse`）:
  - `factorResult` — `WAITING` / `SUCCESS` / `REJECTED` / `TIMEOUT`
  - `expiresAt` — 有効期限

#### 9.6　`extractTransactionId(pollUrl)` — トランザクションIDの抽出
- ポーリングURLのパス最終セグメントを分割して抽出
- フォールバック: パース失敗時はURL全体を返却

---

### 第10章　決済サービス（`src/services/payment.ts`）

#### 10.1　`getPaymentRecord(env, paymentId)` — 決済レコードの取得
- KVキー: `payment:{paymentId}`
- 戻り値: `PaymentRecord | null`
- KVからJSON文字列を取得し、`JSON.parse()` でデシリアライズ

#### 10.2　`savePaymentRecord(env, record, ttl)` — 決済レコードの保存
- KVキー: `payment:{record.payment_id}`
- TTL: デフォルト600秒（10分）
- `JSON.stringify()` でシリアライズしてKVに保存
- `expirationTtl` オプションで自動削除を設定

#### 10.3　`processPayment(record)` — 決済処理（スタブ）
- 現時点ではコンソールログ出力のみ
- ログ内容: `payment_id`, `amount`, `description`, `user_email`
- 本番実装時に外部決済プロセッサーとの連携を追加する想定

---

### 第11章　ユーティリティ（`src/utils/id.ts`）

#### 11.1　`generatePaymentId()` — 決済IDの生成
- タイムスタンプ部: `Date.now().toString(36)` — 現在時刻をBase36エンコード
- ランダム部: `Math.random().toString(36).substring(2, 10)` — 8文字のランダム文字列
- 出力形式: `pay_{timestamp}{random}`（例: `pay_m1abc123xyz456`）
- 衝突確率: タイムスタンプ＋ランダム値の組み合わせにより実用上無視可能

---

### 第12章　フロントエンドUI（`src/views/payment.ts`）

#### 12.1　HTML構造

##### 12.1.1　ページ全体のレイアウト
- `<!DOCTYPE html>` HTML5ドキュメント
- ビューポート設定: `width=device-width, initial-scale=1.0`
- タイトル: 決済承認デモ（Factors API）

##### 12.1.2　決済フォームセクション（`#form-section`）
- フォームヘッダー: タイトルと説明文
- 入力フィールド:
  - メールアドレス入力（`type="email"`, `required`）
  - 金額入力（`type="number"`, `min="1"`, `required`、¥記号プレフィックス付き）
  - 説明入力（`type="text"`, `required`）
- 送信ボタン: 「支払いを開始」

##### 12.1.3　ステータス表示セクション（`#status-section`、初期状態: 非表示）
- ステータスアイコン（スピナー/チェック/バツ/時計）
- ステータスタイトルとメッセージ
- スマートフォンイラスト（`#phone-illustration`）:
  - Okta Verifyアプリの模擬画面
  - 金額の動的表示: `¥{amount}の支払いを承認`
  - 承認・拒否ボタン（装飾用、実際の操作はスマートフォンで行う）
- カウントダウンタイマー（`#countdown`、残り秒数表示）
- 決済詳細テーブル（`#details`）:
  - 決済ID、金額、説明、完了日時
- リセットボタン: 「新しい支払い」

##### 12.1.4　エラーメッセージ表示（`#error-message`、初期状態: 非表示）
- 赤背景のエラーメッセージボックス

#### 12.2　CSS スタイリング

##### 12.2.1　全体スタイル
- フォントファミリー: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- 背景色: `#f5f5f5`
- 最大幅: `480px`、中央揃え

##### 12.2.2　フォーム要素スタイル
- 入力フィールド: ボーダー付き、角丸、パディング
- ボタン: 青色グラデーション、ホバーエフェクト
- ¥記号プレフィックス: `position: absolute` による配置

##### 12.2.3　ステータスセクションスタイル
- ステータス別背景色:
  - 承認待ち: 黄色系
  - 完了: 緑色系
  - 拒否: 赤色系
  - 期限切れ: グレー系

##### 12.2.4　スマートフォンイラストスタイル
- `#phone-illustration`: 端末風のボーダーと角丸
- Okta Verifyアプリの模擬画面デザイン
- 承認・拒否ボタンの配色

##### 12.2.5　アニメーション
- `@keyframes spin` — スピナーの回転アニメーション
- `@keyframes pulse` — パルスエフェクト（承認待ち時の注意喚起）

#### 12.3　JavaScriptロジック

##### 12.3.1　フォーム送信ハンドラ（`handleSubmit`）
- フォームデフォルト動作の抑制
- `fetch('/api/payment/initiate', { method: 'POST' })` の実行
- リクエストボディ: `{ user_email, amount, description }`
- 成功時:
  - `payment_id` と `expires_in` をグローバル変数に保存
  - フォームセクションを非表示、ステータスセクションを表示
  - `startPolling()` と `startCountdown()` を呼び出し
- 失敗時: エラーメッセージの表示

##### 12.3.2　ポーリング機構（`startPolling` / `pollStatus`）
- 初回ポーリング: 即座に実行
- ポーリング間隔: 3秒（`setInterval`）
- エンドポイント: `GET /api/payment/{paymentId}/status`
- レスポンスの `expiresIn` で残り時間を更新
- 停止条件: `status` が `'completed'`, `'rejected'`, `'expired'` のいずれか

##### 12.3.3　カウントダウンタイマー（`startCountdown`）
- 1秒ごとにデクリメント
- `#countdown` 要素に残り秒数を表示
- 0以下になった場合は `0` で停止

##### 12.3.4　ステータスUI更新（`updateStatusUI`）
- `pending_approval`:
  - アイコン: スピナー（回転アニメーション）
  - 背景: 黄色系
  - スマートフォンイラスト: 表示
  - カウントダウン: 表示
  - 詳細テーブル: 非表示
- `completed`:
  - アイコン: チェックマーク（✓）
  - 背景: 緑色系
  - スマートフォンイラスト: 非表示
  - カウントダウン: 非表示
  - 詳細テーブル: 表示（決済ID、金額、説明、完了日時）
- `rejected`:
  - アイコン: バツマーク（✗）
  - 背景: 赤色系
  - 拒否理由メッセージを表示
- `expired`:
  - アイコン: 時計マーク
  - 背景: グレー系
  - タイムアウトメッセージを表示

##### 12.3.5　リセット処理（`resetForm`）
- ポーリングタイマーのクリア（`clearInterval`）
- カウントダウンタイマーのクリア（`clearInterval`）
- フォーム入力のクリア
- フォームセクション表示、ステータスセクション非表示に切り替え

---

## 第3部　アプローチ2 — OIDCフローによるStep-up認証

### 第13章　プロジェクト構成とビルド設定

#### 13.1　ディレクトリ構成
```
payment-app-by-oidc/
├── src/
│   ├── index.ts              # アプリケーションエントリポイント
│   ├── types/index.ts        # TypeScript型定義
│   ├── routes/payment.ts     # HTTPルートハンドラ（+ OIDCコールバック）
│   ├── services/
│   │   ├── auth.ts           # OIDC認証フローサービス
│   │   └── payment.ts        # 決済レコード管理サービス
│   ├── utils/id.ts           # 決済ID生成ユーティリティ
│   └── views/payment.ts      # フロントエンドHTML/CSS/JS
├── wrangler.toml             # Cloudflare Worker設定
├── tsconfig.json             # TypeScript設定
└── package.json              # 依存関係
```

#### 13.2　依存パッケージ（`package.json`）
- Factors APIアプリと同一構成（Hono 4.11.9, jose 6.1.3, TypeScript 5.3.3, Wrangler 4.64.0）

#### 13.3　Cloudflare Worker設定（`wrangler.toml`）
- 13.3.1　Worker名: `payment-app-by-oidc`
- 13.3.2　エントリポイント: `src/index.ts`
- 13.3.3　互換性フラグ: `nodejs_compat`
- 13.3.4　環境変数（`[vars]`）:
  - `OKTA_DOMAIN` — Oktaドメイン
  - `APP_BASE_URL` — アプリのベースURL（例: `http://localhost:8787`）
- 13.3.5　KV名前空間バインディング: `PAYMENT_STORE`
- 13.3.6　シークレット:
  - `OKTA_CLIENT_ID` — OAuthクライアントID
  - `OKTA_CLIENT_SECRET` — OAuthクライアントシークレット

---

### 第14章　型定義（`src/types/index.ts`）

#### 14.1　`Bindings` インターフェース — Cloudflare Workerバインディング
- 14.1.1　`PAYMENT_STORE: KVNamespace` — Cloudflare KV名前空間
- 14.1.2　`OKTA_DOMAIN: string` — Oktaドメイン文字列
- 14.1.3　`OKTA_CLIENT_ID: string` — OAuthクライアントID
- 14.1.4　`OKTA_CLIENT_SECRET: string` — OAuthクライアントシークレット
- 14.1.5　`APP_BASE_URL: string` — アプリケーションのベースURL

#### 14.2　`PaymentRecord` インターフェース — 決済レコード
- 14.2.1　`payment_id: string` — 決済の一意識別子
- 14.2.2　`user_email: string` — ユーザーのメールアドレス
- 14.2.3　`amount: number` — 決済金額
- 14.2.4　`description: string` — 決済の説明
- 14.2.5　`status: PaymentStatus` — 決済ステータス
- 14.2.6　`nonce: string` — OAuthノンス（IDトークン検証用）
- 14.2.7　`created_at: string` — 作成日時
- 14.2.8　`expires_at: string` — 有効期限（作成から10分後）
- 14.2.9　`completed_at?: string` — 完了日時（オプション）
- 14.2.10　`id_token?: string` — 完全なIDトークンJWT文字列（オプション）
- 14.2.11　`auth_time?: number` — 認証実行時刻のUnixタイムスタンプ（オプション）
- 14.2.12　`acr?: string` — Authentication Context Class Reference（オプション）
- 14.2.13　`amr?: string[]` — 使用された認証メソッドの配列（オプション）
- 14.2.14　`failure_reason?: string` — 失敗理由（オプション）

#### 14.3　`PaymentStatus` 型
- Factors APIアプリと同一: `'pending_approval'` / `'completed'` / `'rejected'` / `'expired'`

#### 14.4　`IdTokenPayload` インターフェース — IDトークンのペイロード
- 14.4.1　`sub: string` — サブジェクト（OktaユーザーID）
- 14.4.2　`iss: string` — イシュアー（Oktaドメイン）
- 14.4.3　`aud: string` — オーディエンス（クライアントID）
- 14.4.4　`iat: number` — 発行時刻（Unixタイムスタンプ）
- 14.4.5　`exp: number` — 有効期限（Unixタイムスタンプ）
- 14.4.6　`auth_time: number` — 認証実行時刻（Unixタイムスタンプ）
- 14.4.7　`acr: string` — 認証コンテキストクラス（例: `"urn:okta:loa:2fa:any"`）
- 14.4.8　`amr: string[]` — 認証メソッド配列（例: `["pwd", "push"]`）
- 14.4.9　`nonce?: string` — ノンス（認可リクエストで指定した値）

---

### 第15章　アプリケーションエントリポイント（`src/index.ts`）

#### 15.1　Honoアプリの初期化
- Factors APIアプリと同様にジェネリクス型を使用

#### 15.2　CORSミドルウェアの設定

#### 15.3　ルート定義一覧
- 15.3.1　`GET /health` — ヘルスチェック
- 15.3.2　`GET /` — フロントエンドHTMLページの配信
- 15.3.3　`POST /api/payment/initiate` — 決済開始
- 15.3.4　`GET /callback` — OIDCコールバック（`handleOidcCallback` を呼び出し）
- 15.3.5　`GET /api/payment/:paymentId/status` — 決済ステータス確認

#### 15.4　エラーハンドリング
- 404 Not Found、`app.onError` による包括的エラーハンドリング

---

### 第16章　決済ルートハンドラ（`src/routes/payment.ts`）

#### 16.1　`POST /api/payment/initiate` — 決済開始エンドポイント

##### 16.1.1　リクエストボディのパース
- JSON形式: `{ user_email: string, amount: number, description: string }`

##### 16.1.2　入力バリデーション
- `user_email`、`amount` の必須チェック

##### 16.1.3　ノンスの生成
- `crypto.randomUUID()` によるランダムUUID生成
- IDトークンのリプレイ攻撃防止に使用

##### 16.1.4　決済レコードの生成と保存
- `status`: `'pending_approval'`
- `expires_at`: 現在時刻 + 10分
- `nonce`: 上記で生成したランダムUUID
- KVに保存（TTL 600秒）

##### 16.1.5　認可URLの構築
- `buildAuthorizeUrl(env, paymentId, nonce)` を呼び出し
- ユーザーをOktaの認証画面にリダイレクトするためのURL

##### 16.1.6　レスポンス（202 Accepted）
- `payment_id` — 生成された決済ID
- `status` — `"pending_approval"`
- `authorize_url` — Oktaの認可エンドポイントURL（フロントエンドでリダイレクトに使用）

#### 16.2　`GET /api/payment/callback`（`handleOidcCallback`）— OIDCコールバック

##### 16.2.1　クエリパラメータの取得
- `code` — 認可コード（Oktaから付与）
- `state` — 決済ID（認可リクエスト時に `state` パラメータとして送信した値）
- `error` — OAuthエラーコード（エラー時のみ）
- `error_description` — エラーの詳細説明（エラー時のみ）

##### 16.2.2　OAuthエラーの処理
- `error` パラメータが存在する場合:
  - 決済レコードを `'rejected'` に更新
  - `failure_reason` にエラー内容を記録
  - KVに保存
  - ホームページへリダイレクト（`?status=error&reason=...`）

##### 16.2.3　stateパラメータの検証
- `state` がHTTPリクエストに含まれていることを確認
- CSRF攻撃への対策

##### 16.2.4　決済レコードの取得と有効期限チェック
- KVからレコードを取得（存在しない場合はエラーリダイレクト）
- `expires_at` との比較で有効期限切れをチェック

##### 16.2.5　認可コードのトークン交換
- `exchangeCodeForTokens(env, code)` を呼び出し
- 認可コードをIDトークン＋アクセストークンに交換

##### 16.2.6　IDトークンの署名検証
- `verifyIdToken(env, id_token)` を呼び出し
- OktaのJWKSエンドポイントから公開鍵を取得して署名を検証

##### 16.2.7　承認内容の検証
- `validateApproval(payload, record.created_at, record.nonce)` を呼び出し
- 4つの検証を実行（詳細は第17章 17.5節を参照）

##### 16.2.8　検証成功時の処理
- `status` → `'completed'`
- `id_token` — 完全なJWT文字列を保存
- `auth_time` — IDトークンの `auth_time` クレーム
- `acr` — IDトークンの `acr` クレーム
- `amr` — IDトークンの `amr` クレーム
- `completed_at` — 現在時刻
- `processPayment(record)` を呼び出し
- KVに保存
- リダイレクト: `/?status=completed&payment={paymentId}`

##### 16.2.9　検証失敗時の処理
- `status` → `'rejected'`
- `failure_reason` — 検証失敗理由
- KVに保存
- リダイレクト: `/?status=error&reason=...`

#### 16.3　`GET /api/payment/:paymentId/status` — ステータス確認エンドポイント

##### 16.3.1　KVからの決済レコード取得
- 存在しない場合は404エラー

##### 16.3.2　レスポンスの構築
- 共通フィールド: `payment_id`, `status`, `amount`, `description`
- 完了の場合: `completed_at`, `auth_time`, `acr`, `amr`
- 承認待ちの場合: `expires_at`
- エラーの場合: `reason`（`failure_reason`）

---

### 第17章　OIDC認証サービス（`src/services/auth.ts`）

#### 17.1　`getAppBaseUrl(env)` — アプリケーションベースURLの取得
- `env.APP_BASE_URL` から取得
- 末尾スラッシュの除去
- 未設定時は例外をthrow

#### 17.2　`buildAuthorizeUrl(env, paymentId, nonce)` — 認可URLの構築

##### 17.2.1　ベースURL
- `https://{OKTA_DOMAIN}/oauth2/v1/authorize`

##### 17.2.2　URLパラメータの詳細
- `client_id` — OAuthクライアントID（Terraform出力値）
- `response_type` — `"code"`（Authorization Code Flowを指定）
- `scope` — `"openid email"`（OpenID ConnectスコープとEmailスコープ）
- `redirect_uri` — `"{APP_BASE_URL}/callback"`（コールバックURL）
- `state` — `paymentId`（決済IDをstateパラメータに埋め込み、CSRF対策兼決済の紐付け）
- `nonce` — ランダムUUID（IDトークンのリプレイ攻撃防止）
- `acr_values` — `"urn:okta:loa:2fa:any"`（2要素認証を要求するACR値）
- `max_age` — `"0"`（既存セッションを無視して必ず再認証を強制）

##### 17.2.3　`acr_values` パラメータの解説
- `urn:okta:loa:1fa:any` — 任意の単一要素認証
- `urn:okta:loa:1fa:pwd` — パスワードのみ
- `urn:okta:loa:2fa:any` — 任意の2要素認証（**本実装で使用**）
- `phr` — フィッシング耐性のある認証
- `phrh` — ハードウェアバウンドのフィッシング耐性認証

##### 17.2.4　`max_age=0` の意味
- 既存のOktaセッションがあっても必ず再認証を要求
- 決済ごとにユーザーの明示的な認証操作を保証

#### 17.3　`exchangeCodeForTokens(env, code)` — 認可コードのトークン交換

##### 17.3.1　エンドポイント
- `POST https://{OKTA_DOMAIN}/oauth2/v1/token`

##### 17.3.2　リクエストボディ（`application/x-www-form-urlencoded`）
- `grant_type` — `"authorization_code"`
- `code` — Oktaから受け取った認可コード
- `redirect_uri` — `"{APP_BASE_URL}/callback"`（登録済みリダイレクトURIと一致必須）
- `client_id` — OAuthクライアントID
- `client_secret` — OAuthクライアントシークレット（`client_secret_post` 方式）

##### 17.3.3　レスポンス
- `id_token` — JWT形式のIDトークン
- `access_token` — アクセストークン

##### 17.3.4　エラーハンドリング
- HTTP非200レスポンス時に例外をthrow

#### 17.4　`verifyIdToken(env, idToken)` — IDトークンの署名検証

##### 17.4.1　JWKS（JSON Web Key Set）の取得
- エンドポイント: `GET https://{OKTA_DOMAIN}/oauth2/v1/keys`
- JWKSをインメモリの`Map`にキャッシュ
- `jose.createRemoteJWKSet()` でJWKSオブジェクトを生成

##### 17.4.2　JWT署名の検証
- `jose.jwtVerify(idToken, jwks, options)` を使用
- 検証オプション:
  - `issuer` — `https://{OKTA_DOMAIN}`（発行者の一致確認）
  - `audience` — `OKTA_CLIENT_ID`（オーディエンスの一致確認）

##### 17.4.3　ペイロードの抽出
- 検証成功時: `IdTokenPayload` としてペイロードを返却
- 検証失敗時: 例外をthrow

#### 17.5　`validateApproval(payload, referenceTime, expectedNonce)` — 承認内容の検証

##### 17.5.1　認証時刻の検証
- `payload.auth_time * 1000`（ミリ秒変換）が `referenceTime - 60000`（60秒前）以上であることを確認
- 目的: 認証が決済リクエスト後に行われたことを保証
- 失敗理由: `"Authentication time is too old"`

##### 17.5.2　ACR（Authentication Context Class Reference）の検証
- `payload.acr` が `"urn:okta:loa:2fa:any"` と一致することを確認
- 目的: 2要素認証が実際に実行されたことを保証
- 失敗理由: `"ACR does not meet required level"`

##### 17.5.3　AMR（Authentication Methods References）の検証
- `payload.amr` 配列に `"push"` が含まれることを確認
- 目的: Okta Verifyのプッシュ通知が認証手段として使用されたことを保証
- 失敗理由: `"Push authentication was not used"`

##### 17.5.4　ノンスの検証
- `payload.nonce` が `expectedNonce` と一致することを確認
- 目的: IDトークンの置換攻撃（トークンリプレイ）を防止
- 失敗理由: `"Nonce mismatch"`

##### 17.5.5　戻り値
- `{ valid: true }` — すべての検証に合格
- `{ valid: false, reason: string }` — いずれかの検証に失敗

---

### 第18章　決済サービス（`src/services/payment.ts`）

#### 18.1　`getPaymentRecord(env, paymentId)`
- Factors APIアプリと同一実装

#### 18.2　`savePaymentRecord(env, record, ttl)`
- Factors APIアプリと同一実装

#### 18.3　`processPayment(record)`
- Factors APIアプリと同一実装（スタブ）

---

### 第19章　ユーティリティ（`src/utils/id.ts`）

#### 19.1　`generatePaymentId()`
- Factors APIアプリと同一実装

---

### 第20章　フロントエンドUI（`src/views/payment.ts`）

#### 20.1　HTML構造

##### 20.1.1　ページ全体のレイアウト
- タイトル: 決済承認デモ（Step-up認証）

##### 20.1.2　決済フォームセクション（`#form-section`）
- Factors APIアプリと同一の入力フィールド構成

##### 20.1.3　ステータス表示セクション（`#status-section`）
- 承認待ち時: Oktaログイン画面へのリダイレクトを案内するメッセージ
- 完了時: 認証詳細（`auth_time`, `acr`, `amr`）を表示
- 拒否時: 失敗理由を表示

##### 20.1.4　エラーメッセージ表示

#### 20.2　CSS スタイリング
- Factors APIアプリと基本構造は同一
- スマートフォンイラストの代わりにリダイレクト案内UIを配置

#### 20.3　JavaScriptロジック

##### 20.3.1　フォーム送信ハンドラ
- `fetch('/api/payment/initiate')` でAPIを呼び出し
- レスポンスから `authorize_url` を取得
- `window.location.href = authorize_url` でOktaの認証画面にリダイレクト
- **Factors APIアプリとの違い:** ポーリングではなくブラウザリダイレクトベースのフロー

##### 20.3.2　コールバック後の処理
- URLクエリパラメータの検出:
  - `status=completed` の場合: 完了画面を表示
  - `status=error` の場合: エラー画面を表示
- `payment` パラメータで決済IDを取得し、`/api/payment/{paymentId}/status` で詳細を取得

##### 20.3.3　認証詳細の表示
- `auth_time` — 認証実行時刻（人間が読める形式に変換）
- `acr` — 認証コンテキストクラス
- `amr` — 使用された認証メソッドの一覧

##### 20.3.4　リセット処理
- URLクエリパラメータのクリア（`history.replaceState`）
- フォームセクションへの切り替え

---

## 第4部　デプロイメント自動化

### 第21章　デプロイスクリプト（`scripts/deploy-stack.sh`）

#### 21.1　前提条件チェック
- 必須コマンドの存在確認: `pnpm`, `terraform`, `jq`, `awk`
- いずれかが不足している場合はエラー終了

#### 21.2　依存パッケージのインストール
- 両アプリディレクトリで `pnpm install --frozen-lockfile` を実行
- `--frozen-lockfile` により再現可能なインストールを保証

#### 21.3　KV名前空間の検証
- `wrangler.toml` からKV名前空間IDを読み取る `read_kv_binding_id()` 関数
- プレースホルダ値 `your-kv-namespace-id` のままでないことを確認

#### 21.4　OIDCアプリのデプロイ
- `wrangler deploy` を `payment-app-by-oidc` ディレクトリで実行
- `extract_workers_url()` 関数でデプロイ出力からWorkers URLを抽出
- `deploy_and_get_url()` 関数でデプロイとURL取得をラップ

#### 21.5　Terraformの実行
- `terraform init -input=false` で初期化
- `run_terraform_apply()` 関数:
  - `stepup_redirect_uris` にデプロイ済みWorker URLを動的に設定
  - `terraform apply` を実行

#### 21.6　Terraform出力値の取得
- `read_tf_output()` 関数でJSON形式で出力値を取得
- 取得する値:
  - `okta_domain`, `stepup_client_id`, `stepup_client_secret`
  - `factors_service_client_id`, `okta_key_id`, `okta_private_key`

#### 21.7　Workerシークレットの設定
- `put_secret()` 関数で `wrangler secret put` を実行
- OIDCアプリ: `OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`
- Factors APIアプリ: `OKTA_DOMAIN`, `OKTA_MGMT_CLIENT_ID`, `OKTA_MGMT_KID`, `OKTA_MGMT_PRIVATE_KEY`

#### 21.8　Factors APIアプリのデプロイ
- `wrangler deploy` を `payment-app-by-factors-api` ディレクトリで実行

#### 21.9　デプロイサマリの出力
- 両アプリのデプロイ済みWorker URLを表示

---

### 第22章　クリーンアップスクリプト（`scripts/cleanup-stack.sh`）

#### 22.1　前提条件チェック
- 必須コマンド: `pnpm`, `terraform`, `awk`

#### 22.2　Terraformリソースの削除
- `terraform destroy -auto-approve` で全Oktaリソースを削除

#### 22.3　Workerシークレットの削除
- `delete_secret()` 関数で個別シークレットを削除（エラーハンドリング付き）
- OIDCアプリ: `OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`
- Factors APIアプリ: `OKTA_DOMAIN`, `OKTA_MGMT_CLIENT_ID`, `OKTA_MGMT_KID`, `OKTA_MGMT_PRIVATE_KEY`

#### 22.4　Workerの削除
- `delete_worker()` 関数で `--force` フラグ付きでWorkerを削除
- 対象: `payment-app-by-oidc`, `payment-app-by-factors-api`

#### 22.5　KV名前空間の削除
- `delete_kv_namespace_if_configured()` 関数
- `wrangler.toml` からKV名前空間IDを取得
- プレースホルダ値の場合はスキップ
- 実IDの場合は `wrangler kv namespace delete` で削除

---

## 第5部　ドキュメント

### 第23章　アプローチ1解説ドキュメント（`docs/APPROACH1_FACTORS_API.md`）

#### 23.1　概要セクション
- Factors APIによるプッシュ承認アプローチの全体像

#### 23.2　フロー図
- ASCII形式でブラウザ → Workers → Okta Management APIの相互作用を図示

#### 23.3　前提条件
- OIE（Okta Identity Engine）の有効化
- Okta Verifyのセットアップ
- APIトークンの作成

#### 23.4　セットアップ手順
- 23.4.1　Okta Verify Authenticatorの設定
- 23.4.2　テストユーザーの作成
- 23.4.3　APIトークンの生成
- 23.4.4　curlによるプッシュファクタ―IDの確認
- 23.4.5　プッシュ通知のテスト送信
- 23.4.6　ポーリングによる検証

#### 23.5　Workers実装の解説
- 型定義、サービス実装、ルートハンドラの解説

#### 23.6　監査証跡
- トランザクションIDによるOkta System Logとの紐付け

#### 23.7　セキュリティ考慮事項
- SSWS トークン vs OAuth for Oktaのトレードオフ

---

### 第24章　アプローチ2解説ドキュメント（`docs/APPROACH2_STEPUP_AUTH.md`）

#### 24.1　概要セクション
- Step-up認証（OAuth 2.0 + acr_values）の全体像

#### 24.2　フロー図
- ASCII形式でブラウザ → Okta認可サーバーの相互作用を図示

#### 24.3　acr_valuesの詳細解説
- 各ACR値のレベルと意味

#### 24.4　IDトークンのクレーム解説
- `auth_time`, `acr`, `amr` の各クレームの意味と検証方法

#### 24.5　Workers実装の解説
- 認証サービス、ルート変更、フロントエンド変更

#### 24.6　IDトークン検証の詳細
- JWT署名検証、イシュアー/オーディエンス検証、ノンス検証、ACR/AMR検証

#### 24.7　監査証跡
- IDトークン自体がOkta署名済みJWTであり、公開検証可能な証拠となる

#### 24.8　本番実装に向けて
- JWKSエンドポイントによる署名検証の堅牢化

---

### 第25章　開発ガイドライン（`AGENTS.md`）

#### 25.1　プロジェクト構成概要
#### 25.2　ビルドコマンド一覧
- `npm run dev` — ローカル開発サーバー起動
- `npm run typecheck` — 型チェック
- `npm run deploy` — デプロイ
- `terraform init && terraform plan` — インフラ計画

#### 25.3　コーディングスタイル
- TypeScript, ES2022, 2スペースインデント, camelCase変数, PascalCase型

#### 25.4　テスト方針
- `wrangler dev` による手動シナリオテスト

#### 25.5　コミットガイドライン
#### 25.6　セキュリティ注意事項

---

## 第6部　2つのアプローチの比較

### 第26章　アーキテクチャ比較

#### 26.1　フロー方式の違い
| 観点 | Factors API | Step-up認証（OIDC） |
|------|-------------|---------------------|
| フロータイプ | バックエンド起動型プッシュ | ブラウザリダイレクト型OIDC |
| ユーザー操作 | スマートフォンでプッシュ通知に応答 | Oktaログイン画面でパスワード＋プッシュ |
| ブラウザ遷移 | なし（同一ページでポーリング） | Okta認証画面へリダイレクト→コールバック |

#### 26.2　承認証拠の違い
| 観点 | Factors API | Step-up認証（OIDC） |
|------|-------------|---------------------|
| 承認の証拠 | Oktaトランザクション結果（WAITING/SUCCESS/REJECTED/TIMEOUT） | IDトークンJWT（Okta署名済み、`auth_time`, `acr`, `amr` クレーム付き） |
| 検証方法 | Okta APIへのポーリング | JWT署名検証（JWKSエンドポイント） |
| 監査証跡 | トランザクションID → Okta System Log | IDトークン自体が署名済み証拠 |

#### 26.3　使用APIの違い
| 観点 | Factors API | Step-up認証（OIDC） |
|------|-------------|---------------------|
| 使用API | Okta Management API（Factors） | OAuth2/OIDC認可サーバー |
| 認証方式 | OAuth for Okta（Private Key JWT） | OAuth2（client_secret_post） |
| トークン発行 | なし | IDトークン + アクセストークン |

#### 26.4　セキュリティ特性の違い
| 観点 | Factors API | Step-up認証（OIDC） |
|------|-------------|---------------------|
| CSRF対策 | 不要（バックエンド完結） | stateパラメータ |
| リプレイ攻撃対策 | トランザクションの一意性 | nonceパラメータ |
| セッション要件 | なし | なし（`max_age=0`で再認証強制） |
| 標準準拠 | Okta独自（CIBAに近い） | OpenID Connect標準 |

#### 26.5　ユースケース別の推奨
- **Factors API推奨:** ブラウザ操作を中断させたくない場合、バックエンド起動型の承認フロー、CIBAに近い体験が必要な場合
- **Step-up認証推奨:** 標準プロトコルへの準拠が必要な場合、IDトークンを第三者検証可能な証拠として保存したい場合、既存のOAuth/OIDC基盤と統合する場合
