#!/bin/bash

set -e

# 色付きメッセージ用
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 設定値
AUTH0_APP_NAME="${AUTH0_APP_NAME:-resource-app}"
D1_DATABASE_NAME="${D1_DATABASE_NAME:-MY_VIKE_DEMO_DATABASE}"
CLOUDFLARE_WORKER_NAME="${CLOUDFLARE_WORKER_NAME:-resource-app}"

# スクリプトのディレクトリに移動
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ===============================
# Auth0 ログインとテナント選択
# ===============================
echo_info "Auth0 にログインしてください..."

# auth0 login を実行
auth0 login --scopes create:client_grants

if [ $? -ne 0 ]; then
    echo_error "Auth0 へのログインに失敗しました"
    exit 1
fi

# ログイン後、テナント一覧を取得してユーザーに選択させる
echo_info "使用するテナントを選択してください..."
TENANTS_JSON=$(auth0 tenants list --json)
TENANT_COUNT=$(echo "$TENANTS_JSON" | jq 'length')

if [ "$TENANT_COUNT" -eq 0 ]; then
    echo_error "利用可能なテナントがありません"
    exit 1
elif [ "$TENANT_COUNT" -eq 1 ]; then
    # テナントが1つの場合は自動選択
    AUTH0_DOMAIN=$(echo "$TENANTS_JSON" | jq -r '.[0].name')
    echo_info "テナントを自動選択しました: $AUTH0_DOMAIN"
else
    # 複数テナントがある場合は選択させる
    echo "利用可能なテナント:"
    TENANT_NAMES=$(echo "$TENANTS_JSON" | jq -r '.[].name')

    select AUTH0_DOMAIN in $TENANT_NAMES; do
        if [ -n "$AUTH0_DOMAIN" ]; then
            break
        else
            echo "有効な番号を選択してください"
        fi
    done

    # 選択したテナントを使用するように設定
    auth0 tenants use "$AUTH0_DOMAIN"
fi

if [ -z "$AUTH0_DOMAIN" ]; then
    echo_error "Auth0 テナント情報の取得に失敗しました"
    exit 1
fi
echo_info "Auth0 ドメイン: $AUTH0_DOMAIN"

# ===============================
# Auth0 アプリの作成
# ===============================

# Auth0 アプリを作成（Regular Web Application）
echo_info "Auth0 アプリ '$AUTH0_APP_NAME' を作成中..."
AUTH0_APP_OUTPUT=$(auth0 apps create \
    --name "$AUTH0_APP_NAME" \
    --type "regular" \
    --description "Resource App for Cloudflare Workers" \
    --callbacks "http://localhost:3000/api/auth/callback/auth0,https://${CLOUDFLARE_WORKER_NAME}.workers.dev/api/auth/callback/auth0" \
    --logout-urls "http://localhost:3000,https://${CLOUDFLARE_WORKER_NAME}.workers.dev" \
    --origins "http://localhost:3000,https://${CLOUDFLARE_WORKER_NAME}.workers.dev" \
    --web-origins "http://localhost:3000,https://${CLOUDFLARE_WORKER_NAME}.workers.dev" \
    --reveal-secrets \
    --json)

if [ $? -ne 0 ]; then
    echo_error "Auth0 アプリの作成に失敗しました"
    exit 1
fi

# 作成したアプリの情報を取得
AUTH0_CLIENT_ID=$(echo "$AUTH0_APP_OUTPUT" | jq -r '.client_id')
AUTH0_CLIENT_SECRET=$(echo "$AUTH0_APP_OUTPUT" | jq -r '.client_secret')

echo_info "Auth0 アプリを作成しました"
echo_info "  Client ID: $AUTH0_CLIENT_ID"
echo_info "  Domain: $AUTH0_DOMAIN"

# ===============================
# Auth0 API の作成とアプリへの紐づけ
# ===============================
AUTH0_API_IDENTIFIER="https://${CLOUDFLARE_WORKER_NAME}.workers.dev"
AUTH0_API_NAME="${AUTH0_APP_NAME}-api"

echo_info "Auth0 API '$AUTH0_API_NAME' を作成中..."
AUTH0_API_OUTPUT=$(auth0 apis create \
    --name "$AUTH0_API_NAME" \
    --identifier "$AUTH0_API_IDENTIFIER" \
    --scopes "read:resources,write:resources" \
    --token-lifetime 86400 \
    --json)

if [ $? -ne 0 ]; then
    echo_error "Auth0 API の作成に失敗しました"
    exit 1
fi

AUTH0_API_ID=$(echo "$AUTH0_API_OUTPUT" | jq -r '.id')
echo_info "Auth0 API を作成しました"
echo_info "  API ID: $AUTH0_API_ID"

# Client Grant を作成してアプリと API を紐づけ
echo_info "Auth0 アプリと API を紐づけ中..."
auth0 api post "client-grants" --data "{
    \"client_id\": \"$AUTH0_CLIENT_ID\",
    \"audience\": \"$AUTH0_API_IDENTIFIER\",
    \"scope\": [\"read:resources\", \"write:resources\"]
}"

if [ $? -ne 0 ]; then
    echo_warn "Client Grant の作成に失敗しました（既に存在する可能性があります）"
else
    echo_info "Auth0 アプリと API を紐づけました"
fi

# ===============================
# ローカル開発用の .env ファイル作成
# ===============================
echo_info "ローカル開発用の .env ファイルを作成中..."

