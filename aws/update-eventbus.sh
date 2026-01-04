#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFVARS_FILE="${SCRIPT_DIR}/terraform.tfvars"
MAIN_TF_FILE="${SCRIPT_DIR}/main.tf"

# terraform.tfvars から値を取得
get_tfvar() {
  local key="$1"
  grep "^${key}" "${TFVARS_FILE}" | sed 's/.*=\s*"\([^"]*\)".*/\1/'
}

AWS_REGION=$(get_tfvar "aws_region")
AWS_PROFILE=$(get_tfvar "aws_profile")

echo "Using AWS Profile: ${AWS_PROFILE}"
echo "Using AWS Region: ${AWS_REGION}"

# イベントソース一覧を取得
# aws.partner/auth0.com/ で始まる、Status=Pending、CreationTimeが最新のものを取得
echo "Fetching event sources..."
EVENT_SOURCE_NAME=$(aws events list-event-sources \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --name-prefix "aws.partner/auth0.com/" \
  --query "EventSources[?State=='PENDING'] | sort_by(@, &CreationTime) | [-1].Name" \
  --output text)
echo $EVENT_SOURCE_NAME

if [ -z "${EVENT_SOURCE_NAME}" ] || [ "${EVENT_SOURCE_NAME}" = "None" ]; then
  echo "Error: No pending event source found with prefix 'aws.partner/auth0.com/'"
  exit 1
fi

echo "Found Auth0 Event Source: ${EVENT_SOURCE_NAME}"

# イベントバスを作成（イベントソースを紐づけ）
echo "Creating event bus from event source..."
aws events create-event-bus \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --name "${EVENT_SOURCE_NAME}" \
  --event-source-name "${EVENT_SOURCE_NAME}" \
  && echo "Event bus created successfully" \
  || echo "Event bus may already exist (continuing...)"

# main.tf の data "aws_cloudwatch_event_bus" の name を sed で更新
echo "Updating main.tf..."
sed -i.bak -E \
  '/data "aws_cloudwatch_event_bus"/,/^\}/ s|(name\s*=\s*)"[^"]*"|\1"'"${EVENT_SOURCE_NAME}"'"|' \
  "${MAIN_TF_FILE}"
rm -f "${MAIN_TF_FILE}.bak"

echo ""
echo "Done!"
echo "  Event Bus Name: ${EVENT_SOURCE_NAME}"
echo "  Updated: ${MAIN_TF_FILE}"
