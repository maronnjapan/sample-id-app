locals {
  # localhost のコールバック URL (常に含める)
  local_callback_url         = "http://localhost:5173/callback"
  local_connect_callback_url = "http://localhost:5173/connect/callback"
  local_url                  = "http://localhost:5173"

  # Workers URL が設定されている場合のコールバック URL
  workers_callback_url         = var.workers_url != "" ? "${var.workers_url}/callback" : null
  workers_connect_callback_url = var.workers_url != "" ? "${var.workers_url}/connect/callback" : null

  # コールバック URL リスト
  callback_urls = compact([
    local.local_callback_url,
    local.local_connect_callback_url,
    local.workers_callback_url,
    local.workers_connect_callback_url,
  ])

  logout_urls = compact([
    local.local_url,
    var.workers_url != "" ? var.workers_url : null,
  ])

  web_origins = compact([
    local.local_url,
    var.workers_url != "" ? var.workers_url : null,
  ])
}

resource "auth0_client" "app" {
  name        = var.app_name
  description = "Auth0 Token Vault Connected Account デモアプリ"
  app_type    = "regular_web"

  callbacks           = local.callback_urls
  allowed_logout_urls = local.logout_urls
  web_origins         = local.web_origins
  allowed_origins     = local.web_origins

  grant_types = [
    "authorization_code",
    "refresh_token",
    "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
  ]

  token_exchange {
    allow_any_profile_of_type = ["custom_authentication"]
  }

  oidc_conformant = true

  jwt_configuration {
    alg = "RS256"
  }
}
