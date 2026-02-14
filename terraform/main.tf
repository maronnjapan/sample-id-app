terraform {
  required_version = ">= 1.0.0"

  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.5.5"
    }
    tls = {
      source = "hashicorp/tls"
    }
    jwks = {
      source = "iwarapter/jwks"
    }
  }
}

provider "okta" {
  org_name  = var.okta_org_name
  base_url  = var.okta_base_url
  api_token = var.okta_api_token
}

locals {
  stepup_redirect_uris = length(var.stepup_redirect_uris) > 0 ? var.stepup_redirect_uris : [
    "http://localhost:8787/callback",
    "http://localhost:8787"
  ]
}

resource "okta_app_signon_policy" "stepup_policy" {
  name        = "StepUp Payment Policy"
  description = "Authentication policy requiring Okta Verify push"
}

resource "okta_app_signon_policy_rule" "stepup_rule" {
  policy_id = okta_app_signon_policy.stepup_policy.id
  name      = "Step-up Authentication Rule"
  priority  = 1

  constraints = [
    jsonencode({
      knowledge = {
        types = ["password"]
      }
      possession = {
        userVerification = "REQUIRED"
      }
    })
  ]
}

resource "okta_app_oauth" "stepup_client" {
  label                      = "stepup-payment-demo"
  type                       = "web"
  grant_types                = ["authorization_code", "refresh_token"]
  redirect_uris              = local.stepup_redirect_uris
  response_types             = ["code"]
  token_endpoint_auth_method = "client_secret_post"
  authentication_policy      = okta_app_signon_policy.stepup_policy.id
}

resource "tls_private_key" "rsa" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

data "jwks_from_key" "jwks" {
  key = tls_private_key.rsa.private_key_pem
  kid = "b6474acd-a2f7-4163-b693-116f656e216f"
}

locals {
  jwks = jsondecode(data.jwks_from_key.jwks.jwks)
}

resource "okta_app_oauth" "factors_service" {
  label                      = "factors-service-client"
  type                       = "service"
  response_types             = ["token"]
  grant_types                = ["client_credentials"]
  token_endpoint_auth_method = "private_key_jwt"

  jwks {
    kty = local.jwks.kty
    kid = local.jwks.kid
    e   = local.jwks.e
    n   = local.jwks.n
  }
}

resource "okta_app_oauth_api_scope" "factors_service_scopes" {
  app_id = okta_app_oauth.factors_service.id
  issuer = "https://${var.okta_org_name}.${var.okta_base_url}"
  scopes = ["okta.users.read", "okta.users.manage", "okta.factors.read", "okta.factors.manage"]
}

resource "okta_app_oauth_role_assignment" "factors_service_role" {
  client_id = okta_app_oauth.factors_service.client_id
  type      = "HELP_DESK_ADMIN"
}

resource "okta_user" "demo" {
  first_name = "Demo"
  last_name  = "User"
  login      = "example@example.com"
  email      = "example@example.com"
  password   = "TempPassw0rd!"
}

resource "okta_app_user" "stepup_assignment" {
  app_id   = okta_app_oauth.stepup_client.id
  user_id  = okta_user.demo.id
  username = okta_user.demo.email
}
