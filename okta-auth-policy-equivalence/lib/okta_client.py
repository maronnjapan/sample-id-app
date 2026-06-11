"""Okta API ラッパ（取得 + Policy Simulation）。

実テナント接続部は環境に合わせて実装する。ここでは:
  - インタフェースを確定
  - snapshot サブコマンド（正規形 JSON を吐く）を提供
  - Simulation 呼び出しの形を提示
する骨格。`OKTA_ORG_URL` / `OKTA_API_TOKEN` を env で受ける。

参考エンドポイント:
  - ルール取得      : GET  /api/v1/policies/{policyId}/rules
  - ポリシー取得    : GET  /api/v1/policies/{policyId}
  - シミュレーション: POST /api/v1/policies/simulate
"""
from __future__ import annotations

import dataclasses
import json
import os
import sys
from typing import Any

from .canonicalize import CanonPolicy, canonicalize_policy


class OktaClient:
    def __init__(self, org_url: str | None = None, token: str | None = None):
        self.org_url = (org_url or os.environ.get("OKTA_ORG_URL", "")).rstrip("/")
        self.token = token or os.environ.get("OKTA_API_TOKEN", "")

    # --- 取得 -------------------------------------------------------------
    def _get(self, path: str) -> Any:
        """GET ヘルパ。実装時は requests / httpx に差し替える。

        例:
            import httpx
            r = httpx.get(self.org_url + path,
                          headers={"Authorization": f"SSWS {self.token}"})
            r.raise_for_status(); return r.json()
        """
        raise NotImplementedError("自テナント向けに HTTP 実装を入れる")

    def fetch_rules(self, policy_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/v1/policies/{policy_id}/rules")

    def snapshot(self, policy_id: str) -> CanonPolicy:
        """ポリシーを取得し正規形へ。"""
        return canonicalize_policy(self.fetch_rules(policy_id))

    # --- シミュレーション -------------------------------------------------
    def simulate(self, policy_id: str, app_id: str, scenario: dict[str, Any]) -> dict[str, Any]:
        """Policy Simulation API を1シナリオ分呼ぶ。

        返り値（正規化済み）:
            {"decision": "ALLOW"|"DENY",
             "requirements": {...},
             "matched_rule_index": int|None}

        実装イメージ:
            body = _scenario_to_simulate_body(app_id, scenario)
            res = POST /api/v1/policies/simulate  body
            return _parse_simulate_result(res)
        """
        raise NotImplementedError("Simulation API 呼び出しを実装する")


# --- 正規形 <-> JSON （golden 入出力用） ----------------------------------
def policy_to_json(p: CanonPolicy) -> str:
    def enc(o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        if isinstance(o, (set, tuple)):
            return list(o)
        raise TypeError(o)

    return json.dumps(dataclasses.asdict(p), default=enc, ensure_ascii=False, indent=2, sort_keys=True)


def policy_from_json(text: str) -> CanonPolicy:
    from .canonicalize import CanonRule

    data = json.loads(text)
    rules = tuple(
        CanonRule(
            index=r["index"],
            conditions=r["conditions"],
            access=r["access"],
            requirements=r["requirements"],
            is_system_catchall=r["is_system_catchall"],
        )
        for r in data["rules"]
    )
    return CanonPolicy(rules=rules)


# --- CLI: `python -m lib.okta_client snapshot --policy-id X` ----------------
def _main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[0] == "snapshot" and argv[1] == "--policy-id":
        client = OktaClient()
        snap = client.snapshot(argv[2])
        print(policy_to_json(snap))
        return 0
    print("usage: python -m lib.okta_client snapshot --policy-id <POLICY_ID>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
