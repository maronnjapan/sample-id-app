# 検証用認証ポリシー
resource "okta_app_signon_policy" "test_policy" {
  name        = "test-auth-policy"
  description = "terraform destroy 403エラー検証用の認証ポリシー"
}
