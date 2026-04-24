#!/usr/bin/env python3
"""
Okta Direct Authentication (OOB) JIT privilege escalation script.

Subcommands:
  grant  — Steps 1-3: trigger OOB push, wait for approval, grant SUPER_ADMIN.
           Outputs role_id and access_token for the revoke step.
  revoke — Step 4: revoke SUPER_ADMIN using role_id and access_token from grant.

Environment variables (both subcommands):
  OKTA_DOMAIN          Okta org hostname (e.g. myorg.okta.com)
  BRIDGE_CLIENT_ID     Client ID of the CI bridge app
  TERRAFORM_CLIENT_ID  Client ID of the Terraform app to grant/revoke role on

grant only:
  ADMIN_EMAIL          Okta login of the admin who will approve the push

revoke only:
  ROLE_ID              Role ID emitted by grant
  ACCESS_TOKEN         Admin access token emitted by grant
"""

import json
import os
import sys
import time
from urllib.parse import urlparse

import requests


def _enable_live_logs() -> None:
    # GitHub Actions captures stdout via pipes; force immediate writes so
    # the Number Challenge appears while the push is still pending.
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


def _set_ci_output(name: str, value: str, sensitive: bool = False) -> None:
    """Emit a key-value output for downstream CI steps or jobs.

    In GitHub Actions: writes to $GITHUB_OUTPUT and masks sensitive values.
    Elsewhere: prints KEY=VALUE to stdout (Screwdriver, local, etc.).
    """
    if sensitive and os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::add-mask::{value}", flush=True)

    github_output = os.environ.get("GITHUB_OUTPUT", "")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"{name}={value}\n")
    else:
        print(f"[OUTPUT] {name}={'***' if sensitive else value}")


OKTA_DOMAIN = _normalize_okta_domain(_require_env("OKTA_DOMAIN"))
BRIDGE_CLIENT_ID = _require_env("BRIDGE_CLIENT_ID")
TERRAFORM_CLIENT_ID = _require_env("TERRAFORM_CLIENT_ID")

BASE_URL = f"https://{OKTA_DOMAIN}"
TOKEN_SCOPES = "openid profile okta.roles.manage"
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


def start_oob_auth(admin_email: str) -> dict:
    resp = _post_form(
        "/oauth2/v1/primary-authenticate",
        {
            "client_id": BRIDGE_CLIENT_ID,
            "login_hint": admin_email,
            "channel_hint": "push",
            "challenge_hint": "urn:okta:params:oauth:grant-type:oob",
        },
    )
    if not resp.ok:
        raise RuntimeError(f"primary-authenticate failed {resp.status_code}: {resp.text}")
    return resp.json()


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

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", current_interval * 2))
            print(f"[poll] 429 rate-limited, waiting {retry_after}s")
            time.sleep(retry_after)
            continue

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

        raise RuntimeError(f"Token polling failed: {json.dumps(error_data)}")

    raise TimeoutError(f"OOB approval not received within {MAX_POLL_SECONDS}s")


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


def list_super_admin_roles(token: str) -> list[dict]:
    return [role for role in list_roles(token) if role.get("type") == "SUPER_ADMIN"]


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

    require_number_challenge = os.environ.get("REQUIRE_NUMBER_CHALLENGE", "false").lower() in {
        "1", "true", "yes", "on",
    }

    if binding_method == "none":
        print("[JIT] Okta Verify push does not require number challenge (binding_method=none).")
        if require_number_challenge:
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
# Subcommand: grant
# ---------------------------------------------------------------------------
def cmd_grant() -> None:
    """Steps 1-3: Trigger OOB push, wait for admin approval, grant SUPER_ADMIN.

    Writes role_id and access_token as CI outputs for the revoke subcommand.
    """
    admin_email = _require_env("ADMIN_EMAIL")
    print(f"[JIT] Starting OOB push flow for '{admin_email}' → app '{TERRAFORM_CLIENT_ID}'")

    auth_data = start_oob_auth(admin_email)
    oob_code: str = auth_data["oob_code"]
    interval: int = auth_data.get("interval", 5)
    expires_in: int = auth_data.get("expires_in", 300)
    log_push_challenge(auth_data)

    print(f"[JIT] Polling for approval (interval={interval}s, expires_in={expires_in}s)...")
    access_token = poll_for_token(oob_code, interval, expires_in)
    print("[JIT] Push approved. Access token obtained.")

    leftover = list_super_admin_roles(access_token)
    if leftover:
        raise RuntimeError(
            f"Existing SUPER_ADMIN assignment(s) detected: {[r['id'] for r in leftover]}. "
            "Refusing to proceed — revoke the stale role(s) manually before re-running."
        )

    role_id = assign_super_admin(access_token)
    print(f"[JIT] SUPER_ADMIN granted (roleId={role_id})")

    _set_ci_output("role_id", role_id)
    _set_ci_output("access_token", access_token, sensitive=True)


# ---------------------------------------------------------------------------
# Subcommand: revoke
# ---------------------------------------------------------------------------
def cmd_revoke() -> None:
    """Step 4: Revoke the SUPER_ADMIN role that was granted by cmd_grant."""
    role_id = _require_env("ROLE_ID")
    access_token = _require_env("ACCESS_TOKEN")

    # Mask the token before any logging in this process
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::add-mask::{access_token}", flush=True)

    print(f"[JIT] Revoking SUPER_ADMIN (roleId={role_id})...")
    try:
        revoke_role(access_token, role_id)
        print(f"[JIT] SUPER_ADMIN revoked (roleId={role_id})")
    except Exception as exc:
        print(f"[JIT] CRITICAL: failed to revoke role {role_id}: {exc}", file=sys.stderr)
        sys.exit(2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: okta_jit_privilege.py <grant|revoke>", file=sys.stderr)
        sys.exit(1)

    subcommand = sys.argv[1]
    if subcommand == "grant":
        cmd_grant()
    elif subcommand == "revoke":
        cmd_revoke()
    else:
        print(f"Unknown subcommand: {subcommand!r}. Expected 'grant' or 'revoke'.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
