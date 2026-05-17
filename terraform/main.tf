# ---------------------------------------------------------------------------
# Data: look up admin users to assign to the bridge app
# ---------------------------------------------------------------------------
data "okta_user" "admins" {
  for_each = toset(var.admin_user_logins)

  search {
    name       = "profile.login"
    value      = each.value
    comparison = "eq"
  }
}

# ---------------------------------------------------------------------------
# Bridge App (Native Application)
# CI/CD uses this app's client_id to trigger OOB push authentication.
# The app is public (no client secret) and uses Direct Authentication OOB.
# ---------------------------------------------------------------------------
resource "okta_app_oauth" "bridge_app" {
  label  = var.bridge_app_label
  type   = "native"
  status = "ACTIVE"

  # Native apps must include authorization_code; OOB grant types enable Direct Authentication
  grant_types = [
    "authorization_code",
    "urn:okta:params:oauth:grant-type:oob",
    "http://auth0.com/oauth/grant-type/mfa-oob",
  ]

  # Okta still requires a redirect URI when authorization_code is enabled,
  # even though this bridge app is intended to use Direct Authentication.
  redirect_uris = ["http://localhost:18080/callback"]

  response_types = ["code"]

  # Public native app — no client secret needed in CI
  token_endpoint_auth_method = "none"

  # Attach the custom sign-on policy defined below
  authentication_policy = okta_app_signon_policy.bridge_push_policy.id
}

# Grant admin API scopes to the bridge app.
# okta.roles.manage is required for Step 3 (POST /oauth2/v1/clients/{id}/roles).
# The org authorization server issues these scopes — custom auth servers cannot.
resource "okta_app_oauth_api_scope" "bridge_roles_manage" {
  app_id = okta_app_oauth.bridge_app.id
  issuer = "https://${var.okta_org_name}.${var.okta_base_url}"
  # This resource manages Okta API grants on the app. Standard OIDC scopes like
  # openid/profile aren't granted through /api/v1/apps/{id}/grants.
  scopes = ["okta.roles.manage"]
}

# Assign Super Admin users to the bridge app so they can receive push prompts
resource "okta_app_user" "bridge_admins" {
  for_each = data.okta_user.admins

  app_id   = okta_app_oauth.bridge_app.id
  user_id  = each.value.id
  username = each.key
}

# ---------------------------------------------------------------------------
# Authentication Policy: require Okta Verify Push (passwordless, Any 1 factor)
# Using "Any 1 factor" aligns with the passwordless flow triggered by
# /oauth2/v1/primary-authenticate (not the MFA flow requiring /challenge).
# ---------------------------------------------------------------------------
resource "okta_app_signon_policy" "bridge_push_policy" {
  name        = "${var.bridge_app_label} - Push Only"
  description = "Requires Okta Verify push notification for CI/CD JIT privilege flow"
}

# Catch-all deny rule at low priority — explicit allow above takes precedence
resource "okta_app_signon_policy_rule" "deny_others" {
  policy_id = okta_app_signon_policy.bridge_push_policy.id
  name      = "Deny all other access"
  priority  = 98
  status    = "ACTIVE"
  access    = "DENY"
}

# Primary rule: allow with Okta Verify Push as the single factor
resource "okta_app_signon_policy_rule" "require_push" {
  policy_id   = okta_app_signon_policy.bridge_push_policy.id
  name        = "Require Okta Verify Push"
  priority    = 1
  status      = "ACTIVE"
  access      = "ALLOW"
  factor_mode = "1FA"
  type        = "ASSURANCE"

  lifecycle {
    # The provider currently attempts an unnecessary update here when using
    # OAuth/private_key_jwt auth and then fails with "empty access token".
    ignore_changes = [constraints]
  }

  # Require the specific Okta Verify push method instead of a generic possession constraint.
  # This matches the provider's supported app sign-on rule shape for OIE assurance rules.
  constraints = [
    jsonencode({
      authenticationMethods = [
        {
          key    = "okta_verify"
          method = "push"
        }
      ]
    })
  ]

  re_authentication_frequency = "PT0S"
}
