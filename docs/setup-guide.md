# Okta Token Exchange セットアップ手順

Okta Org認可サーバーで Token Exchange (RFC 8693) を実行し、ID-JAG を取得できるかを検証するためのセットアップ手順。

## アーキテクチャ概要

本アプリは **2つの Okta アプリ**を使用する。

| アプリ | 種別 | 役割 | 認証方式 |
|---|---|---|---|
| Agent0 (`test-cwo-app`) | OIN XAA | ユーザーログイン + Token Exchange | client_secret_basic |
| Todo0 (`test-cwo-app-2`) | OIN XAA | リソースアプリ（ID-JAGのaudience先） | — |

**フロー:**
```
ユーザー → Agent0 でログイン → ID Token 取得
        → Agent0 で Token Exchange → Org AS
        → ID-JAG 取得
```

### なぜ OIN アプリが必要か

Managed Connections の設定は OIN 登録済みかつ XAA 対応のアプリでのみ有効になる。
汎用 OIDC アプリでは Admin Console に「Manage Connections」タブが表示されず、XAA Token Exchange が動作しない。

## 前提条件

- Okta Integrator Free Plan org（Free Org で XAA は利用可能）
- Super admin 権限のユーザーアカウント
- Node.js（>= 18）

## 1. OIN アプリを手動インストールする

Agent0・Todo0 は Admin Console からインストールする。

1. Okta Admin Console にログイン
2. **Applications > Browse App Catalog** で「Agent0」を検索
   → **Agent0 - Cross App Access (XAA) Sample Requesting App** を追加
   - Sign On タブ → **Authentication** セクションで **Client Secret** を選択
   - Sign-in redirect URI に `http://localhost:3000/api/auth/callback/okta` を設定
   - Sign-out redirect URI に `http://localhost:3000` を設定
   - インストール後に表示される **Client ID** と **Client Secret** を控える
3. 同様に「Todo0」を検索して **Todo0 - Cross App Access (XAA) Sample Resource App** を追加

## 2. ユーザーをアプリに割り当てる

Token Exchange を実行するには、ユーザーが **Agent0 と Todo0 の両方**に割り当てられている必要がある。

1. **Applications > Applications** で **Agent0** を選択
2. **Assignments** タブ → **Assign to People**（または **Assign to Groups**）でログインに使うユーザーを割り当て
3. 同様に **Todo0** にも同じユーザーを割り当てる

> ユーザーが Todo0 に割り当てられていない場合、Token Exchange は `access_denied` または `invalid_grant` で失敗する。

## 3. .env ファイルを作成

```bash
cp .env.example .env
```

`.env` を以下の内容で編集する:

```env
# Agent0（NextAuth / Token Exchange 共用）
OKTA_DOMAIN=https://your-org.okta.com
OKTA_CLIENT_ID=<Agent0 の Client ID>
OKTA_CLIENT_SECRET=<Agent0 の Client Secret>

# Token Exchange のデフォルト audience（任意）
# OKTA_RESOURCE_AUDIENCE=http://localhost:5001

# NextAuth
AUTH_SECRET=  # npx auth secret で生成
```

AUTH_SECRET を生成:

```bash
npx auth secret
```

## 4. Cross App Access (XAA) の有効化【手動】

1. Okta Admin Console → **Settings > Features**
2. **Early access features** で **Cross App Access** を **Enable**
   - 表示されない場合は Okta サポートへ有効化を依頼
3. 有効化後、Admin Console をリフレッシュ

## 5. Managed Connections の設定【手動】

1. **Applications > Applications** で **Agent0** を選択
2. **Manage Connections** タブを開く
   - タブが表示されない場合: 手順4（XAA有効化）が未完か、Agent0 が OIN XAA アプリでない
3. 「Apps providing consent」セクションで **Add resource apps** → **Todo0** を選択
4. **Save**

## 6. アプリの起動

```bash
npm install
npm run dev
```

http://localhost:3000 にアクセス。

## 7. Token Exchange の検証

1. デモユーザーで Okta ログイン（Agent0 経由）
2. 「Token Exchange ページへ」をクリック
3. Token Exchange 設定で以下のパターンを試す:

| パターン | Audience | 確認ポイント |
|---|---|---|
| Org AS Issuer URL | `https://your-org.okta.com` | Org AS 直接指定の挙動 |
| Custom AS Issuer URL | `https://your-org.okta.com/oauth2/default` | Okta ドキュメントの標準例 |
| Todo0 の Client ID | Agent0 のアプリ詳細ページで確認 | client_id 指定の挙動 |
| 空欄 | — | OKTA_RESOURCE_AUDIENCE の値が使われる |

4. 「Token Exchange 実行」をクリック
5. 成功: ID-JAG のペイロードが表示される
6. 失敗: エラーヒントに従って設定を確認

## トラブルシューティング

### `unsupported_grant_type`
- XAA が未有効化 → 手順4
- Agent0 が OIN XAA アプリでない → OIN からインストール

### `invalid_grant` / `access_denied`
- ID Token の有効期限切れ → 再ログイン
- Managed Connections 未設定 → 手順5
- ユーザーが Todo0 に未割り当て → 手順2

### `invalid_target`
- audience が Okta に認識されていない
- `https://your-org.okta.com` → `https://your-org.okta.com/oauth2/default` の順に試す

### `401 Unauthorized`
- `OKTA_CLIENT_ID` / `OKTA_CLIENT_SECRET` が正しくない

### `403 Forbidden`
- Managed Connections 未設定 → 手順5

### `Manage Connections` タブが表示されない
- XAA が未有効化 → 手順4
- Agent0 が OIN XAA アプリでない（汎用アプリでは表示されない）

## 手動作業が必要な設定

| 設定 | 理由 |
|---|---|
| Cross App Access の有効化 | Early Access 機能（Settings > Features から有効化） |
| Managed Connections の設定 | XAA 固有のリソース（Admin Console のみ） |
| OIN アプリの追加 | アプリカタログから手動インストールが必要 |
| ユーザーのアプリ割り当て | Admin Console から手動割り当てが必要 |
