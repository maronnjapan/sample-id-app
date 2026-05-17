output "bridge_app_client_id" {
  description = "Client ID of the CI bridge app. Set this as BRIDGE_CLIENT_ID in GitHub Actions secrets."
  value       = okta_app_oauth.bridge_app.client_id
}

output "bridge_app_id" {
  description = "Okta application ID of the bridge app (different from client_id)."
  value       = okta_app_oauth.bridge_app.id
}

output "bridge_policy_id" {
  description = "ID of the authentication policy attached to the bridge app."
  value       = okta_app_signon_policy.bridge_push_policy.id
}
