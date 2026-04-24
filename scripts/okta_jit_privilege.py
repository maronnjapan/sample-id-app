#!/usr/bin/env python3
"""
Okta Direct Authentication (OOB) JIT privilege escalation script.

Flow:
  1. POST /oauth2/v1/primary-authenticate  → get oob_code (+ optional binding_code)
  2. Poll POST /oauth2/v1/token            → wait for push approval → access_token
  3. POST /oauth2/v1/clients/{id}/roles   → grant SUPER_ADMIN to Terraform app
  4. Optional: keep the role for a lease window and revoke from CI
  5. Optional: terraform apply/plan
  6. Optional: DELETE /oauth2/v1/clients/{id}/roles/{roleId}  (finally)

Corrections applied from Codex review:
  - scope included in /token poll request
  - interval from response used for polling cadence
  - binding_code is optional (present only when binding_method=transfer)
  - error categorization: pending→retry, slow_down→backoff, terminal→fail
  - finally block guarantees role revocation
  - leftover role check at startup
"""

import os
import sys
import json
import time
import subprocess
from urllib.parse import urlparse

import requests


def _enable_live_logs() -> None:
    # GitHub Actions captures stdout/stderr via pipes, so default buffering can
    # delay challenge details until after the approval window. Force immediate
    # writes so the Number Challenge is visible while the push is pending.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(line_buffering=True, write_through=True)


_enable_live_logs()


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value

    raise RuntimeError(
        f"Required environment variable '{name}' is empty. "
        "In GitHub Actions this usually means the repository secret is unset "
        "or unavailable to this event type."
    )


def _normalize_okta_domain(value: str) -> str:
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.netloc or parsed.path).strip().strip("/")

    if not host:
        raise RuntimeError(
            "OKTA_DOMAIN is empty or malformed. Expected 'myorg.okta.com' "
            "or 'https://myorg.okta.com'."
        )

    if parsed.netloc and parsed.path not in ("", "/"):
        raise RuntimeError(
            f"OKTA_DOMAIN must not include a path: {value!r}. "
            "Use only the Okta org hostname."
        )

    if "/" in host:
        raise RuntimeError(
            f"OKTA_DOMAIN must be a hostname, but got {value!r}."
        )

    return host


OKTA_DOMAIN = _normalize_okta_domain(_require_env("OKTA_DOMAIN"))  # e.g. myorg.okta.com
BRIDGE_CLIENT_ID = _require_env("BRIDGE_CLIENT_ID")
TERRAFORM_CLIENT_ID = _require_env("TERRAFORM_CLIENT_ID")
ADMIN_EMAIL = _require_env("ADMIN_EMAIL")          # Okta login of the approving admin
JIT_MODE = os.environ.get("JIT_MODE", "grant-and-run-terraform")
ROLE_LEASE_SECONDS = int(os.environ.get("ROLE_LEASE_SECONDS", "0"))
REQUIRE_NUMBER_CHALLENGE = os.environ.get("REQUIRE_NUMBER_CHALLENGE", "false").lower() in {
    "1", "true", "yes", "on"
}

BASE_URL = f"https://{OKTA_DOMAIN}"
# Must use org authorization server — custom auth servers cannot issue okta.* scopes
TOKEN_SCOPES = "openid profile okta.roles.manage"

# Errors that mean "still waiting" — safe to retry
_PENDING_ERRORS = {"authorization_pending", "slow_down"}

# CI job timeout guard (GitHub Actions default job timeout applies externally)
MAX_POLL_SECONDS = 600


