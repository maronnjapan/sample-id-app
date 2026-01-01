terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# AWS SSO プロファイルを使用する設定
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # AWS SSO使用時は以下のように設定することも可能
  # shared_config_files      = ["~/.aws/config"]
  # shared_credentials_files = ["~/.aws/credentials"]
}
