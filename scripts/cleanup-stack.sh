#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TERRAFORM_DIR="$ROOT_DIR/terraform"
OIDC_APP_DIR="$ROOT_DIR/payment-app-by-oidc"
FACTORS_APP_DIR="$ROOT_DIR/payment-app-by-factors-api"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' command is required but was not found." >&2
    exit 1
  fi
}

ensure_prereqs() {
  require pnpm
  require terraform
  require awk
}

read_kv_binding_id() {
  local app_dir=$1
  local config="$app_dir/wrangler.toml"
  awk '
    BEGIN { in_kv = 0; target = 0 }
    /^\[\[/ {
      in_kv = ($0 ~ /^\[\[kv_namespaces\]\]/)
      target = 0
    }
    in_kv && $0 ~ /^[[:space:]]*binding[[:space:]]*=[[:space:]]*"PAYMENT_STORE"/ { target = 1 }
    in_kv && target && $0 ~ /^[[:space:]]*id[[:space:]]*=/ {
      line = $0
      gsub(/^[[:space:]]*id[[:space:]]*=[[:space:]]*"/, "", line)
      gsub(/"[[:space:]]*$/, "", line)
      print line
      exit
    }
  ' "$config"
}


delete_worker() {
  local app_dir=$1
  if (cd "$app_dir" && pnpm exec wrangler delete --force); then
    echo "Deleted Worker $(basename "$app_dir")"
  else
    echo "Worker $(basename "$app_dir") may already be removed" >&2
  fi
}

reset_kv_binding_id() {
  local app_dir=$1
  sed -i 's/id = "[0-9a-f]\{32\}"/id = "your-kv-namespace-id"/' "$app_dir/wrangler.toml"
  echo "Reset KV namespace ID in $(basename "$app_dir")/wrangler.toml"
}

delete_kv_namespace_if_configured() {
  local app_dir=$1
  local id
  id=$(read_kv_binding_id "$app_dir")

  if [ -z "$id" ] || [ "$id" = "your-kv-namespace-id" ]; then
    echo "PAYMENT_STORE KV id is not configured in $(basename "$app_dir")/wrangler.toml, skipping KV delete."
    return
  fi

  if (cd "$app_dir" && pnpm exec wrangler kv namespace delete --namespace-id "$id" -y --config wrangler.toml); then
    echo "Deleted KV namespace $id for $(basename "$app_dir")"
  else
    echo "KV namespace $id may already be removed" >&2
  fi

  reset_kv_binding_id "$app_dir"
}

main() {
  ensure_prereqs

  echo "Destroying Terraform-managed resources..."
  (
    cd "$TERRAFORM_DIR"
    terraform init -input=false
    terraform destroy -auto-approve -input=false
  )

  delete_worker "$OIDC_APP_DIR" || true
  delete_worker "$FACTORS_APP_DIR" || true

  delete_kv_namespace_if_configured "$OIDC_APP_DIR" || true
  delete_kv_namespace_if_configured "$FACTORS_APP_DIR" || true

  echo "Cleanup complete."
}

main "$@"
