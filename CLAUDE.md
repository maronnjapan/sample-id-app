OktaのDirect Authentication (OOB) を利用して、CI/CD上で人間の承認（プッシュ通知）をトリガーにし、一時的に特権を付与するための実装要件をまとめました。

# Okta Direct Authentication (OOB) によるJIT特権付与の実装要件

## 1. Okta組織設定 (Org Configuration)
- **Identity Engine (OIE) の利用**: 本フローはOIE環境が必須。
- **Authenticatorの設定**: 
  - `Okta Verify` が有効であること。
  - `Push notification` オプションが有効であること。

## 2. 中継用アプリの設定 (Bridge App: Native Application)
CI/CDが人間の管理者として「なりすます」ための認証エンドポイントとして機能します。
- **許可する Grant Type**: `Direct Authentication` セクションで以下を有効化:
  - `Out-of-Band (OOB)`
  - `MFA Out-of-Band`
- **OAuthスコープ**: 以下の管理APIスコープを付与し、管理者による承認（Grant）を完了させておく:
  - `okta.roles.manage` (Terraform用アプリへのロール付与に必須)
  - `openid`, `profile`
- **ユーザー割り当て**: 承認を行う実際の人間（Super Admin）をこのアプリにアサインする。
- **認証ポリシー (Authentication Policy)**: 
  - このアプリ専用のポリシーを作成し、`Any 1 factor` または `Password + Another factor` で `Okta Verify (Push)` を要求するように設定。

## 3. メインのTerraform用アプリ (Main API Service: App T)
- **クライアント認証**: `private_key_jwt` 等、既存の設定を維持。
- **初期権限**: 普段は `Organization Administrator` または権限なし。

## 4. CI/CD スクリプトの実装ロジック
スクリプト（Python等）で以下のAPIシーケンスを実装します。

### Step 1: 認証の開始 (Primary Authentication)
- **Endpoint**: `POST /oauth2/v1/primary-authenticate`
- **Payload**:
  - `client_id`: 中継用アプリのID
  - `login_hint`: 人間管理者のメールアドレス(対象のプルリクエストをマージした人のメールアドレス)
  - `channel_hint`: `push`
  - `challenge_hint`: `urn:okta:params:oauth:grant-type:oob`
- **取得データ**: レスポンスから `oob_code` と `binding_code` (3桁の数字) を取得。

### Step 2: 承認待機とトークン取得 (Polling)
- **Endpoint**: `POST /oauth2/v1/token`
- **Payload**:
  - `grant_type`: `urn:okta:params:oauth:grant-type:oob`
  - `oob_code`: Step 1で取得した値
  - `client_id`: 中継用アプリのID
- **挙動**: 承認されるまで5秒間隔等でポーリング。承認完了後、人間管理者の権限を持つ `access_token` を取得。

### Step 3: Terraform Appへのロール付与
- **Endpoint**: `POST /oauth2/v1/clients/{App_T_ID}/roles`
- **Auth**: Step 2で取得したトークン（Bearer）を使用。
- **Payload**: `{"type": "SUPER_ADMIN"}`

### Step 4: Terraform実行とクリーンアップ
- **Terraform実行**: `terraform apply` を実施。
- **ロール剥奪**: 完了後、`DELETE /oauth2/v1/clients/{App_T_ID}/roles/{roleID}` を実行し、特権を即座に削除 [1]。


### 運用のポイント
*   **バインディングコード**: `primary-authenticate` のレスポンスに含まれる数字をCIのログに出力させることで、管理者がスマホで正しい通知を承認しているか確認できるようにします。
*   **Passwordless**: 管理者の設定が「Passwordless」になっていれば、CI/CD側にパスワードを一切保存せずにプッシュ通知だけでトークンを発行できます。