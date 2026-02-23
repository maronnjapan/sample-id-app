#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Auth0 Token Vault サンプルアプリ セットアップスクリプト
#
# 前提条件:
#   - auth0 CLI がインストール・ログイン済み (auth0 login)
#   - wrangler CLI がインストール・ログイン済み (wrangler login)
#   - jq がインストール済み
#   - pnpm がインストール済み
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="connected-account-token-vault"

# ─── ユーティリティ ──────────────────────────────────────────────────────────

info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }

check_command() {
  command -v "$1" &>/dev/null || error "$1 がインストールされていません。先にインストールしてください。"
}

# ─── 前提チェック ────────────────────────────────────────────────────────────

info "前提条件をチェック中..."
check_command auth0
check_command wrangler
check_command jq
check_command pnpm
ok "前提条件OK"

# =============================================================================
# 1. Auth0 テナント情報の取得
# =============================================================================

info "Auth0 テナント情報を取得中..."
AUTH0_DOMAIN=$(auth0 tenants list --json 2>/dev/null | jq -r '.[0]' 2>/dev/null || true)
if [[ -z "$AUTH0_DOMAIN" || "$AUTH0_DOMAIN" == "null" ]]; then
  error "Auth0 テナントが見つかりません。'auth0 login' を実行してください。"
fi
ok "Auth0 ドメイン: $AUTH0_DOMAIN"

# =============================================================================
# 2. Auth0 アプリケーション作成
# =============================================================================

info "Auth0 アプリケーションを作成中..."

# Regular Web Application を作成
APP_JSON=$(auth0 apps create \
  --name "$APP_NAME" \
  --type regular \
  --description "Auth0 Token Vault Connected Account デモアプリ" \
  --callbacks "http://localhost:5173/callback" \
  --logout-urls "http://localhost:5173" \
  --origins "http://localhost:5173" \
  --web-origins "http://localhost:5173" \
  --auth-method "Post" \
  --grants "authorization_code,refresh_token" \
  --json 2>/dev/null)

AUTH0_CLIENT_ID=$(echo "$APP_JSON" | jq -r '.client_id')
AUTH0_CLIENT_SECRET=$(echo "$APP_JSON" | jq -r '.client_secret')

if [[ -z "$AUTH0_CLIENT_ID" || "$AUTH0_CLIENT_ID" == "null" ]]; then
  error "Auth0 アプリケーションの作成に失敗しました。"
fi

ok "Auth0 アプリ作成完了"
ok "  Client ID:     $AUTH0_CLIENT_ID"
ok "  Client Secret: ${AUTH0_CLIENT_SECRET:0:10}..."

# =============================================================================
# 3. My Account API (Token Vault) の設定
# =============================================================================

info "My Account API を設定中..."

# Management API のアクセストークンを取得
MGMT_TOKEN=$(auth0 api get "/api/v2/clients" --query "fields=client_id&include_fields=true" 2>/dev/null | head -c 0 && \
  auth0 api get "/api/v2/" 2>/dev/null | jq -r '.' >/dev/null 2>&1 || true)

# My Account API の Resource Server を取得・確認
MY_ACCOUNT_API_IDENTIFIER="https://${AUTH0_DOMAIN}/me/"
MY_ACCOUNT_API_JSON=$(auth0 api get "/api/v2/resource-servers" --data '{"identifier_filter":"'"$MY_ACCOUNT_API_IDENTIFIER"'"}' 2>/dev/null || true)

# My Account API の Resource Server ID を取得
MY_ACCOUNT_API_ID=$(echo "$MY_ACCOUNT_API_JSON" | jq -r '.[] | select(.identifier == "'"$MY_ACCOUNT_API_IDENTIFIER"'") | .id' 2>/dev/null || true)

if [[ -z "$MY_ACCOUNT_API_ID" || "$MY_ACCOUNT_API_ID" == "null" ]]; then
  info "My Account API が見つかりません。有効化を試みます..."

  # My Account API を有効化 (テナント設定の更新)
  auth0 api patch "/api/v2/tenants/settings" --data '{
    "flags": {
      "enable_apis_section": true
    }
  }' >/dev/null 2>&1 || true

  # My Account API を作成
  auth0 api post "/api/v2/resource-servers" --data '{
    "name": "My Account",
    "identifier": "'"$MY_ACCOUNT_API_IDENTIFIER"'",
    "signing_alg": "RS256",
    "token_lifetime": 86400,
    "scopes": [
      {"value": "create:me:connected_accounts", "description": "Create connected accounts"},
      {"value": "read:me:connected_accounts", "description": "Read connected accounts"},
      {"value": "delete:me:connected_accounts", "description": "Delete connected accounts"}
    ]
  }' >/dev/null 2>&1 || warn "My Account API の作成はスキップされました (既に存在する可能性があります)"

  # 再取得
  MY_ACCOUNT_API_JSON=$(auth0 api get "/api/v2/resource-servers" 2>/dev/null || true)
  MY_ACCOUNT_API_ID=$(echo "$MY_ACCOUNT_API_JSON" | jq -r '.[] | select(.identifier == "'"$MY_ACCOUNT_API_IDENTIFIER"'") | .id' 2>/dev/null || true)
