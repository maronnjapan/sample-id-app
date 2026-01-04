#!/bin/bash
set -e

auth0 login --scopes create:client_grants

# テナントドメインを取得
AUTH0_DOMAIN=$(auth0 tenants list --json | jq -r '.[] | select(.active == true) | .name')
echo "Auth0 Domain: $AUTH0_DOMAIN"

# 1. アプリ作成
APP_INFO=$(auth0 apps create --name "TerraformProvider" --type m2m --reveal-secrets --json)
CLIENT_ID=$(echo "$APP_INFO" | jq -r '.client_id')

echo "Client ID: $CLIENT_ID"

# Management APIと紐づけて、Event Streamの操作を可能にするスコープ設定
# API定義書：https://auth0.com/docs/ja-jp/api/management/v2/client-grants/post-client-grants

auth0 api post "client-grants" --data '{
  "client_id": "'"$CLIENT_ID"'",
  "audience": "https://'"$AUTH0_DOMAIN"'/api/v2/",
  "scope": ["create:event_streams", "update:event_streams",  "read:event_streams", "delete:event_streams"]
}'

CLIENT_SECRET=$(echo "$APP_INFO" | jq -r '.client_secret')

# 取得したドメイン、クライアントID、シークレットをtfvarsに設定
sed -i "s/auth0_domain = .*/auth0_domain = \"$AUTH0_DOMAIN\"/" auth0/terraform.tfvars
sed -i "s/auth0_client_id = .*/auth0_client_id = \"$CLIENT_ID\"/" auth0/terraform.tfvars
sed -i "s/auth0_client_secret = .*/auth0_client_secret = \"$CLIENT_SECRET\"/" auth0/terraform.tfvars

echo "auth0/terraform.tfvars を作成しました"
