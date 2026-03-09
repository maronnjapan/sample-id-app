#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Auth0 Token Vault サンプルアプリ セットアップスクリプト
#
# 前提条件:
#   - auth0 CLI がインストール済み
#   - wrangler CLI がインストール・ログイン済み (wrangler login)
#   - jq がインストール済み
#   - pnpm がインストール済み
#   - terraform または tofu がインストール済み
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="connected-account-token-vault"
TF_DIR="$SCRIPT_DIR/terraform"

# ─── ユーティリティ ──────────────────────────────────────────────────────────

info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }

check_command() {
  command -v "$1" &>/dev/null || error "$1 がインストールされていません。先にインストールしてください。"
}

# terraform または tofu を検出
detect_tf_command() {
  if command -v terraform &>/dev/null; then
    echo "terraform"
  elif command -v tofu &>/dev/null; then
    echo "tofu"
  else
    echo ""
  fi
}

# =============================================================================
# Phase 1: 前提チェック
# =============================================================================

info "前提条件をチェック中..."
check_command jq
check_command pnpm
check_command wrangler
check_command auth0

TF_CMD=$(detect_tf_command)
if [[ -z "$TF_CMD" ]]; then
  error "terraform または tofu がインストールされていません。
  インストール方法:
    Terraform: https://developer.hashicorp.com/terraform/install
    OpenTofu:  https://opentofu.org/docs/intro/install/"
fi
ok "前提条件OK (Terraform コマンド: $TF_CMD)"

# =============================================================================
# Phase 2: Auth0 Terraform provider 用 M2M アプリ作成
# =============================================================================

info "Auth0 CLI にログインします..."
auth0 login --scopes create:client_grants,read:client_grants,update:client_grants,create:users,read:connections,update:connections
ok "Auth0 CLI ログイン完了"

# --- テナント選択 ---
info "Auth0 テナント一覧を取得中..."
TENANTS_JSON=$(auth0 tenants list --json 2>&1)

ACTIVE_TENANTS=$(echo "$TENANTS_JSON" | jq '[.[] | select(.active == true)]' 2>/dev/null || echo "[]")
ACTIVE_COUNT=$(echo "$ACTIVE_TENANTS" | jq 'length' 2>/dev/null || echo "0")

if [[ "$ACTIVE_COUNT" -eq 0 ]]; then
  error "アクティブな Auth0 テナントが見つかりません。'auth0 login' を実行してください。"
elif [[ "$ACTIVE_COUNT" -eq 1 ]]; then
  AUTH0_DOMAIN=$(echo "$ACTIVE_TENANTS" | jq -r '.[0].name // .[0]')
  ok "Auth0 ドメイン: $AUTH0_DOMAIN"
else
  echo ""
  echo "アクティブなテナント:"
  echo "$ACTIVE_TENANTS" | jq -r 'to_entries[] | "  \(.key + 1)) \(.value.name // .value)"'
  echo ""
  read -rp "使用するテナントの番号を選択してください [1-${ACTIVE_COUNT}]: " TENANT_INDEX

  if [[ -z "$TENANT_INDEX" ]] || ! [[ "$TENANT_INDEX" =~ ^[0-9]+$ ]] || \
     [[ "$TENANT_INDEX" -lt 1 ]] || [[ "$TENANT_INDEX" -gt "$ACTIVE_COUNT" ]]; then
    error "無効な選択です。1〜${ACTIVE_COUNT} の番号を入力してください。"
  fi

  AUTH0_DOMAIN=$(echo "$ACTIVE_TENANTS" | jq -r ".[$((TENANT_INDEX - 1))].name // .[$((TENANT_INDEX - 1))]")
  ok "Auth0 ドメイン: $AUTH0_DOMAIN"
fi

info "テナント $AUTH0_DOMAIN をアクティブに設定中..."
auth0 tenants use "$AUTH0_DOMAIN"
ok "アクティブテナント設定完了"

# --- Terraform provider 用 M2M アプリ作成 ---
info "Terraform provider 用 M2M アプリケーションを作成中..."

M2M_STDERR=$(mktemp)
M2M_JSON=$(auth0 apps create \
  --name "terraform-provider" \
  --type m2m \
  --description "Terraform Auth0 provider 用 M2M アプリ" \
  --reveal-secrets \
  --json 2>"$M2M_STDERR") || true

M2M_ERR=$(cat "$M2M_STDERR")
rm -f "$M2M_STDERR"