fi

if [[ -n "$MY_ACCOUNT_API_ID" && "$MY_ACCOUNT_API_ID" != "null" ]]; then
  # My Account API のスコープを更新
  auth0 api patch "/api/v2/resource-servers/$MY_ACCOUNT_API_ID" --data '{
    "scopes": [
      {"value": "create:me:connected_accounts", "description": "Create connected accounts"},
      {"value": "read:me:connected_accounts", "description": "Read connected accounts"},
      {"value": "delete:me:connected_accounts", "description": "Delete connected accounts"}
    ]
  }' >/dev/null 2>&1 || warn "スコープの更新はスキップされました"
  ok "My Account API のスコープを設定しました"
else
  warn "My Account API の ID を取得できませんでした。Auth0 ダッシュボードで手動設定してください。"
fi

# アプリケーションに Client Grant を付与
info "アプリケーションに My Account API の権限を付与中..."
auth0 api post "/api/v2/client-grants" --data '{
  "client_id": "'"$AUTH0_CLIENT_ID"'",
  "audience": "'"$MY_ACCOUNT_API_IDENTIFIER"'",
  "scope": [
    "create:me:connected_accounts",
    "read:me:connected_accounts",
    "delete:me:connected_accounts"
  ]
}' >/dev/null 2>&1 || warn "Client Grant の付与はスキップされました (既に存在する可能性があります)"
ok "Client Grant 設定完了"

# =============================================================================
# 4. ローカル開発用 .dev.vars を更新
# =============================================================================

info ".dev.vars を更新中..."
cat > .dev.vars <<EOF
AUTH0_DOMAIN=$AUTH0_DOMAIN
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET
AUTH0_CALLBACK_URL=http://localhost:5173/callback
AUTH0_CONNECT_CALLBACK_URL=http://localhost:5173/connect/callback
EOF
ok ".dev.vars 更新完了"

# =============================================================================
# 5. Cloudflare Workers へデプロイ
# =============================================================================

info "依存関係をインストール中..."
pnpm install

info "Cloudflare Workers にデプロイ中..."
DEPLOY_OUTPUT=$(pnpm run deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# デプロイ先 URL を抽出
WORKERS_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1 || true)

if [[ -z "$WORKERS_URL" ]]; then
  warn "Workers URL を自動取得できませんでした。手動で入力してください。"
  read -rp "Cloudflare Workers の URL を入力: " WORKERS_URL
fi

ok "Workers URL: $WORKERS_URL"

# =============================================================================
# 6. Cloudflare Workers にシークレットを設定
# =============================================================================

info "Cloudflare Workers にシークレットを設定中..."

echo "$AUTH0_DOMAIN" | wrangler secret put AUTH0_DOMAIN 2>/dev/null
ok "AUTH0_DOMAIN を設定しました"

echo "$AUTH0_CLIENT_ID" | wrangler secret put AUTH0_CLIENT_ID 2>/dev/null
ok "AUTH0_CLIENT_ID を設定しました"

echo "$AUTH0_CLIENT_SECRET" | wrangler secret put AUTH0_CLIENT_SECRET 2>/dev/null
ok "AUTH0_CLIENT_SECRET を設定しました"

CALLBACK_URL="${WORKERS_URL}/callback"
CONNECT_CALLBACK_URL="${WORKERS_URL}/connect/callback"

echo "$CALLBACK_URL" | wrangler secret put AUTH0_CALLBACK_URL 2>/dev/null
ok "AUTH0_CALLBACK_URL を設定しました: $CALLBACK_URL"

echo "$CONNECT_CALLBACK_URL" | wrangler secret put AUTH0_CONNECT_CALLBACK_URL 2>/dev/null
ok "AUTH0_CONNECT_CALLBACK_URL を設定しました: $CONNECT_CALLBACK_URL"

# =============================================================================
# 7. Auth0 アプリに Cloudflare Workers URL を設定
# =============================================================================

info "Auth0 アプリのコールバック URL を更新中..."

# 既存のローカル URL と Workers URL の両方を設定
auth0 apps update "$AUTH0_CLIENT_ID" \
  --callbacks "$CALLBACK_URL,http://localhost:5173/callback" \
  --logout-urls "${WORKERS_URL},http://localhost:5173" \
  --origins "${WORKERS_URL},http://localhost:5173" \
  --web-origins "${WORKERS_URL},http://localhost:5173" \
  --json >/dev/null 2>&1

ok "Auth0 アプリのコールバック URL を更新しました"

# =============================================================================
# 完了
# =============================================================================

echo ""
echo "============================================================"
echo -e "\033[1;32m セットアップ完了!\033[0m"
echo "============================================================"
echo ""
echo "  Auth0 Domain:       $AUTH0_DOMAIN"
echo "  Auth0 Client ID:    $AUTH0_CLIENT_ID"
echo "  Workers URL:        $WORKERS_URL"
echo "  Callback URL:       $CALLBACK_URL"
echo "  Connect Callback:   $CONNECT_CALLBACK_URL"
echo ""
echo "  ローカル開発:  cd connected-account && pnpm dev"
echo "  本番アクセス:  $WORKERS_URL"
echo ""
echo "============================================================"
