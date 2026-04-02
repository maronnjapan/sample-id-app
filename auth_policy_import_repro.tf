# ============================================================
# 検証: tofu import 後に catch_all が null になる問題
#
# 前提条件:
#   Okta Identity Engine (OIE) org が必要。
#   Classic org では okta_app_signon_policy 自体が使用不可。
#
# 問題の概要:
#   Okta 管理画面や API で作成した（Terraform 管理外の）認証ポリシーを
#   tofu import で state に取り込むと、catch_all が null になる。
#   Catch-All Rule が DENY・ALLOW どちらの場合でも同現象が発生する。
#
# 根本原因:
#   catch_all は "creation-only argument" であり、プロバイダーの仕様として
#   import・update では Okta API から値を読み返さない。
#   公式ドキュメントより:
#   > "This is only applied during creation and does not affect import or update."
#   https://registry.terraform.io/providers/okta/okta/latest/docs/resources/app_signon_policy
#
# 暫定回避策（このファイルには問題再現のため意図的に未使用）:
#   lifecycle { ignore_changes = [catch_all] }
# ============================================================

variable "enable_catch_all_import_test" {
  description = "catch_all import 問題の検証リソースを作成するか（デフォルト: false）"
  type        = bool
  default     = false
}

# Okta 管理画面で確認した既存ポリシーの ID を指定する
# 管理画面: Security > Authentication Policies > ポリシー選択 > URL末尾のID
variable "catch_all_deny_policy_id" {
  description = "Catch-All Rule が DENY の既存ポリシーID（Okta管理外ポリシーの import 検証用）"
  type        = string
  default     = ""
}

variable "catch_all_allow_policy_id" {
  description = "Catch-All Rule が ALLOW の既存ポリシーID（Okta管理外ポリシーの import 検証用）"
  type        = string
  default     = ""
}

# ============================================================
# 検証ケース1: Catch-All Rule が DENY の既存ポリシーを import
#
# 再現手順:
#   1. Okta 管理画面で Catch-All Rule が DENY の認証ポリシーのIDを確認する
#   2. tofu import -var='enable_catch_all_import_test=true' \
#        -var='catch_all_deny_policy_id=<policy_id>' \
#        'okta_app_signon_policy.catch_all_deny_test[0]' <policy_id>
#   3. tofu plan -var='enable_catch_all_import_test=true' \
#        -var='catch_all_deny_policy_id=<policy_id>'
#
# 期待する結果:
#   - import 後の state: catch_all = null
#   - plan の差分     : catch_all = null → false の差分が表示される（再現成功）
#   ※ catch_all は creation-only のため import で読み返されず null になる
# ============================================================
resource "okta_app_signon_policy" "catch_all_deny_test" {

}

# ============================================================
# 検証ケース2: Catch-All Rule が ALLOW の既存ポリシーを import
#
# DENY・ALLOW どちらの場合でも同現象が発生することを検証するために追加。
#
# 再現手順:
#   1. Okta 管理画面で Catch-All Rule が ALLOW の認証ポリシーのIDを確認する
#   2. tofu import -var='enable_catch_all_import_test=true' \
#        -var='catch_all_allow_policy_id=<policy_id>' \
#        'okta_app_signon_policy.catch_all_allow_test[0]' <policy_id>
#   3. tofu plan -var='enable_catch_all_import_test=true' \
#        -var='catch_all_allow_policy_id=<policy_id>'
#
# 期待する結果:
#   - import 後の state: catch_all = null
#   - plan の差分     : catch_all = null → true の差分が表示される（再現成功）
#   ※ DENY ケースと同様の差分が出ることで、値に依らず import で欠落することを確認できる
# ============================================================
resource "okta_app_signon_policy" "catch_all_allow_test" {
  count = var.enable_catch_all_import_test ? 1 : 0

  name        = "catch-all-allow-import-test"
  description = "Catch-All Rule=ALLOWの既存ポリシーをimport→catch_allがnullになる問題の検証用"
  catch_all   = true
}