if [[ -n "$M2M_ERR" ]]; then
  warn "M2M アプリ作成 stderr: $M2M_ERR"
fi

M2M_CLIENT_ID=$(echo "$M2M_JSON" | jq -r '.client_id')
M2M_CLIENT_SECRET=$(echo "$M2M_JSON" | jq -r '.client_secret')

if [[ -z "$M2M_CLIENT_ID" || "$M2M_CLIENT_ID" == "null" ]]; then
  error "Terraform provider 用 M2M アプリの作成に失敗しました。レスポンス: $M2M_JSON"
fi

ok "Terraform provider 用 M2M アプリ作成完了 (Client ID: $M2M_CLIENT_ID)"

# --- Management API への Client Grant 付与 ---
info "Management API への Client Grant を付与中..."

MGMT_API_IDENTIFIER="https://${AUTH0_DOMAIN}/api/v2/"

MGMT_SCOPES='[
    "read:clients", "create:clients", "update:clients", "delete:clients",
    "read:client_grants", "create:client_grants", "update:client_grants", "delete:client_grants",
    "read:connections", "create:connections", "update:connections", "delete:connections",
    "update:connections_options",
    "read:users", "create:users", "update:users", "delete:users",
    "read:resource_servers", "update:resource_servers"
  ]'

MGMT_GRANT_JSON=$(auth0 api post "client-grants" --data '{
  "client_id": "'"$M2M_CLIENT_ID"'",
  "audience": "'"$MGMT_API_IDENTIFIER"'",
  "scope": '"$MGMT_SCOPES"'
}' 2>&1) || true

MGMT_GRANT_ID=$(echo "$MGMT_GRANT_JSON" | jq -r '.id' 2>/dev/null || true)

if [[ -n "$MGMT_GRANT_ID" && "$MGMT_GRANT_ID" != "null" ]]; then
  ok "Management API Client Grant 付与完了"
else
  # 既存の grant を検索して更新を試みる
  info "既存の Client Grant を確認中..."
  ENCODED_AUDIENCE=$(jq -rn --arg a "$MGMT_API_IDENTIFIER" '$a | @uri')
  EXISTING_GRANTS=$(auth0 api get "client-grants?client_id=${M2M_CLIENT_ID}&audience=${ENCODED_AUDIENCE}" 2>/dev/null || true)
  EXISTING_GRANT_ID=$(echo "$EXISTING_GRANTS" | jq -r '.[0].id // empty' 2>/dev/null || true)

  if [[ -n "$EXISTING_GRANT_ID" ]]; then
    # 既存の grant のスコープを更新
    auth0 api patch "client-grants/${EXISTING_GRANT_ID}" --data '{
      "scope": '"$MGMT_SCOPES"'
    }' >/dev/null 2>&1 || true
    ok "Management API Client Grant 更新完了 (既存の grant を更新)"
  else
    error "Management API への Client Grant の付与に失敗しました。
  Auth0 Dashboard で手動設定してください:
    1. Applications > APIs > Auth0 Management API > Machine to Machine Applications
    2. Client ID: $M2M_CLIENT_ID を Authorized にする
  レスポンス: $MGMT_GRANT_JSON"
  fi
fi

# --- Client Grant の検証 ---
info "Management API Client Grant を検証中..."
VERIFY_GRANTS=$(auth0 api get "client-grants?client_id=${M2M_CLIENT_ID}" 2>/dev/null || true)
MGMT_GRANT_EXISTS=$(echo "$VERIFY_GRANTS" | jq '[.[] | select(.audience == "'"$MGMT_API_IDENTIFIER"'")] | length' 2>/dev/null || echo "0")

if [[ "$MGMT_GRANT_EXISTS" -ge 1 ]]; then
  ok "Management API Client Grant 検証OK"
else
  error "Management API Client Grant が見つかりません。Terraform の実行には Management API へのアクセスが必要です。
  Auth0 Dashboard で手動設定してください:
    1. Applications > APIs > Auth0 Management API > Machine to Machine Applications
    2. Client ID: $M2M_CLIENT_ID を Authorized にする"
fi

# TF_VAR として export
export TF_VAR_auth0_domain="$AUTH0_DOMAIN"
export TF_VAR_auth0_provider_client_id="$M2M_CLIENT_ID"
export TF_VAR_auth0_provider_client_secret="$M2M_CLIENT_SECRET"

