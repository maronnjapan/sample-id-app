# AWS OIDC Federation for GitHub Actions

このディレクトリには、GitHub ActionsからAWSへOIDC認証を使用してアクセスするためのTerraform設定が含まれています。

## 概要

OIDC（OpenID Connect）を使用することで、AWS アクセスキーやシークレットキーをGitHubに保存する必要がなくなり、短命な認証情報のみで安全にAWSリソースにアクセスできます。

## セットアップ手順

### 1. terraform.tfvarsファイルの作成

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`を編集して、以下の値を設定してください：

```hcl
github_org    = "your-github-username"  # GitHubのユーザー名または組織名
github_repo   = "sample-id-app"         # リポジトリ名
github_branch = "linked-aws-and-auth0-by-event-stream"  # 許可するブランチ名
```

### 2. Terraformの初期化

```bash
terraform init
```

### 3. Terraformプランの確認

```bash
terraform plan
```

### 4. AWSリソースの作成

```bash
terraform apply
```

実行後、以下の情報が出力されます：
- `oidc_provider_arn`: OIDCプロバイダーのARN
- `iam_role_arn`: IAMロールのARN（GitHub Actionsで使用）
- `iam_role_name`: IAMロール名

### 5. GitHub SecretsへのIAMロールARNの登録

`terraform apply`で出力された`iam_role_arn`をGitHubリポジトリのSecretsに登録します：

1. GitHubリポジトリの Settings > Secrets and variables > Actions に移動
2. "New repository secret"をクリック
3. 名前: `AWS_ROLE_ARN`
4. 値: Terraformから出力された`iam_role_arn`の値

## GitHub Actionsでの使用方法

`.github/workflows/terraform.yml`を参照してください。主なポイント：

```yaml
permissions:
  id-token: write  # OIDC トークンの取得に必要
  contents: read

steps:
  - name: Configure AWS Credentials
    uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
      aws-region: ap-northeast-1
```

## セキュリティ上の注意点

1. **最小権限の原則**: デフォルトでは`AdministratorAccess`ポリシーが付与されていますが、本番環境では必要最小限の権限に制限してください。

2. **ブランチ制限**: `terraform/oidc-provider.tf`の以下の部分で、特定のブランチのみに制限しています：
   ```hcl
   values = ["repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.github_branch}"]
   ```

3. **カスタムポリシー**: `oidc-provider.tf`のコメントアウトされた部分を参考に、必要な権限のみを付与するカスタムポリシーを作成してください。

## トラブルシューティング

### "Error: No valid credential sources found"

AWSの認証情報が設定されていません。以下のいずれかの方法で設定してください：
- AWS CLI: `aws configure`
- 環境変数: `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`
- IAMロール（EC2やECS上で実行する場合）

### GitHub Actionsで"Not authorized to perform sts:AssumeRoleWithWebIdentity"

1. IAMロールのARNが正しくGitHub Secretsに設定されているか確認
2. ブランチ名が`terraform.tfvars`で指定したものと一致しているか確認
3. GitHub Actionsワークフローで`permissions.id-token: write`が設定されているか確認

## リソースの削除

```bash
terraform destroy
```

注意: OIDCプロバイダーとIAMロールが削除され、GitHub ActionsからのAWSアクセスができなくなります。
