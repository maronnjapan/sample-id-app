# ローカル環境からAWS SSOを使用したTerraform実行

このディレクトリには、AWS SSO（IAM Identity Center）を使用してローカル環境からTerraformを実行するための設定が含まれています。

## 概要

AWS SSOを使用することで、以下のメリットがあります：

- **短命な認証情報**: デフォルト8時間で自動失効（1〜12時間に設定可能）
- **長期キー不要**: IAMユーザーのアクセスキー/シークレットキーを保存する必要なし
- **セキュア**: 期限切れ後は自動的に無効化され、再認証が必要
- **最小権限**: IAM Identity Centerで管理された必要最小限の権限のみ

## 前提条件

### AWS側のセットアップ

1. **AWS IAM Identity Center（旧AWS SSO）の有効化**
   - AWS Organizations配下のアカウントまたは単一アカウントで設定可能
   - AWSマネジメントコンソール → IAM Identity Center

2. **ユーザーとパーミッションセットの作成**
   - ユーザーを作成（または既存のIDプロバイダーと連携）
   - パーミッションセット（権限セット）を作成
     - 例: `AdministratorAccess`、`PowerUserAccess`、カスタムポリシー
   - ユーザーにAWSアカウントとパーミッションセットを割り当て

3. **SSOスタートURLの確認**
   - IAM Identity Center → ダッシュボード → 「AWS access portal URL」をメモ
   - 例: `https://d-xxxxxxxxxx.awsapps.com/start`

## ローカル環境のセットアップ

### 1. AWS CLIのインストール

```bash
# macOS (Homebrew)
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# インストール確認
aws --version
```

### 2. AWS SSOプロファイルの設定

```bash
aws configure sso
```

対話形式で以下を入力：

```
SSO session name (Recommended): my-sso-session
SSO start URL [None]: https://d-xxxxxxxxxx.awsapps.com/start
SSO region [None]: ap-northeast-1
SSO registration scopes [None]: sso:account:access

# ブラウザが開いて認証を求められます
# 認証後、使用するアカウントとロールを選択

CLI default client Region [None]: ap-northeast-1
CLI default output format [None]: json
CLI profile name [xxxxx-PowerUserAccess-xxxxxx]: my-sso-profile
```

設定内容は `~/.aws/config` に保存されます：

```ini
[profile my-sso-profile]
sso_session = my-sso-session
sso_account_id = 123456789012
sso_role_name = PowerUserAccess
region = ap-northeast-1
output = json

[sso-session my-sso-session]
sso_start_url = https://d-xxxxxxxxxx.awsapps.com/start
sso_region = ap-northeast-1
sso_registration_scopes = sso:account:access
```

### 3. SSOログイン

```bash
aws sso login --profile my-sso-profile
```

ブラウザが開いて認証を求められます。認証後、一時的な認証情報が `~/.aws/cli/cache/` に保存されます（デフォルト8時間有効）。

### 4. 認証情報の確認

```bash
aws sts get-caller-identity --profile my-sso-profile
```

出力例：
```json
{
    "UserId": "AROAXXXXXXXXX:user@example.com",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_PowerUserAccess_xxxxx/user@example.com"
}
```

## Terraformの使用方法

### 1. terraform.tfvarsファイルの作成

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`を編集：

```hcl
aws_region   = "ap-northeast-1"
aws_profile  = "my-sso-profile"  # 上記で設定したプロファイル名
project_name = "sample-id-app"
```

### 2. Terraformの初期化

```bash
terraform init
```

### 3. Terraformプランの実行

```bash
terraform plan
```

SSOセッションが期限切れの場合、以下のエラーが出ます：
```
Error: failed to refresh cached credentials, the SSO session has expired
```

その場合は再度ログイン：
```bash
aws sso login --profile my-sso-profile
```

### 4. Terraformの適用

```bash
terraform apply
```

## よくある質問

### Q1: セッションの有効期間を確認したい

```bash
# キャッシュされた認証情報を確認
ls -la ~/.aws/cli/cache/
```

各ファイルの更新時刻から8時間が有効期限です。

### Q2: 複数のAWSアカウント/ロールを使い分けたい

異なるプロファイル名で複数のSSO設定を作成できます：

```bash
aws configure sso  # profile名: dev-admin
aws configure sso  # profile名: prod-readonly
```

Terraform実行時にプロファイルを切り替え：

```bash
terraform plan -var="aws_profile=prod-readonly"
```

### Q3: 環境変数で指定したい

```bash
export AWS_PROFILE=my-sso-profile
terraform plan
```

### Q4: セッション有効期間を延長したい

IAM Identity Centerの設定で変更可能（最大12時間）：
- IAM Identity Center → 設定 → セッション設定

### Q5: エラー "Error: No valid credential sources found"

以下を確認：
1. `aws sso login --profile my-sso-profile` でログインしているか
2. `terraform.tfvars` のプロファイル名が正しいか
3. `~/.aws/config` にプロファイルが存在するか

## セキュリティのベストプラクティス

1. **最小権限の原則**
   - 必要最小限のパーミッションセットを使用
   - 開発環境と本番環境で異なる権限レベルを設定

2. **MFA（多要素認証）の有効化**
   - IAM Identity Centerでユーザーに対してMFAを必須化

3. **セッション管理**
   - 作業終了後は `aws sso logout --profile my-sso-profile` でログアウト
   - 定期的に不要なキャッシュをクリア: `rm -rf ~/.aws/cli/cache/*`

4. **terraform.tfvarsの管理**
   - `.gitignore` に `*.tfvars` が含まれていることを確認（機密情報を含む場合）

## トラブルシューティング

### "An error occurred (ExpiredToken) when calling the XXX operation"

セッションが期限切れです。再度ログイン：
```bash
aws sso login --profile my-sso-profile
```

### "Error: failed to configure the backend"

S3バックエンド使用時、SSOログインしてから初期化：
```bash
aws sso login --profile my-sso-profile
terraform init
```

### プロファイルが見つからない

```bash
# 設定を確認
cat ~/.aws/config

# プロファイル一覧
aws configure list-profiles
```

## 参考リンク

- [AWS IAM Identity Center (AWS SSO)](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [AWS CLI v2 - SSO設定](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [Terraform AWS Provider - Authentication](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#authentication-and-configuration)
