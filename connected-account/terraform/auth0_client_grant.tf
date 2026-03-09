resource "auth0_client_grant" "my_account_api" {
  client_id    = auth0_client.app.client_id
  audience     = "https://${var.auth0_domain}/me/"
  subject_type = "user"

  scopes = [
    "create:me:connected_accounts",
    "read:me:connected_accounts",
    "delete:me:connected_accounts",
  ]
}
