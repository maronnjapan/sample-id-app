#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
STATE_FILE="$ROOT_DIR/scripts/.state/deploy-state.json"
TERRAFORM_DIR="$ROOT_DIR/terraform"
OIDC_APP_DIR="$ROOT_DIR/payment-app-by-oidc"
FACTORS_APP_DIR="$ROOT_DIR/payment-app-by-factors-api"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' command is required but was not found." >&2
    exit 1
  fi
}

require pnpm
require terraform
require jq
require python3

if [ ! -f "$STATE_FILE" ]; then
  echo "State file $STATE_FILE not found. Nothing to cleanup?" >&2
  exit 1
fi

STATE_JSON=$(cat "$STATE_FILE")

get_state_value() {
  local query=$1
  echo "$STATE_JSON" | jq -er "$query"
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
replaced = False

for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('[['):
        in_kv = stripped.startswith('[[kv_namespaces]]')
        target = False
    if in_kv and stripped.startswith('binding') and 'PAYMENT_STORE' in stripped:
        target = True
    if in_kv and target and stripped.startswith('id'):
        indent = line[:len(line) - len(line.lstrip())]
        lines[i] = f'{indent}id = "{new_id}"'
        replaced = True
        break

if not replaced:
    print('Failed to find PAYMENT_STORE KV binding in wrangler.toml', file=sys.stderr)
    sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
PY
}

delete_secret() {
  local app_dir=$1
  local key=$2
  if (cd "$app_dir" && pnpm exec wrangler secret delete "$key"); then
    echo "Deleted secret $key for $(basename "$app_dir")"
  else
    echo "Secret $key missing for $(basename "$app_dir"), skipping" >&2
  fi
}

delete_worker() {
  local app_dir=$1
  if (cd "$app_dir" && pnpm exec wrangler delete --force); then
    echo "Deleted Worker $(basename "$app_dir")"
  else
    echo "Worker $(basename "$app_dir") may already be removed" >&2
  fi
}

delete_kv_namespace() {
  local app_dir=$1
  local namespace_id=$2
  if (cd "$app_dir" && pnpm exec wrangler kv namespace delete --namespace-id "$namespace_id" -y --config wrangler.toml); then
    echo "Deleted KV namespace $namespace_id"
  else
    echo "Failed to delete KV namespace $namespace_id (maybe already gone)" >&2
  fi
}

terraform_auto_vars=$(get_state_value '.terraform_auto_vars')

if [ -f "$terraform_auto_vars" ]; then
  echo "Destroying Terraform-managed resources..."
  (cd "$TERRAFORM_DIR" && terraform destroy -auto-approve -input=false)
else
  echo "Terraform auto vars file $terraform_auto_vars not found. Skipping terraform destroy." >&2
fi

if [ -f "$terraform_auto_vars" ]; then
  rm -f "$terraform_auto_vars"
fi

oidc_kv_id=$(get_state_value '.kv_namespaces["payment-app-by-oidc"].id')
factors_kv_id=$(get_state_value '.kv_namespaces["payment-app-by-factors-api"].id')
oidc_original_binding=$(echo "$STATE_JSON" | jq -r '(.wrangler_backup["payment-app-by-oidc"]) // "your-kv-namespace-id"')
factors_original_binding=$(echo "$STATE_JSON" | jq -r '(.wrangler_backup["payment-app-by-factors-api"]) // "your-kv-namespace-id"')

delete_secret "$OIDC_APP_DIR" OKTA_DOMAIN || true
delete_secret "$OIDC_APP_DIR" OKTA_CLIENT_ID || true
delete_secret "$OIDC_APP_DIR" OKTA_CLIENT_SECRET || true

delete_secret "$FACTORS_APP_DIR" OKTA_DOMAIN || true
delete_secret "$FACTORS_APP_DIR" OKTA_MGMT_CLIENT_ID || true
delete_secret "$FACTORS_APP_DIR" OKTA_MGMT_KID || true
delete_secret "$FACTORS_APP_DIR" OKTA_MGMT_PRIVATE_KEY || true

delete_worker "$OIDC_APP_DIR" || true
delete_worker "$FACTORS_APP_DIR" || true

delete_kv_namespace "$OIDC_APP_DIR" "$oidc_kv_id" || true
delete_kv_namespace "$FACTORS_APP_DIR" "$factors_kv_id" || true

set_kv_binding_id "$OIDC_APP_DIR" "$oidc_original_binding" >/dev/null
set_kv_binding_id "$FACTORS_APP_DIR" "$factors_original_binding" >/dev/null

rm -f "$STATE_FILE"

echo "Cleanup complete."
