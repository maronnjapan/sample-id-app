terraform {
  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.7.0"
    }
  }
}

provider "okta" {
  org_name       = var.okta_org_name
  base_url       = var.okta_base_url
  client_id      = "0oatz78sblxM4ztmi697"
  private_key    = "./private.key"
  private_key_id = "D4MDUy12cR5u6-r6Bun5S70tSbUZPF08-wqKYTy9eyQ"
  scopes         = ["okta.policies.manage", "okta.apps.read"]
}
