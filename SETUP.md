# セットアップ手順

## 前提条件

以下のツールをインストールしてください：

### 1. Nixのインストール

```bash
# Nix（パッケージマネージャー）
curl -L https://nixos.org/nix/install | sh

# インストール後、シェルを再起動
source ~/.nix-profile/etc/profile.d/nix.sh
```

### 2. direnvのインストール

```bash
# macOS (Homebrew)
brew install direnv

# または、Nixでインストール
nix-env -iA nixpkgs.direnv

# シェル設定ファイルに追加（bashの場合）
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc

# zshの場合
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc

# シェルを再起動
```

### 3. miseのインストール

```bash
# macOS (Homebrew)
brew install mise

# または公式インストールスクリプト
curl https://mise.run | sh

# シェル設定ファイルに追加（bashの場合）
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

# zshの場合
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc

# シェルを再起動
```

## プロジェクトのセットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/maronnjapan/sample-id-app.git
cd sample-id-app
```

### 2. 開発環境の有効化

プロジェクトディレクトリに入ると、direnvが自動的に検出します：

```bash
cd sample-id-app
# 初回は以下のメッセージが表示されます：
# direnv: error .envrc is blocked. Run `direnv allow` to approve its content.
```

.envrcを許可：

```bash
direnv allow
```

Nix環境が自動的にセットアップされ、以下のツールが利用可能になります：
- Terraform
- AWS CLI v2
- jq
- git

### 3. mise タスクの実行（オプション）

```bash
# 利用可能なタスクを表示
mise tasks

# AWS SSOログイン
mise run sso-login

# Terraformの初期化
mise run tf-init

# Terraformプランの実行
mise run tf-plan
```

## AWS SSOの設定

詳細は `terraform/README.md` を参照してください。

簡単な手順：

```bash
# AWS SSOプロファイルの設定
aws configure sso

# SSOログイン
aws sso login --profile <your-profile-name>

# Terraform設定
cd terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvarsを編集してプロファイル名を設定

# Terraform実行
terraform init
terraform plan
```

## トラブルシューティング

### "direnv: command not found"

direnvがインストールされていないか、シェル設定が読み込まれていません。上記のdirenvインストール手順を確認してください。

### "nix-shell: command not found"

Nixがインストールされていないか、パスが通っていません。Nixのインストール手順を確認してください。

### ".envrc is blocked"

```bash
direnv allow
```

を実行してください。

### 環境変数が読み込まれない

```bash
# direnvの状態を確認
direnv status

# 強制的に再読み込み
direnv reload
```

## 開発環境から抜ける

単純にディレクトリを離れるだけで、自動的に環境が元に戻ります：

```bash
cd ..
```

## 参考リンク

- [Nix公式サイト](https://nixos.org/)
- [direnv公式サイト](https://direnv.net/)
- [mise公式サイト](https://mise.jdx.dev/)
