terraform {
  required_version = ">= 1.5"

  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.9.0"
    }
  }
}

provider "okta" {
  org_name       = var.okta_org_name
  base_url       = var.okta_base_url
  api_token      = var.okta_api_token
  client_id      = var.okta_api_token == null ? var.okta_tf_app_client_id : null
  scopes         = var.okta_api_token == null ? ["okta.apps.manage", "okta.appGrants.manage", "okta.policies.manage", "okta.authenticators.manage", "okta.users.manage", "okta.roles.manage"] : null
  private_key    = var.okta_api_token == null ? var.okta_tf_private_key : null
  private_key_id = var.okta_api_token == null ? var.okta_tf_private_key_id : null
}
