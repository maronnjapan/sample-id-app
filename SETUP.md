# セットアップ手順

このプロジェクトは **mise** を使用して開発環境を管理しています。

## 前提条件

### miseのインストール

以下のいずれかの方法でmiseをインストールしてください：

#### 方法1: 公式インストールスクリプト（推奨）

```bash
curl https://mise.run | sh
```

#### 方法2: パッケージマネージャー

```bash
# macOS (Homebrew)
brew install mise

# Ubuntu/Debian
apt update && apt install -y gpg sudo wget curl
sudo install -dm 755 /etc/apt/keyrings
wget -qO - https://mise.jdx.dev/gpg-key.pub | gpg --dearmor | sudo tee /etc/apt/keyrings/mise-archive-keyring.gpg 1> /dev/null
echo "deb [signed-by=/etc/apt/keyrings/mise-archive-keyring.gpg arch=amd64] https://mise.jdx.dev/deb stable main" | sudo tee /etc/apt/sources.list.d/mise.list
sudo apt update
sudo apt install -y mise
```

### シェル統合の設定

miseを自動的に有効化するため、シェル設定ファイルに以下を追加：

```bash
# ~/.bashrc または ~/.bash_profile の場合
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

# ~/.zshrc の場合
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc

# fishの場合
echo 'mise activate fish | source' >> ~/.config/fish/config.fish
```

設定後、シェルを再起動またはリロード：

```bash
# bashの場合
source ~/.bashrc

# zshの場合
source ~/.zshrc
```

## プロジェクトのセットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/maronnjapan/sample-id-app.git
cd sample-id-app
```

### 2. 必要なツールをインストール

```bash
mise install
```

これで以下のツールが自動的にインストールされます：
- **Terraform 1.6.0**
- **AWS CLI v2**

### 3. セットアップ確認

```bash
mise run setup
```

以下のように表示されれば成功です：

```
======================================
開発環境セットアップ完了！
======================================

インストール済みツール:
  - Terraform: Terraform v1.6.0
  - AWS CLI: aws-cli/2.15.0

次のステップ:
  1. AWS SSOを設定: aws configure sso
  2. SSOログイン: mise run sso-login
  3. Terraform初期化: mise run tf-init

詳細は terraform/README.md を参照してください
======================================
```

## AWS SSOの設定

詳細は `terraform/README.md` を参照してください。

### クイックスタート

```bash
# 1. AWS SSOプロファイルの設定
aws configure sso

# 2. .mise.tomlまたは環境変数にプロファイル名を設定
export AWS_PROFILE=my-sso-profile

# 3. SSOログイン
mise run sso-login

# 4. Terraform設定
cd terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvarsを編集してプロファイル名を設定

# 5. Terraform実行
mise run tf-init
mise run tf-plan
```

## 便利なmiseコマンド

### ツール管理

```bash
# インストール済みツールの確認
mise list

# 利用可能なタスクの表示
mise tasks

# 特定のツールをアップグレード
mise upgrade terraform
```

### タスク実行

```bash
# AWS SSOログイン
mise run sso-login

# Terraformの初期化
mise run tf-init

# Terraformプランの実行
mise run tf-plan

# Terraformの適用
mise run tf-apply

# Terraformリソースの削除
mise run tf-destroy
```

### 環境変数の設定

`.mise.toml`の`[env]`セクションで環境変数を設定できます：

```toml
[env]
AWS_REGION = "ap-northeast-1"
AWS_PROFILE = "my-sso-profile"
```

または、コマンドラインで指定：

```bash
export AWS_PROFILE=my-sso-profile
mise run sso-login
```

## トラブルシューティング

### "mise: command not found"

miseがインストールされていないか、シェル統合が設定されていません。上記のインストール手順を確認してください。

### "No version is set for tool 'terraform'"

```bash
# プロジェクトディレクトリで実行
mise install
```

### ツールのバージョンを変更したい

`.mise.toml`の`[tools]`セクションでバージョンを変更：

```toml
[tools]
terraform = "1.7.0"  # バージョンを変更
awscli = "latest"    # 最新版を使用
```

その後、再インストール：

```bash
mise install
```

### AWS CLI認証エラー

```bash
# SSOログインの状態を確認
aws sts get-caller-identity --profile my-sso-profile

# エラーが出る場合は再ログイン
mise run sso-login
```

## mise.tomlの詳細

`.mise.toml`ファイルで以下を管理できます：

- **[tools]**: 必要なツールとバージョン
- **[env]**: 環境変数
- **[tasks]**: カスタムタスク（スクリプト）

例：

```toml
[tools]
terraform = "1.6.0"
awscli = "2.15.0"

[env]
AWS_REGION = "ap-northeast-1"

[tasks.custom]
description = "カスタムタスクの説明"
run = "echo 'Hello World'"
```

## 参考リンク

- [mise公式サイト](https://mise.jdx.dev/)
- [mise GitHub](https://github.com/jdx/mise)
- [AWS IAM Identity Center (AWS SSO)](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [Terraform公式サイト](https://www.terraform.io/)
