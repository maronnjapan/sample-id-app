# sample-id-app

ID 連携・認証プロトコルの実装を試すサンプルリポジトリ。
ブランチごとにテーマを分けて検証内容を保存している。

## ブランチ一覧

| ブランチ | 内容 |
|---|---|
| `okta-toke-exchange` | Okta Org 認可サーバーを使った Token Exchange (RFC 8693) + ID-JAG 取得デモ |

> 過去の検証内容（Auth0 / AWS EventBridge 連携、CIBA など）はコミット履歴を参照。

---

## okta-toke-exchange ブランチ

Okta でログインして取得した ID Token を、Token Exchange (RFC 8693) で
**ID-JAG (Identity Assertion JWT)** に変換するデモアプリ。

### フロー

```
ユーザー
  └─ Okta ログイン (NextAuth / Login App)
       └─ ID Token 取得
            └─ /api/token-exchange (POST) でToken Exchange リクエスト
                 └─ Okta Org AS → ID-JAG 返却 → ブラウザに表示
```

### 技術スタック

- **Next.js 16** (App Router)
- **NextAuth.js v5** (Okta プロバイダ)
- **TypeScript 6**
- **Tailwind CSS 4**
- **Vitest 4**

### セットアップ

#### 1. 依存関係のインストール

```bash
pnpm install
```

#### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` に以下を設定する:

```env
# Okta アプリ（Login App）
OKTA_DOMAIN=https://your-org.okta.com
OKTA_CLIENT_ID=your-client-id
OKTA_CLIENT_SECRET=your-client-secret

# Token Exchange のデフォルト audience（任意）
# OKTA_RESOURCE_AUDIENCE=http://localhost:5001

# NextAuth
AUTH_SECRET=  # npx auth secret で生成
```

Okta 側の設定（XAA 有効化、Managed Connections 等）は [`docs/setup-guide.md`](docs/setup-guide.md) を参照。

#### 3. 開発サーバーの起動

```bash
pnpm dev
```

http://localhost:3000 にアクセスすると `/token-exchange` にリダイレクトされる。

### テスト

```bash
pnpm test
```

### ディレクトリ構成

```
src/
  app/
    api/
      auth/[...nextauth]/   # NextAuth ハンドラ
      token-exchange/       # Token Exchange API エンドポイント
    token-exchange/         # Token Exchange ページ（Server Component）
  components/
    LoginForm.tsx           # Okta ログインボタン
    Logout.tsx              # ログアウトボタン
    TokenExchangeClient.tsx # Token Exchange UI（Client Component）
  lib/
    token-utils.ts          # JWT デコード / Token Exchange ボディ生成
    token-utils.test.ts     # ユニットテスト
  auth.ts                   # NextAuth 設定
  proxy.ts                  # /token-exchange ルートの認証ガード
types/
  global.d.ts               # NextAuth Session / JWT 型拡張
docs/
  setup-guide.md            # Okta セットアップ手順
  xaa-investigation.md      # XAA / ID-JAG 調査メモ
  implementation-status.md  # 実装状況メモ
```

### ドキュメント

- [セットアップ手順](docs/setup-guide.md)
- [XAA / ID-JAG 調査メモ](docs/xaa-investigation.md)
- [実装状況](docs/implementation-status.md)
