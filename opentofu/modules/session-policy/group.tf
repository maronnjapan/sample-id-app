
# CIシステム用のユーザーが所属するグループの作成
# ドキュメント：https://search.opentofu.org/provider/opentofu/okta/latest/docs/resources/group
resource "okta_group" "CI_group" {
  name        = "CI Group"
  description = "CIで動かすためのグループです"
}


# CIシステム用ユーザーの作成
# ドキュメント：https://search.opentofu.org/provider/opentofu/okta/latest/docs/resources/user
resource "okta_user" "ci_system" {
  first_name = "CI"
  last_name  = "System"
  login      = "ci.system@example.com"
  email      = "ci.system@example.com"
  password   = var.ci_user_password
}

# CIグループにユーザーを追加
# ドキュメント：https://search.opentofu.org/provider/opentofu/okta/latest/docs/resources/group_memberships
resource "okta_group_memberships" "CI_membership" {
  group_id = okta_group.CI_group.id
  users = [
    okta_user.ci_system.id,
  ]
}


# グローバルセッションポリシーの設定
# ドキュメント：https://search.opentofu.org/provider/opentofu/okta/latest/docs/resources/policy_signon
resource "okta_policy_signon" "LDAP_TOTP_policy" {
  name        = "LDAP TOTP Policy"
  status      = "ACTIVE"
  description = "Policy for LDAP users with TOTP"
  # CI用に作成したユーザーグループのみに適用させる
  groups_included = ["${okta_group.CI_group.id}"]
}

# グローバルセッションポリシー内のルールの設定
# ドキュメント：https://search.opentofu.org/provider/opentofu/okta/latest/docs/resources/policy_rule_signon
resource "okta_policy_rule_signon" "LDAP_TOTP_rule" {
  name      = "LDAP TOTP Rule"
  status    = "ACTIVE"
  policy_id = okta_policy_signon.LDAP_TOTP_policy.id

  # 認証対象の限定
  # セッションポリシーを作る時に、対象ユーザーは限定しているが予期せぬ影響を防ぐために
  # 認証タイプをLDAP_INTERFACEに限定する
  authtype = "LDAP_INTERFACE"

  # セッションの有効期限とアイドル時間の設定
  # CI上での認証しか想定していないため、短い時間に設定
  session_lifetime = 5
  session_idle     = 1

  # 二要素認証の設定
  # サインインごとに常にMFAを要求させる
  mfa_prompt   = "ALWAYS"
  mfa_required = true
}
