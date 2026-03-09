# --- Auth0 provider 認証 ---

variable "auth0_domain" {
  description = "Auth0 テナントドメイン (例: dev-xxxxx.us.auth0.com)"
  type        = string
}

variable "auth0_provider_client_id" {
  description = "Terraform provider 用 M2M アプリの Client ID"
  type        = string
}

variable "auth0_provider_client_secret" {
  description = "Terraform provider 用 M2M アプリの Client Secret"
  type        = string
  sensitive   = true
}

# --- アプリケーション ---

variable "app_name" {
  description = "Auth0 アプリケーション名"
  type        = string
  default     = "connected-account-token-vault"
}

variable "workers_url" {
  description = "Cloudflare Workers の URL (デプロイ後に設定)"
  type        = string
  default     = ""
}

# --- テストユーザー ---

variable "test_user_email" {
  description = "テストユーザーのメールアドレス"
  type        = string
  default     = "test@example.com"
}

variable "test_user_password" {
  description = "テストユーザーのパスワード"
  type        = string
  sensitive   = true
}

# --- Google OAuth2 ---

variable "google_client_id" {
  description = "GCP OAuth2 クライアント ID"
  type        = string
}

variable "google_client_secret" {
  description = "GCP OAuth2 クライアントシークレット"
  type        = string
  sensitive   = true
}
