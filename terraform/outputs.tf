output "client_id" {
  description = "OAuth Client ID"
  value       = okta_app_oauth.ciba_payment_client.client_id
}

output "client_secret" {
  description = "OAuth Client Secret"
  value       = okta_app_oauth.ciba_payment_client.client_secret
  sensitive   = true
}

output "okta_domain" {
  description = "Okta Domain"
  value       = "${var.okta_org_name}.${var.okta_base_url}"
}
