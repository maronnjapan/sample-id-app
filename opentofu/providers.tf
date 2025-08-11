terraform {
  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 5.2.0"
    }
  }
}

provider "okta" {
  org_name       = var.okta_org_name
  base_url       = var.base_url
  client_id      = var.client_id
  scopes         = var.scopes
  private_key_id = var.private_key_id
  private_key    = file(var.private_key_file_path)
}