# AUTH_SECRET（セッション暗号化用の秘密鍵を生成）
AUTH_SECRET=$(openssl rand -base64 32)

# AUTH0_ISSUER_BASE_URL (https://domain の形式)
AUTH0_ISSUER_BASE_URL="https://$AUTH0_DOMAIN"

cat > .env << EOF
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET
AUTH0_ISSUER_BASE_URL=$AUTH0_ISSUER_BASE_URL
AUTH_SECRET=$AUTH_SECRET
EOF

echo_info ".env ファイルを作成しました"

# ===============================
# Cloudflare D1 データベースの作成
# ===============================
echo_info "Cloudflare D1 データベースを作成中..."

# Wrangler にログインしているか確認
if ! wrangler whoami &> /dev/null; then
    echo_warn "Wrangler にログインしていません。ログインしてください。"
    wrangler login
fi

# D1 データベースが既に存在するか確認
EXISTING_DB=$(wrangler d1 list --json | jq -r ".[] | select(.name == \"$D1_DATABASE_NAME\") | .uuid")

if [ -n "$EXISTING_DB" ] && [ "$EXISTING_DB" != "null" ]; then
    echo_warn "D1 データベース '$D1_DATABASE_NAME' は既に存在します (UUID: $EXISTING_DB)"
    D1_DATABASE_ID="$EXISTING_DB"
else
    # D1 データベースを作成
    wrangler d1 create "$D1_DATABASE_NAME" --binding DB

    if [ $? -ne 0 ]; then
        echo_error "D1 データベースの作成に失敗しました"
        exit 1
    fi

    echo_info "D1 データベースを作成しました (UUID: $D1_DATABASE_ID)"
fi

# wrangler.jsonc の migrations_dir を設定
echo_info "wrangler.jsonc の migrations_dir を設定中..."
TEMP_FILE=$(mktemp)
jq '.d1_databases[0].migrations_dir = "database/migrations"' wrangler.jsonc > "$TEMP_FILE" && mv "$TEMP_FILE" wrangler.jsonc

# ===============================
# D1 マイグレーションの実行
# ===============================
echo_info "D1 マイグレーションを実行中（リモート）..."

wrangler d1 migrations apply "$D1_DATABASE_NAME" --remote

if [ $? -eq 0 ]; then
    echo_info "マイグレーションが完了しました"
else
    echo_error "マイグレーションに失敗しました"
    exit 1
fi

# ===============================
# Cloudflare Workers へのデプロイ
# ===============================
echo_info "Cloudflare Workers へデプロイ中..."

# ビルドとデプロイ
pnpm run deploy

if [ $? -eq 0 ]; then
    echo_info "デプロイが完了しました"
else
    echo_error "デプロイに失敗しました"
    exit 1
fi

# ===============================
# Cloudflare Workers シークレットの設定
# ===============================
echo_info "Cloudflare Workers シークレットを設定中..."

# AUTH0_CLIENT_ID
echo "$AUTH0_CLIENT_ID" | wrangler secret put AUTH0_CLIENT_ID
echo_info "AUTH0_CLIENT_ID を設定しました"

# AUTH0_CLIENT_SECRET
echo "$AUTH0_CLIENT_SECRET" | wrangler secret put AUTH0_CLIENT_SECRET
echo_info "AUTH0_CLIENT_SECRET を設定しました"

echo "$AUTH0_ISSUER_BASE_URL" | wrangler secret put AUTH0_ISSUER_BASE_URL
echo_info "AUTH0_ISSUER_BASE_URL を設定しました"

echo "$AUTH_SECRET" | wrangler secret put AUTH_SECRET
echo_info "AUTH_SECRET を設定しました"

# ビルドとデプロイ
pnpm run deploy

# ===============================
# AWS Terraform tfvars の更新
# ===============================
echo_info "AWS Terraform tfvars を更新中..."

DEPLOYED_URL="https://${CLOUDFLARE_WORKER_NAME}.workers.dev/api/user/blocked"
AWS_TFVARS_PATH="$SCRIPT_DIR/../aws/terraform.tfvars"

if [ -f "$AWS_TFVARS_PATH" ]; then
    # external_api_urls の行を更新
    sed -i "s|external_api_urls = \[\]|external_api_urls = [\"$DEPLOYED_URL\"]|" "$AWS_TFVARS_PATH"
    echo_info "external_api_urls を更新しました: $DEPLOYED_URL"
else
    echo_warn "AWS terraform.tfvars が見つかりません: $AWS_TFVARS_PATH"
fi

# ===============================
# 完了
# ===============================
echo ""
echo_info "=========================================="
echo_info "セットアップが完了しました！"
echo_info "=========================================="
echo ""
echo_info "Auth0 アプリ情報:"
echo "  Client ID: $AUTH0_CLIENT_ID"
echo "  Issuer Base URL: $AUTH0_ISSUER_BASE_URL"
echo ""
echo_info "Cloudflare D1 データベース:"
echo "  Name: $D1_DATABASE_NAME"
echo "  UUID: $D1_DATABASE_ID"
echo ""
echo_info "Cloudflare Workers:"
echo "  URL: https://${CLOUDFLARE_WORKER_NAME}.workers.dev"
echo ""
echo_info "ローカル開発を開始するには:"
echo "  pnpm run dev"
echo ""
