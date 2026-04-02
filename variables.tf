variable "okta_org_name" {
  description = "Okta organization name (e.g. dev-123456)"
  type        = string
}

variable "okta_base_url" {
  description = "Okta base URL (e.g. okta.com or oktapreview.com)"
  type        = string
  default     = "okta.com"
}
