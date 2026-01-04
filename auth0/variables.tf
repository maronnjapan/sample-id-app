variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "auth0_domain" {
  description = "Auth0のドメイン"
  type        = string
}

variable "auth0_client_id" {
  description = "Terraform用のAuth0アプリのClientID"
  type        = string
}

variable "auth0_client_secret" {
  description = "Terraform用のAuth0アプリのClientSecret"
  type        = string
}
