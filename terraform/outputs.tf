output "stepup_client_id" {
  description = "OAuth Client ID used by the step-up Worker"
  value       = okta_app_oauth.stepup_client.client_id
}

output "stepup_client_secret" {
  description = "OAuth Client Secret for the step-up Worker"
  value       = okta_app_oauth.stepup_client.client_secret
  sensitive   = true
}

output "factors_service_client_id" {
  description = "Client ID for the Factors API service account"
  value       = okta_app_oauth.factors_service.client_id
}

output "okta_domain" {
  description = "Okta Domain"
  value       = "${var.okta_org_name}.${var.okta_base_url}"
}

output "okta_private_key" {
  description = "Okta Private Key for Client Authentication"
  value       = tls_private_key.rsa.private_key_pem
  sensitive   = true
}

output "okta_key_id" {
  description = "Okta Key ID for Client Authentication"
  value       = data.jwks_from_key.jwks.kid
}
