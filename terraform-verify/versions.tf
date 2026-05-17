terraform {
  required_version = ">= 1.5"

  # HCP Terraform ワークスペースの Execution Mode は "Local" に設定すること
  # (CI ランナー上で実行し、state のみ HCP Terraform に保存する)。
  # 認証: ローカルは `terraform login`、CI は TF_TOKEN_app_terraform_io 環境変数。
  cloud {
    organization = "state-okta-upgrade-super-admin-by-push"
    workspaces {
      name = "terraform-verify"
    }
  }

  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.9.0"
    }
  }
}

locals {
  # Parse "myorg.okta.com" → org_name = "myorg", base_url = "okta.com"
  _domain_parts = split(".", var.okta_domain)
  okta_org_name = local._domain_parts[0]
  okta_base_url = join(".", slice(local._domain_parts, 1, length(local._domain_parts)))
}

provider "okta" {
  org_name       = local.okta_org_name
  base_url       = local.okta_base_url
  client_id      = var.okta_client_id
  private_key    = var.okta_private_key
  private_key_id = var.okta_private_key_id
  scopes         = ["okta.policies.manage"]
}