# =============================================================================
# Phase 3: 変数収集
# =============================================================================

# --- テストユーザーパスワード ---
while true; do
  read -rsp "テストユーザーのパスワードを入力してください: " TEST_USER_PASSWORD
  echo ""
  read -rsp "パスワードを再入力してください: " TEST_USER_PASSWORD_CONFIRM
  echo ""

  if [[ "$TEST_USER_PASSWORD" == "$TEST_USER_PASSWORD_CONFIRM" ]]; then
    break
  else
    warn "パスワードが一致しません。もう一度入力してください。"
  fi
done

if [[ -z "$TEST_USER_PASSWORD" ]]; then
  error "パスワードが空です。"
fi

export TF_VAR_test_user_password="$TEST_USER_PASSWORD"

# --- Google OAuth2 クライアント ---
echo ""
echo "============================================================"
echo "  Google OAuth2 クライアントの認証情報を入力してください。"
echo "  (Google Cloud Console で作成済みのもの)"
echo "============================================================"
echo ""
read -rp "Google Client ID: " GOOGLE_CLIENT_ID
read -rsp "Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  error "Google Client ID / Secret が空です。"
fi

export TF_VAR_google_client_id="$GOOGLE_CLIENT_ID"
export TF_VAR_google_client_secret="$GOOGLE_CLIENT_SECRET"

# =============================================================================
# Phase 4: terraform apply (1回目 - Workers URL なし)
# =============================================================================

info "Terraform を初期化中..."
(cd "$TF_DIR" && $TF_CMD init)
ok "Terraform 初期化完了"

info "Terraform apply を実行中 (1回目: Workers URL なし)..."
export TF_VAR_workers_url=""
(cd "$TF_DIR" && $TF_CMD apply -auto-approve)
ok "Terraform apply 完了 (1回目)"

# Terraform 出力から Client ID を取得
AUTH0_CLIENT_ID=$(cd "$TF_DIR" && $TF_CMD output -raw auth0_client_id)

# auth0 CLI から Client Secret を取得
AUTH0_CLIENT_SECRET=$(auth0 apps show "$AUTH0_CLIENT_ID" --reveal-secrets --json | jq -r '.client_secret')

if [[ -z "$AUTH0_CLIENT_SECRET" || "$AUTH0_CLIENT_SECRET" == "null" ]]; then
  error "Auth0 Client Secret の取得に失敗しました。Auth0 Dashboard で確認してください。"
fi

ok "Auth0 アプリ作成完了"
ok "  Client ID:     $AUTH0_CLIENT_ID"
ok "  Client Secret: ${AUTH0_CLIENT_SECRET:0:10}..."

# =============================================================================
# Phase 5: .dev.vars 生成
# =============================================================================

info ".dev.vars を生成中..."
cat > .dev.vars <<EOF
AUTH0_DOMAIN=$AUTH0_DOMAIN
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET
AUTH0_CALLBACK_URL=http://localhost:5173/callback
AUTH0_CONNECT_CALLBACK_URL=http://localhost:5173/connect/callback
EOF
ok ".dev.vars 生成完了"

# =============================================================================
# Phase 6: Cloudflare Workers デプロイ
# =============================================================================

info "依存関係をインストール中..."
pnpm install

info "Cloudflare Workers にデプロイ中..."
DEPLOY_OUTPUT=$(pnpm run deploy 2>&1)
echo "$DEPLOY_OUTPUT"

WORKERS_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1 || true)

if [[ -z "$WORKERS_URL" ]]; then
  warn "Workers URL を自動取得できませんでした。手動で入力してください。"
  read -rp "Cloudflare Workers の URL を入力: " WORKERS_URL
fi

ok "Workers URL: $WORKERS_URL"

# =============================================================================
# Phase 7: Cloudflare Workers シークレット設定
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
# Phase 8: terraform apply (2回目 - Workers URL 追加)
# =============================================================================

info "Terraform apply を実行中 (2回目: Workers URL 追加)..."
export TF_VAR_workers_url="$WORKERS_URL"
(cd "$TF_DIR" && $TF_CMD apply -auto-approve)
ok "Terraform apply 完了 (2回目) - Auth0 アプリに Workers URL を追加しました"

# =============================================================================
# Phase 9: 完了メッセージ
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
echo "  Terraform 状態確認:  cd terraform && $TF_CMD state list"
echo ""
echo "============================================================"
