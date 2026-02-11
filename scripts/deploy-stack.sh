#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
STATE_DIR="$ROOT_DIR/scripts/.state"
STATE_FILE="$STATE_DIR/deploy-state.json"
TERRAFORM_DIR="$ROOT_DIR/terraform"
TF_AUTO_VARS="$TERRAFORM_DIR/generated.auto.tfvars"

OIDC_APP_DIR="$ROOT_DIR/payment-app-by-oidc"
FACTORS_APP_DIR="$ROOT_DIR/payment-app-by-factors-api"
STATE_WRITTEN=0
OIDC_PREV_CFG=""
FACTORS_PREV_CFG=""

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' command is required but was not found." >&2
    exit 1
  fi
}

cleanup_on_exit() {
  if [ "$STATE_WRITTEN" -eq 1 ]; then
    return
  fi
  if [ -n "$OIDC_PREV_CFG" ]; then
    set_kv_binding_id "$OIDC_APP_DIR" "$OIDC_PREV_CFG" >/dev/null 2>&1 || true
  fi
  if [ -n "$FACTORS_PREV_CFG" ]; then
    set_kv_binding_id "$FACTORS_APP_DIR" "$FACTORS_PREV_CFG" >/dev/null 2>&1 || true
  fi
}

trap cleanup_on_exit EXIT

ensure_prereqs() {
  require pnpm
  require terraform
  require jq
  require python3
}

ensure_clean_state() {
  mkdir -p "$STATE_DIR"
  if [ -f "$STATE_FILE" ]; then
    echo "State file $STATE_FILE already exists. Run scripts/cleanup-stack.sh before deploying again." >&2
    exit 1
  fi
}

set_kv_binding_id() {
  local app_dir=$1
  local new_id=$2
  local config="$app_dir/wrangler.toml"
  python3 - "$config" "$new_id" <<'PY'
import sys
path, new_id = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

in_kv = False
target = False
prev_id = None
replaced = False

for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('[['):
        in_kv = stripped.startswith('[[kv_namespaces]]')
        target = False
    if in_kv and stripped.startswith('binding') and 'PAYMENT_STORE' in stripped:
        target = True
    if in_kv and target and stripped.startswith('id'):
        prev = stripped.split('=', 1)[1].strip().strip('"')
        prev_id = prev if prev else ''
        indent = line[:len(line) - len(line.lstrip())]
        lines[i] = f'{indent}id = "{new_id}"'
        replaced = True
        break

if not replaced:
    print('Failed to find PAYMENT_STORE KV binding in wrangler.toml', file=sys.stderr)
    sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(prev_id or '')
PY
}

install_dependencies() {
  local app_dir=$1
  if [ -f "$app_dir/package.json" ]; then
    echo "Installing dependencies in $app_dir..."
    (cd "$app_dir" && pnpm install)
  fi
}

get_worker_name() {
  local app_dir=$1
  local name_line
  name_line=$(grep -E '^name\s*=\s*"' "$app_dir/wrangler.toml" | head -n1 || true)
  if [ -z "$name_line" ]; then
    echo "Unable to find worker name in $app_dir/wrangler.toml" >&2
    exit 1
  fi
  echo "$name_line" | sed -E 's/name\s*=\s*"([^"]+)"/\1/'
}

create_kv_namespace() {
  local app_dir=$1
  local title=$2
  echo "Creating KV namespace '$title' for $(basename "$app_dir")..."
  local output
  if ! output=$(cd "$app_dir" && pnpm exec wrangler kv namespace create "$title" --config wrangler.toml --json 2>&1); then
    echo "$output" >&2
    exit 1
  fi
  echo "$output"
  local id
  id=$(echo "$output" | jq -r '.id // empty' 2>/dev/null)
  if [ -z "$id" ]; then
    echo "Failed to parse KV namespace ID from wrangler output." >&2
    echo "$output" >&2
    exit 1
  fi
  echo "$id"
}

deploy_and_get_url() {
  local app_dir=$1
  echo "Deploying $(basename "$app_dir") to capture Workers URL..."
  local output
  if ! output=$(cd "$app_dir" && pnpm exec wrangler deploy 2>&1 | tee /dev/stderr); then
    exit 1
  fi
  local url
  url=$(echo "$output" | python3 - <<'PY'
import re, sys
text = sys.stdin.read()
match = re.search(r'https://[\w.-]+\.workers\.dev', text)
print(match.group(0) if match else "")
PY
  )
  if [ -z "$url" ]; then
    echo "Failed to detect workers.dev URL from deploy output." >&2
    exit 1
  fi
  echo "$url"
}

write_tfvars() {
  local worker_url=$1
  cat > "$TF_AUTO_VARS" <<TFVARS
stepup_redirect_uris = [
  "$worker_url/callback",
  "$worker_url"
]
TFVARS
}

run_terraform() {
  echo "Initializing Terraform..."
  (cd "$TERRAFORM_DIR" && terraform init -input=false)
  echo "Applying Terraform changes..."
  (cd "$TERRAFORM_DIR" && terraform apply -auto-approve -input=false)
}

