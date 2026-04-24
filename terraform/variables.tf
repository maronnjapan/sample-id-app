variable "okta_org_name" {
  description = "Okta org name (e.g. 'mycompany' for mycompany.okta.com)"
  type        = string
}

variable "okta_base_url" {
  description = "Okta base URL (okta.com or oktapreview.com)"
  type        = string
  default     = "okta.com"
}

variable "okta_api_token" {
  description = "Optional SSWS API token. If set, the provider uses it instead of private_key_jwt for compatibility with resources not fully supported by OAuth auth."
  type        = string
  sensitive   = true
  default     = null
}

variable "okta_tf_app_client_id" {
  description = "Client ID of the Terraform app (App T) used to authenticate the provider itself"
  type        = string
}

variable "okta_tf_private_key" {
  description = "PEM private key for the Terraform app (App T) provider authentication"
  type        = string
  sensitive   = true
}

variable "okta_tf_private_key_id" {
  description = "Key ID for the PEM private key used for the Terraform app (App T) provider authentication"
  type        = string
}

variable "bridge_app_label" {
  description = "Display name for the CI bridge app in Okta"
  type        = string
  default     = "CI/CD Bridge App (OOB Push)"
}

variable "admin_user_logins" {
  description = "List of Okta login (email) of Super Admins who will approve push notifications"
  type        = list(string)
}
