# Okta XAA Token Exchange 調査結果

調査日: 2026-03-27

## 確定事項

- **エンドポイント**: Org Auth Server `/oauth2/v1/token`（Custom ASは不使用）
- **subject_token_type**: `urn:ietf:params:oauth:token-type:id_token`（id_token が正しい、access_tokenではない）
- **requested_token_type**: `urn:ietf:params:oauth:token-type:id-jag`（Okta独自URN）
- **audience**: Todo0のClient ID、またはOrg ASのIssuer URL（`https://your-org.okta.com`）。どちらが受け入れられるかはOkta設定依存
- **レスポンス**: ID-JAGは`access_token`フィールドに格納される

## XAAに必要な条件

- **OIN登録済みXAAアプリが必須**: 汎用`okta_app_oauth`ではManaged Connectionsが設定できない
  - リクエスティングアプリ: Agent0（OIN名: `test-cwo-app`）
  - リソースアプリ: Todo0（OIN名: `test-cwo-app-2`）
- **Managed Connections**: Terraform未対応。Admin Consoleで手動設定
- **XAA有効化**: Early Access機能。Terraform未対応。Admin ConsoleのSettings > Featuresで有効化

## Terraformの制約

- `okta_app_oauth`に`preconfigured_app`属性でOINアプリをインストール可能
- `redirect_uris`は設定制約でTerraformから上書きできない場合あり（その場合は手動 or terraform import）
- `grant_types`/`response_types`はOINアプリが自動設定するため指定不要
- Managed ConnectionsはTerraformプロバイダ未対応

## 参考URL（Codexが示した）

- https://help.okta.com/oie/ja-jp/content/topics/apps/apps-cross-app-access.htm
- https://developer.okta.com/docs/guides/ai-agent-token-exchange/authserver/main/
- https://developer.okta.com/blog/2026/02/10/xaa-client
