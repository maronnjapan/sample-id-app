resource "okta_app_swa" "SampleSWAApp" {
  label          = "SampleSWAApp"
  button_field   = "#login-button"
  password_field = "#password"
  username_field = "#username"
  url            = "http://localhost:5173/login"
}

resource "okta_app_group_assignment" "everyoneInSWAApp" {
  app_id   = okta_app_swa.SampleSWAApp.id
  group_id = "00gtuezbcd8PoUYuC697"
}
