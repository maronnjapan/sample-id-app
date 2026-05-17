#!/usr/bin/env bash
# Detect deletion of protected Terraform resources using terraform plan -json.
#
# Environment variables:
#   TF_DIR       (required) Directory containing Terraform configuration
#   POLICY_FILE  (optional) Path to JIT policy JSON; default: scripts/jit-policy.json
#   TF_VAR_*     Terraform variables passed through to the provider
#
# Policy JSON schema:
#   protected_resource_types  array of Terraform resource type strings
#
# Exit codes:
#   0  Protected resource deletion detected — JIT escalation required
#   1  No protected resource deletion detected
#   2  Invalid input or missing dependency

set -euo pipefail

TF_DIR="${TF_DIR:-}"
POLICY_FILE="${POLICY_FILE:-scripts/jit-policy.json}"

if [[ -z "${TF_DIR}" ]]; then
  echo "ERROR: TF_DIR must be set." >&2
  exit 2
fi

if [[ ! -d "${TF_DIR}" ]]; then
  echo "ERROR: Directory not found: ${TF_DIR}" >&2
  exit 2
fi

if [[ ! -f "${POLICY_FILE}" ]]; then
  echo "ERROR: Policy file not found: ${POLICY_FILE}" >&2
  exit 2
fi

mapfile -t resource_types < <(jq -r '.protected_resource_types[]' "${POLICY_FILE}")
type_filter=$(printf '%s\n' "${resource_types[@]}" | jq -R . | jq -sc .)

echo "Monitored resource types: ${resource_types[*]}"
echo "Terraform directory     : ${TF_DIR}"

cd "${TF_DIR}"

terraform init -input=false -no-color >&2
terraform plan -out=tfplan -input=false -no-color >&2
plan_json=$(terraform show -json tfplan)

deleted=$(echo "${plan_json}" | jq -r \
  --argjson types "${type_filter}" \
  '.resource_changes[]?
   | select(.change.actions | index("delete") != null)
   | select([.type] | inside($types))
   | .address')

if [[ -n "${deleted}" ]]; then
  echo "Protected resource deletion detected:"
  echo "${deleted}"
  exit 0
fi

echo "Result: no protected resource deletion — JIT escalation not required."
exit 1
