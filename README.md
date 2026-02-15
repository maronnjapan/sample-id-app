# Okta CIBA Alternative - Payment Approval Demo

Okta が CIBA (Client Initiated Backchannel Authentication) をカスタム認可サーバーなしではサポートしていない問題に対し、2つの代替アプローチで決済承認フローを実現するデモアプリケーション。

## アプローチ

### 1. Factors API (バックエンド起点のプッシュ通知)

バックエンドから Okta Management API を呼び出し、ユーザーの Okta Verify にプッシュ通知を送信して承認を得る。

**フロー:** 決済リクエスト → Okta Verify にプッシュ送信 → ユーザーが承認 → 決済完了

### 2. OIDC Step-up Authentication (ブラウザリダイレクト型の再認証)

OIDC の `acr_values` と `max_age=0` を使い、ブラウザリダイレクトで MFA 再認証を強制する。

**フロー:** 決済リクエスト → Okta ログイン画面にリダイレクト → パスワード + プッシュで認証 → 決済完了

## 技術スタック

- **ランタイム:** Cloudflare Workers
- **フレームワーク:** Hono + TypeScript
- **認証:** Okta (OAuth 2.0 / OpenID Connect / Management API)
- **ストレージ:** Cloudflare KV (決済レコードの一時保存)
- **IaC:** Terraform (Okta リソースのプロビジョニング)

## プロジェクト構成

```
├── payment-app-by-factors-api/   # アプローチ 1: Factors API
│   └── src/
│       ├── index.ts              # Hono アプリケーション
│       ├── routes/payment.ts     # 決済 API ルート
│       ├── services/factors.ts   # Okta Factors API クライアント
│       ├── services/payment.ts   # KV ストレージ操作
│       └── views/payment.ts      # 決済 UI
├── payment-app-by-oidc/          # アプローチ 2: OIDC Step-up Auth
│   └── src/
│       ├── index.ts
│       ├── routes/payment.ts
│       ├── services/auth.ts      # OIDC 認証・検証
│       ├── services/payment.ts
│       └── views/payment.ts
├── terraform/                    # Okta リソース定義
│   ├── main.tf
│   ├── variables.tf
│   └── terraform.tfvars.example
├── scripts/
│   ├── deploy-stack.sh           # 一括デプロイ
│   └── cleanup-stack.sh          # 一括削除
└── docs/                         # 詳細ドキュメント
```

## セットアップ

### 前提条件

以下のツールがインストールされていること:

- [pnpm](https://pnpm.io/)
- [Terraform](https://www.terraform.io/)
- [jq](https://jqlang.github.io/jq/)
- awk (通常プリインストール済み)

以下のアカウント・認証情報が必要:

- **Okta 開発者アカウント** — [developer.okta.com](https://developer.okta.com/) で無料作成可能
- **Okta API Token** — Okta 管理画面の Security > API > Tokens から発行
- **Cloudflare アカウント** — `wrangler login` で認証済みであること

### 手順

#### 1. Terraform 変数ファイルの作成

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

`terraform/terraform.tfvars` を編集し、Okta の情報を設定する:

```hcl
okta_org_name  = "dev-123456"      # Okta テナントの org 名
okta_base_url  = "okta.com"        
okta_api_token = "your-api-token"  # Okta API Token
```

> `stepup_redirect_uris` はデプロイスクリプトが自動設定するため、手動設定は不要。

#### 2. Cloudflare にログイン

```bash
npx wrangler login
```

#### 3. デプロイの実行

```bash
./scripts/deploy-stack.sh
```

このスクリプトが以下をすべて自動で行う:

1. 両アプリの依存関係インストール (`pnpm install`)
2. Cloudflare KV ネームスペースの作成
3. OIDC アプリを Cloudflare Workers にデプロイ
4. Terraform で Okta リソースをプロビジョニング (OAuth アプリ、認証ポリシー、デモユーザー、RSA 鍵ペア)
5. Terraform の出力値を各 Worker のシークレットとして設定
6. Factors API アプリを Cloudflare Workers にデプロイ

完了後、2つの Worker URL が表示される。

### デモユーザー

Terraform により以下のテストユーザーが自動作成される:

| メールアドレス | パスワード |
|---|---|
| `example@example.com` | `TempPassw0rd!` |

> Factors API アプローチを利用するには、このユーザーで Okta Verify のプッシュ通知を事前にセットアップしておく必要がある。

## ローカル開発

```bash
# Factors API アプリ
cd payment-app-by-factors-api && npm run dev

# OIDC アプリ
cd payment-app-by-oidc && npm run dev
```

`http://localhost:8787` で起動する。

型チェック:

```bash
npm run typecheck
```

## クリーンアップ

すべてのリソースを削除する:

```bash
./scripts/cleanup-stack.sh
```

Okta リソース (Terraform)、Cloudflare Workers、KV ネームスペースがすべて削除される。
