variable "okta_domain" {
  description = "Okta org domain (e.g. myorg.okta.com). Matches the OKTA_DOMAIN repository secret."
  type        = string
}

variable "okta_client_id" {
  description = "Client ID of the Terraform app. Matches the OKTA_TERRAFORM_CLIENT_ID repository secret."
  type        = string
}

variable "okta_private_key" {
  description = "PEM private key for the Terraform app provider authentication"
  type        = string
  sensitive   = true
}

variable "okta_private_key_id" {
  description = "Key ID for the PEM private key"
  type        = string
}

variable "policy_name_prefix" {
  description = "Prefix for the test Auth Policy name, used to identify CI-created resources"
  type        = string
  default     = "JIT Verify"
}


variable "TF_API_TOKEN" {
  description = "HCP Terraform API Token."
  type        = string
}
