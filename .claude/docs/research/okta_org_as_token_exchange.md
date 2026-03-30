# Okta Org認可サーバー Token Exchange 調査結果

## 調査日: 2026-03-27

## 結論
OktaのOrg認可サーバー（`/oauth2/v1/token`）はToken Exchange（RFC 8693）をサポートしている。
Cross App Access (XAA) のフローにおいて、ID TokenをID-JAGに交換するステップはOrg認可サーバーで行う**必要がある**（Custom認可サーバーではない）。

## Token Exchangeフロー（2ステップ）

### Step 1: ID Token → ID-JAG（Org認可サーバー）
- エンドポイント: `POST /oauth2/v1/token`
- grant_type: `urn:ietf:params:oauth:grant-type:token-exchange`
- subject_token: ユーザーのID Token
- subject_token_type: `urn:ietf:params:oauth:token-type:id_token`
- requested_token_type: `urn:ietf:params:oauth:token-type:id-jag`
- audience: リソースアプリの認可サーバーIssuer URL
- resource: リソースアプリのURL
- scope: 要求するスコープ（例: `todos.read`）

### Step 2: ID-JAG → Access Token（Custom認可サーバー）
- エンドポイント: リソースアプリのCustom認可サーバーの `/token`
- grant_type: `urn:ietf:params:oauth:grant-type:jwt-bearer`
- assertion: ID-JAGトークン
- scope: 要求するスコープ

## ID-JAGの特徴
- IdPがデジタル署名した中間トークン
- audience、resource、scopeを含む
- 他アプリからの信頼を確立するための仲介トークン

## Okta設定要件
- Cross App Accessを Settings > Features > Early access で有効化
- アプリをOktaカタログに登録
- Manage Connectionsタブで接続を設定
- クライアント認証: client_assertion (JWT Bearer) またはBasic認証
- Grant Type: token-exchange を有効にする必要あり

## Org認可サーバー vs Custom認可サーバー
- Org認可サーバー: Token Exchange（ID Token → ID-JAG）に**必須**
- Custom認可サーバー: JWT-Bearer Grant（ID-JAG → Access Token）に使用

## ソース
- https://developer.okta.com/docs/guides/set-up-token-exchange/main/
- https://developer.okta.com/docs/guides/ai-agent-token-exchange/-/main/
- https://developer.okta.com/blog/2026/02/10/xaa-client
- https://developer.okta.com/blog/2025/09/03/cross-app-access
