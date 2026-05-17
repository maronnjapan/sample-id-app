# HCP Terraform セットアップ手順

terraform-verify の state を HCP Terraform に保存するための設定手順です。
GitHub Actions・ローカル PC のどちらで実行しても HCP Terraform に state が保存されます。

## 1. HCP Terraform 側の設定

### 1-1. アカウント・Organization の作成

1. [app.terraform.io](https://app.terraform.io) にアクセスしてアカウントを作成
2. Organization を作成（名前は任意）

### 1-2. Workspace の作成

1. Organization のトップページから **New workspace** を選択
2. **Workflow type** は `API-driven workflow` を選択
3. Workspace 名に `terraform-verify` を入力して作成

### 1-3. Execution Mode を Local に変更

> **重要**: デフォルトは Remote 実行（HCP Terraform 上で terraform が動く）ですが、  
> このプロジェクトでは GitHub Actions / ローカル PC 上で実行し state のみを保存します。

1. Workspace の **Settings → General** を開く
2. **Execution Mode** を `Local` に変更して保存

### 1-4. API Token の発行

1. 右上のアカウントメニューから **User Settings → Tokens** を開く
2. **Create an API token** をクリック
3. 発行されたトークンをコピーして控えておく（再表示不可）

---

## 2. versions.tf の Organization 名を書き換える

`terraform-verify/versions.tf` 内のプレースホルダーを実際の Organization 名に変更します。

```hcl
cloud {
  organization = "<YOUR_ORGANIZATION>"  # ← ここを書き換える
  workspaces {
    name = "terraform-verify"
  }
}
```

---

## 3. GitHub リポジトリ側の設定

リポジトリの **Settings → Secrets and variables → Actions → Secrets** から以下を登録します。

| 名前 | 値 |
|---|---|
| `TF_API_TOKEN` | HCP Terraform で発行した API Token |

---

## 4. ローカル PC での認証

HCP Terraform への認証情報をローカルに保存します（初回のみ）。

```bash
terraform login
```

ブラウザが開くので HCP Terraform にログインしてトークンを発行・貼り付けます。  
以降は `terraform init` / `terraform plan` / `terraform apply` がそのまま動きます。

> GitHub Actions では `TF_TOKEN_app_terraform_io` 環境変数で認証するため、  
> `terraform login` は不要です。
