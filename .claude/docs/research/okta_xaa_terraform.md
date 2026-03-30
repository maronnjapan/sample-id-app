# Okta Token Exchange (XAA) と Terraform の対応状況

調査日: 2026-03-30

## 結論

**TerraformでXAA（Managed Connections）をフルで有効化することはできない。**

## 詳細

### 1. `okta_app_oauth` の grant_types に token-exchange を指定できるか

→ **不可**。`urn:ietf:params:oauth:grant-type:token-exchange` をそのまま追加しても動作しない。  
XAAを有効にするにはアプリの内部プロファイルをXAA対応にする必要があり、Terraformプロバイダはその設定手段を提供していない。

### 2. Managed Connections タブ を Terraform で有効化できるか

→ **不可**。このUIはアプリがXAA対応プロファイルを持つ場合のみ表示される。  
Terraform経由でそのプロファイルを設定する方法は存在しない。

### 3. カタログアプリ（Agent0 XAA）の Terraform 再現

→ **不可**。OINカタログのアプリは特別なテンプレートで、`okta_app_oauth`では複製できない。

### 4. XAA関連で Terraform で管理できるもの

アプリのXAAを手動有効化した後、以下はTerraformで管理可能：

- `okta_auth_server_policy` — トークン交換を許可するアクセスポリシー
- `okta_auth_server_policy_rule` — `grant_type_whitelist` に `urn:ietf:params:oauth:grant-type:token-exchange` を指定
- `okta_auth_server_scope` — 交換後トークンのスコープ定義

## 推奨ワークフロー

1. Okta管理UI上でOINカタログからアプリ追加 or Oktaサポートに依頼してXAA有効化
2. そのアプリの `client_id` を Terraform の data ソースや変数で参照
3. ポリシー・スコープ等の関連設定を Terraform で管理

