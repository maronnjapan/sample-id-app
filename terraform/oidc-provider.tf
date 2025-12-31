# GitHub OIDC Provider
data "tls_certificate" "github" {
  url = "https://${var.oidc_provider_url}"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://${var.oidc_provider_url}"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]

  tags = {
    Name = "github-oidc-provider"
  }
}

# IAM Role for GitHub Actions
data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${var.oidc_provider_url}:sub"
      # 特定のブランチのみを許可する場合
      values = ["repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.github_branch}"]

      # すべてのブランチを許可する場合は以下をコメントアウトして使用
      # values = ["repo:${var.github_org}/${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = var.oidc_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  tags = {
    Name = "github-actions-oidc-role"
  }
}

# IAM Policy for the role
# この例では管理者権限を付与していますが、実際には必要最小限の権限に制限してください
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# カスタムポリシーの例（必要に応じて調整）
# resource "aws_iam_policy" "github_actions_custom" {
#   name        = "GitHubActionsCustomPolicy"
#   description = "Custom policy for GitHub Actions"
#
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect = "Allow"
#         Action = [
#           "s3:*",
#           "dynamodb:*",
#           "lambda:*"
#         ]
#         Resource = "*"
#       }
#     ]
#   })
# }
#
# resource "aws_iam_role_policy_attachment" "github_actions_custom" {
#   role       = aws_iam_role.github_actions.name
#   policy_arn = aws_iam_policy.github_actions_custom.arn
# }