def _post_form(path: str, data: dict, token: str | None = None) -> requests.Response:
    headers = {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        return requests.post(f"{BASE_URL}{path}", headers=headers, data=data, timeout=30)
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError(
            f"Failed to connect to Okta at {BASE_URL}. "
            "Check OKTA_DOMAIN and the runner's DNS/network access."
        ) from exc


def _api(method: str, path: str, token: str, **kwargs) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        return requests.request(method, f"{BASE_URL}{path}", headers=headers, timeout=30, **kwargs)
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError(
            f"Failed to connect to Okta at {BASE_URL}. "
            "Check OKTA_DOMAIN and the runner's DNS/network access."
        ) from exc


# ---------------------------------------------------------------------------
# Step 1
# ---------------------------------------------------------------------------
def start_oob_auth() -> dict:
    resp = _post_form(
        "/oauth2/v1/primary-authenticate",
        {
            "client_id": BRIDGE_CLIENT_ID,
            "login_hint": ADMIN_EMAIL,
            "channel_hint": "push",
            "challenge_hint": "urn:okta:params:oauth:grant-type:oob",
        },
    )
    if not resp.ok:
        raise RuntimeError(f"primary-authenticate failed {resp.status_code}: {resp.text}")
    return resp.json()


# ---------------------------------------------------------------------------
# Step 2
# ---------------------------------------------------------------------------
def poll_for_token(oob_code: str, interval: int, expires_in: int) -> str:
    deadline = time.monotonic() + min(expires_in, MAX_POLL_SECONDS)
    current_interval = max(interval, 5)

    while time.monotonic() < deadline:
        resp = _post_form(
            "/oauth2/v1/token",
            {
                "grant_type": "urn:okta:params:oauth:grant-type:oob",
                "oob_code": oob_code,
                "client_id": BRIDGE_CLIENT_ID,
                "scope": TOKEN_SCOPES,
            },
        )

        if resp.status_code == 200:
            return resp.json()["access_token"]

        # Rate-limited: back off then retry
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", current_interval * 2))
            print(f"[poll] 429 rate-limited, waiting {retry_after}s")
            time.sleep(retry_after)
            continue

        # Server error: transient, retry once
        if resp.status_code >= 500:
            print(f"[poll] {resp.status_code} server error, retrying in {current_interval}s")
            time.sleep(current_interval)
            continue

        error_data = resp.json()
        error = error_data.get("error", "")

        if error == "slow_down":
            current_interval = min(current_interval + 5, 30)
            print(f"[poll] slow_down — increasing interval to {current_interval}s")
            time.sleep(current_interval)
            continue

        if error == "authorization_pending":
            time.sleep(current_interval)
            continue

        # Any other error is terminal
        raise RuntimeError(f"Token polling failed: {json.dumps(error_data)}")

    raise TimeoutError(f"OOB approval not received within {MAX_POLL_SECONDS}s")


# ---------------------------------------------------------------------------
# Role management helpers
# ---------------------------------------------------------------------------
def list_roles(token: str) -> list[dict]:
    resp = _api("GET", f"/oauth2/v1/clients/{TERRAFORM_CLIENT_ID}/roles", token)
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json()


def assign_super_admin(token: str) -> str:
    resp = _api("POST", f"/oauth2/v1/clients/{TERRAFORM_CLIENT_ID}/roles", token, json={"type": "SUPER_ADMIN"})
    resp.raise_for_status()
    return resp.json()["id"]


def revoke_role(token: str, role_id: str) -> None:
    resp = _api("DELETE", f"/oauth2/v1/clients/{TERRAFORM_CLIENT_ID}/roles/{role_id}", token)
    if resp.status_code not in (200, 204, 404):
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Step 4
# ---------------------------------------------------------------------------
def run_terraform() -> None:
    # TERRAFORM_COMMAND=plan  → インフラ変更なし（PR作成・更新時の動作確認用）
    # TERRAFORM_COMMAND=apply → 実際に適用（マージ時）
    command = os.environ.get("TERRAFORM_COMMAND", "plan")
    if command == "apply":
        cmd = ["terraform", "apply", "-auto-approve"]
    else:
        cmd = ["terraform", "plan"]
    subprocess.run(cmd, check=True)


def wait_for_lease(seconds: int) -> None:
    if seconds <= 0:
        return

    print(f"[JIT] Holding SUPER_ADMIN for {seconds}s before CI revokes it.")
    remaining = seconds
    while remaining > 0:
        sleep_for = min(30, remaining)
        print(f"[JIT] Lease remaining: {remaining}s")
        time.sleep(sleep_for)
        remaining -= sleep_for


def _github_notice(title: str, message: str) -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return

    escaped_title = title.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    escaped_message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::notice title={escaped_title}::{escaped_message}")


def log_push_challenge(auth_data: dict) -> None:
    print("[ACTION REQUIRED] Approve the Okta Verify push notification on your phone.")

    binding_method = auth_data.get("binding_method", "unknown")
    binding_code = auth_data.get("binding_code")

    if binding_method == "transfer":
        if not binding_code:
            raise RuntimeError(
                "Okta returned binding_method=transfer but no binding_code. "
                "The user can't complete the number challenge without the code."
            )

        print("[JIT] Okta Verify push requires number challenge (binding_method=transfer).")
        print(f"[BINDING CODE] {binding_code}")
        _github_notice("Okta Verify Number Challenge", binding_code)
        print("[JIT] Approve the push and tap the matching number in Okta Verify.")
        return

    if binding_method == "none":
        print("[JIT] Okta Verify push does not require number challenge (binding_method=none).")
        if REQUIRE_NUMBER_CHALLENGE:
            raise RuntimeError(
                "REQUIRE_NUMBER_CHALLENGE=true, but Okta returned binding_method=none. "
                "Enable Okta Verify number challenge in the org settings or disable REQUIRE_NUMBER_CHALLENGE."
            )
        return

    if binding_code:
        print(f"[JIT] Okta returned binding_method={binding_method!r} with binding_code={binding_code}.")
    else:
        print(f"[JIT] Okta returned binding_method={binding_method!r}. No binding code was provided.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print(f"[JIT] Starting OOB push flow for '{ADMIN_EMAIL}' → app '{TERRAFORM_CLIENT_ID}' (mode={JIT_MODE})")

    # Step 1 — initiate push
    auth_data = start_oob_auth()
    oob_code: str = auth_data["oob_code"]
    interval: int = auth_data.get("interval", 5)
    expires_in: int = auth_data.get("expires_in", 300)
    log_push_challenge(auth_data)

    access_token: str | None = None
    role_id: str | None = None

    try:
        # Step 2 — poll for approval
        print(f"[JIT] Polling for approval (interval={interval}s, expires_in={expires_in}s)...")
        access_token = poll_for_token(oob_code, interval, expires_in)
        print("[JIT] Push approved. Access token obtained.")

        # Guard: in lease mode, do not auto-revoke an existing active assignment.
        leftover = list_roles(access_token)
        if leftover:
            if JIT_MODE == "grant-with-lease":
                raise RuntimeError(
                    "Existing admin role assignment detected. Refusing to revoke it automatically in lease mode."
                )

            print(f"[JIT] WARNING: {len(leftover)} leftover role(s) from a previous run. Revoking before proceeding.")
            for r in leftover:
                revoke_role(access_token, r["id"])
                print(f"[JIT]   revoked stale role {r['id']} ({r.get('type', '?')})")

        # Step 3 — grant SUPER_ADMIN
        role_id = assign_super_admin(access_token)
        print(f"[JIT] SUPER_ADMIN granted (roleId={role_id})")

        if JIT_MODE == "grant-only":
            print("[JIT] grant-only mode: leaving SUPER_ADMIN assigned for a separate local operation.")
            return

        if JIT_MODE == "grant-with-lease":
            wait_for_lease(ROLE_LEASE_SECONDS)
            print("[JIT] Lease window ended. Revoking SUPER_ADMIN from CI.")
            return

        # Step 4 — run Terraform (plan or apply depending on TERRAFORM_COMMAND)
        cmd = os.environ.get("TERRAFORM_COMMAND", "plan")
        print(f"[JIT] Running terraform {cmd}...")
        run_terraform()
        print(f"[JIT] terraform {cmd} succeeded.")

    finally:
        # Always revoke — even if Terraform or push approval failed
        if JIT_MODE != "grant-only" and access_token and role_id:
            try:
                revoke_role(access_token, role_id)
                print(f"[JIT] SUPER_ADMIN revoked (roleId={role_id})")
            except Exception as exc:
                print(f"[JIT] CRITICAL: failed to revoke role {role_id}: {exc}", file=sys.stderr)
                # Exit non-zero so CI marks the job failed and on-call is alerted
                sys.exit(2)


if __name__ == "__main__":
    main()
