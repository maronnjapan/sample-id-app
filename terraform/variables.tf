variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name (AWS SSO profile)"
  type        = string
  default     = "default"
}

variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
  default     = "sample-id-app"
}
