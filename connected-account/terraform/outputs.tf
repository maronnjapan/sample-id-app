output "auth0_client_id" {
  description = "Auth0 アプリケーションの Client ID"
  value       = auth0_client.app.client_id
}

output "auth0_domain" {
  description = "Auth0 テナントドメイン"
  value       = var.auth0_domain
}
