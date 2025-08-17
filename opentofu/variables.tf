variable "okta_org_name" {
  type = string
}
variable "base_url" {
  type    = string
  default = "okta.com"
}

variable "client_id" {
  type = string
}

variable "scopes" {
  type    = list(string)
  default = ["okta.apps.manage"]
}

variable "private_key_id" {
  type = string
}

variable "private_key_file_path" {
  type = string
}

variable "ci_user_password" {
  type = string
}