read_tf_output() {
  local key=$1
  echo "$TF_OUTPUTS" | jq -er ".[\"$key\"].value"
}

put_secret() {
  local app_dir=$1
  local key=$2
  local value=$3
  if [[ "$value" == *\\n* ]]; then
    printf '%b' "$value"
  else
    printf '%s' "$value"
  fi | (cd "$app_dir" && pnpm exec wrangler secret put "$key")
}

save_state() {
  local oidc_kv_id=$1
  local oidc_kv_title=$2
  local oidc_url=$3
  local factors_kv_id=$4
  local factors_kv_title=$5
  local factors_url=$6
  local oidc_prev_id=$7
  local factors_prev_id=$8
  cat > "$STATE_FILE" <<STATE
{
  "kv_namespaces": {
    "payment-app-by-oidc": {
      "id": "$oidc_kv_id",
      "title": "$oidc_kv_title"
    },
    "payment-app-by-factors-api": {
      "id": "$factors_kv_id",
      "title": "$factors_kv_title"
    }
  },
  "workers": {
    "payment-app-by-oidc": "$oidc_url",
    "payment-app-by-factors-api": "$factors_url"
  },
  "terraform_auto_vars": "$TF_AUTO_VARS",
  "wrangler_backup": {
    "payment-app-by-oidc": "$oidc_prev_id",
    "payment-app-by-factors-api": "$factors_prev_id"
  }
}
STATE
}

main() {
  ensure_prereqs
  ensure_clean_state

  install_dependencies "$OIDC_APP_DIR"
  install_dependencies "$FACTORS_APP_DIR"

  local oidc_worker_name factors_worker_name
  oidc_worker_name=$(get_worker_name "$OIDC_APP_DIR")
  factors_worker_name=$(get_worker_name "$FACTORS_APP_DIR")

  local timestamp=$(date +%s)
  local oidc_kv_title="$oidc_worker_name-kv-$timestamp"
  local factors_kv_title="$factors_worker_name-kv-$timestamp"

  local oidc_kv_id factors_kv_id
  oidc_kv_id=$(create_kv_namespace "$OIDC_APP_DIR" "$oidc_kv_title")
  factors_kv_id=$(create_kv_namespace "$FACTORS_APP_DIR" "$factors_kv_title")

  local oidc_prev_kv_id factors_prev_kv_id
  oidc_prev_kv_id=$(set_kv_binding_id "$OIDC_APP_DIR" "$oidc_kv_id")
  factors_prev_kv_id=$(set_kv_binding_id "$FACTORS_APP_DIR" "$factors_kv_id")
  OIDC_PREV_CFG=$oidc_prev_kv_id
  FACTORS_PREV_CFG=$factors_prev_kv_id

  local oidc_worker_url
  oidc_worker_url=$(deploy_and_get_url "$OIDC_APP_DIR")

  echo "Writing Terraform variables with redirect URLs..."
  write_tfvars "$oidc_worker_url"

  run_terraform

  echo "Fetching Terraform outputs..."
  TF_OUTPUTS=$(cd "$TERRAFORM_DIR" && terraform output -json)

  local okta_domain stepup_client_id stepup_client_secret factors_client_id okta_key_id okta_private_key
  okta_domain=$(read_tf_output okta_domain)
  stepup_client_id=$(read_tf_output stepup_client_id)
  stepup_client_secret=$(read_tf_output stepup_client_secret)
  factors_client_id=$(read_tf_output factors_service_client_id)
  okta_key_id=$(read_tf_output okta_key_id)
  okta_private_key=$(read_tf_output okta_private_key)

  echo "Configuring Worker secrets..."
  put_secret "$OIDC_APP_DIR" OKTA_DOMAIN "$okta_domain"
  put_secret "$OIDC_APP_DIR" OKTA_CLIENT_ID "$stepup_client_id"
  put_secret "$OIDC_APP_DIR" OKTA_CLIENT_SECRET "$stepup_client_secret"

  put_secret "$FACTORS_APP_DIR" OKTA_DOMAIN "$okta_domain"
  put_secret "$FACTORS_APP_DIR" OKTA_MGMT_CLIENT_ID "$factors_client_id"
  put_secret "$FACTORS_APP_DIR" OKTA_MGMT_KID "$okta_key_id"
  put_secret "$FACTORS_APP_DIR" OKTA_MGMT_PRIVATE_KEY "$okta_private_key"

  oidc_worker_url=$(deploy_and_get_url "$OIDC_APP_DIR")
  local factors_worker_url
  factors_worker_url=$(deploy_and_get_url "$FACTORS_APP_DIR")

  save_state "$oidc_kv_id" "$oidc_kv_title" "$oidc_worker_url" "$factors_kv_id" "$factors_kv_title" "$factors_worker_url" "$oidc_prev_kv_id" "$factors_prev_kv_id"
  STATE_WRITTEN=1

  cat <<'SUMMARY'

Deployment complete!
- Terraform config stored in generated.auto.tfvars
- State stored in scripts/.state/deploy-state.json
SUMMARY
}

main "$@"
