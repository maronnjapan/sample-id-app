module "SWAApp" {
  source           = "./modules/session-policy"
  ci_user_password = var.ci_user_password
}
