resource "auth0_user" "test_user" {
  connection_name = "Username-Password-Authentication"
  email           = var.test_user_email
  password        = var.test_user_password
  email_verified  = true
}
