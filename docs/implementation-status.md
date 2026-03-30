# okta-toke-exchange ブランチ 実装状況

> 作成日: 2026-03-30
> ブランチ: `okta-toke-exchange`（リモート未プッシュ）
> リポジトリ: `maronnjapan/sample-id-app`

---

## 概要

Okta Org 認可サーバーを使った **Token Exchange (RFC 8693)** のデモアプリ。
ユーザーが Login App で Okta ログインして取得した ID Token を、Agent0 が
Org AS の `/oauth2/v1/token` に送り **ID-JAG (Identity Assertion JWT)** を取得する。

```
ユーザー
  └─ Login App (NextAuth) で Okta ログイン → ID Token 取得
       └─ Agent0 で Token Exchange リクエスト（client_secret_basic）
            └─ Okta Org AS → ID-JAG 返却
                 └─ ブラウザにデコード済みペイロードを表示
```

---

## ファイル構成と実装内容

### アプリケーション本体（`src/`）

| ファイル | 実装内容 |
|---|---|
| `src/auth.ts` | NextAuth 設定。OktaプロバイダでOIDC認証。JWT/sessionコールバックでID Tokenをサーバー側に保持し、クライアントにはデコード済みペイロードのみ渡す |
| `src/proxy.ts` | `/token-exchange` ルートを認証必須に設定（NextAuth の `auth` を proxy としてエクスポート） |
| `src/app/page.tsx` | ホーム画面。`/token-exchange` へリダイレクト |
| `src/app/token-exchange/page.tsx` | Token Exchange ページ（Server Component）。未認証はログインフォームを表示 |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth ハンドラ |
| `src/app/api/token-exchange/route.ts` | **Token Exchange API エンドポイント**（POST）。セッションから ID Token 取得 → client_secret_basic で Org AS にリクエスト → ID-JAG を返却 |
| `src/lib/token-utils.ts` | ユーティリティ関数群（後述） |
| `src/lib/token-utils.test.ts` | token-utils のユニットテスト（Vitest） |
| `src/components/LoginForm.tsx` | Okta ログインボタン（Server Action） |
| `src/components/Logout.tsx` | ログアウトボタン（Server Action） |
| `src/components/TokenExchangeClient.tsx` | Token Exchange 実行・結果表示の Client Component |
| `types/global.d.ts` | NextAuth の Session・JWT 型拡張（`idTokenPayload`, `idTokenPreview`, `idToken`, `accessToken`） |

### `src/lib/token-utils.ts` の関数

| 関数 | 概要 |
|---|---|
| `decodeJWTPayload(token)` | JWT をデコードしてペイロードを返す（署名検証なし）。ブラウザ・Node.js 両対応 |
| `buildTokenExchangeBody(params)` | RFC 8693 準拠の Token Exchange リクエストボディ（URLSearchParams）を生成。`requested_token_type` は `urn:ietf:params:oauth:token-type:id-jag`（Okta 独自拡張） |
| `copyToClipboard(text)` | クリップボードコピー（UI用） |

### ドキュメント

| ファイル | 内容 |
|---|---|
| `.env.example` | 必要な環境変数のテンプレート |
| `docs/setup-guide.md` | Okta セットアップ手順（XAA 有効化 → Managed Connections → 動作確認） |
| `docs/xaa-investigation.md` | XAA / ID-JAG の調査メモ（audience 制約・エラー原因など） |

---

## 技術的なポイント

### 現在の構成（Login App 単体）
現在の実装は Login App の `OKTA_CLIENT_ID` / `OKTA_CLIENT_SECRET` を認証にも Token Exchange にも共用している。
XAA の Managed Connections を使う場合は OIN 登録済みの Agent0 アプリが別途必要だが、本実装はその前段として ID-JAG が取得できるかを検証する目的で Login App のみで構成している（詳細は `docs/xaa-investigation.md` 参照）。

### クライアント認証方式
Token Exchange のクライアント認証は RFC 6749 Section 2.3.1 の標準的な `client_secret_basic` を使用する（`Authorization: Basic <base64(client_id:client_secret)>`）。

### セキュリティ設計
- 生 ID Token はサーバー側の NextAuth JWT にのみ保持し、クライアントには渡さない
- クライアントにはデコード済みペイロードとトークン先頭50文字のプレビューのみ渡す
- Token Exchange は `/api/token-exchange` の Server-side API Route でのみ実行

---

## テスト

`src/lib/token-utils.test.ts` に以下のテストが実装済み（モックなし・実装コードに対する直接テスト）:

| テストスイート | テスト内容 |
|---|---|
| `decodeJWTPayload` | 正常デコード、scope/aud配列、不正トークンでの null 返却 |
| `buildTokenExchangeBody` | 必須パラメータのみ、audience付き、scope付き、全パラメータ |

実行コマンド: `npm test`

---

## 環境変数

```bash
# Login App（NextAuth / Token Exchange 共用）
OKTA_DOMAIN=https://your-org.okta.com
OKTA_CLIENT_ID=<Okta アプリの Client ID>
OKTA_CLIENT_SECRET=<Okta アプリの Client Secret>

# Token Exchange 設定（任意）
# OKTA_RESOURCE_AUDIENCE=http://localhost:5001  # Todo0 のデフォルト audience

# NextAuth
AUTH_SECRET=<npx auth secret で生成>
```

---

## Terraform で管理できない設定（手動作業が必要）

| 設定 | 理由 |
|---|---|
| Cross App Access の有効化 | Early Access 機能。Terraform プロバイダ未対応 |
| Managed Connections の設定 | XAA 固有リソース。Terraform プロバイダ未対応 |
| OIN アプリの新規作成 | OIN アプリは Admin Console から手動インストールが必要 |

---

## ブランチの状態

- `okta-toke-exchange` はローカルブランチのみ（**リモートにプッシュ未済**）
- `origin/main` との diff は `README.md` の変更のみ（それ以外のファイルはすべて新規ファイルとして未追跡）
- 主要なファイルはすべて `git status` で Untracked として存在している
