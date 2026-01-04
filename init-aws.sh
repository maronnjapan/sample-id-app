#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$SCRIPT_DIR/aws"
AUTH0_DIR="$SCRIPT_DIR/auth0"

echo "=== AWS SSO 初期設定スクリプト ==="
echo ""

# プロファイル名を入力
read -p "作成するプロファイル名を入力してください: " PROFILE_NAME

if [[ -z "$PROFILE_NAME" ]]; then
    echo "エラー: プロファイル名が入力されていません"
    exit 1
fi

# AWS SSO設定を実行
echo ""
echo "AWS SSO設定を開始します..."
echo ""

aws configure sso --profile "$PROFILE_NAME"

# アカウントIDを取得
ACCOUNT_ID=$(aws configure get sso_account_id --profile "$PROFILE_NAME")

if [[ -z "$ACCOUNT_ID" ]]; then
    echo "エラー: アカウントIDを取得できませんでした"
    exit 1
fi

# AWS SSO ログイン実行
echo ""
echo "AWS SSOにログインします..."
aws sso login --profile "$PROFILE_NAME"

# terraform.tfvars ファイルの更新
echo ""
update_tfvars() {
    local file="$1" key="$2" value="$3"
    [[ ! -f "$file" ]] && return
    if grep -q "^$key" "$file"; then
        sed -i "s/^$key *= *\"[^\"]*\"/$key = \"$value\"/" "$file"
    else
        echo "$key = \"$value\"" >> "$file"
    fi
    echo "更新: $file ($key)"
}

update_tfvars "$AWS_DIR/terraform.tfvars" "aws_profile" "$PROFILE_NAME"
update_tfvars "$AUTH0_DIR/terraform.tfvars" "aws_account_id" "$ACCOUNT_ID"

echo ""
echo "=== 設定完了 ==="
