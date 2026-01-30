terraform {
  required_version = ">= 1.0.0"

  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.0"
    }
  }
}

provider "okta" {
  org_name  = var.okta_org_name
  base_url  = var.okta_base_url
  api_token = var.okta_api_token
}

# CIBA対応OAuthアプリケーション
resource "okta_app_oauth" "ciba_payment_client" {
  label = "ciba-payment-demo"
  type  = "service"

  # CIBA grant type
  grant_types = [
    "urn:openid:params:grant-type:ciba"
  ]

  # クライアント認証方式
  # 注: 秘密鍵認証(private_key_jwt)が推奨だが、
  #     エラーになる場合はclient_secret_postを使用
  token_endpoint_auth_method = "client_secret_post"

  response_types = ["token"]

  # スコープ
  # Org Authorization Serverの場合、openidスコープを使用
}

# アプリケーションへのユーザー/グループ割り当て
# 必要に応じて設定
# resource "okta_app_group_assignments" "ciba_payment_groups" {
#   app_id = okta_app_oauth.ciba_payment_client.id
#   group {
#     id = "group-id-here"
#   }
# }
