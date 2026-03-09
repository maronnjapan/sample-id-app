resource "auth0_connection" "google" {
  name     = "google-oauth2"
  strategy = "google-oauth2"

  connected_accounts {
    active = true
  }

  options {
    client_id     = var.google_client_id
    client_secret = var.google_client_secret

    allowed_audiences = []

    scopes = [
      "email",
      "profile",
    ]
  }
}

resource "auth0_connection_client" "google_app" {
  connection_id = auth0_connection.google.id
  client_id     = auth0_client.app.client_id
}
