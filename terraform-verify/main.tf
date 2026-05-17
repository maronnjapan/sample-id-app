# # ---------------------------------------------------------------------------
# # Verification Auth Policy
# # Confirms that SUPER_ADMIN enables sign-on policy management via Terraform.
# # This policy is intentionally minimal — its purpose is to exercise the JIT
# # grant/revoke flow rather than to configure production authentication.
# # ---------------------------------------------------------------------------
# resource "okta_app_signon_policy" "verify_policy" {
#   name        = "${var.policy_name_prefix} - Auth Policy (CI)"
#   description = "CI verification policy. Managed by terraform-verify. Safe to delete."
# }

# # Primary rule: allow with any single factor
# resource "okta_app_signon_policy_rule" "verify_allow" {
#   policy_id   = okta_app_signon_policy.verify_policy.id
#   name        = "Allow Any 1FA"
#   priority    = 1
#   status      = "ACTIVE"
#   access      = "ALLOW"
#   factor_mode = "1FA"
#   type        = "ASSURANCE"

#   re_authentication_frequency = "PT0S"
# }

# # Catch-all deny rule
# resource "okta_app_signon_policy_rule" "verify_deny" {
#   policy_id = okta_app_signon_policy.verify_policy.id
#   name      = "Deny all other access"
#   priority  = 98
#   status    = "ACTIVE"
#   access    = "DENY"
# }
