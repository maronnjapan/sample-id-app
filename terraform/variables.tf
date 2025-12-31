variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "github_org" {
  description = "GitHub organization or user name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch name that is allowed to assume the role"
  type        = string
  default     = "linked-aws-and-auth0-by-event-stream"
}

variable "oidc_role_name" {
  description = "Name of the IAM role for OIDC"
  type        = string
  default     = "GitHubActionsOIDCRole"
}

variable "oidc_provider_url" {
  description = "OIDC provider URL"
  type        = string
  default     = "token.actions.githubusercontent.com"
}
