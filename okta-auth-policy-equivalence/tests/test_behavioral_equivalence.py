"""L2: 挙動等価テスト（Policy Simulation API）。

シナリオ行列を両ポリシーに流し、(decision, requirements) の一致を検証する。
「マッチしたルール名」は比較しない（Catch-all 差分で正当に変わるため）。

実テナント接続が必要なため、OKTA 環境変数とアプリ ID が無い場合は skip する。
ローカル/CI で OKTA_ORG_URL, OKTA_API_TOKEN, OLD_APP_ID, NEW_APP_ID,
OLD_POLICY_ID, NEW_POLICY_ID を与えると実行される。
"""
from __future__ import annotations

import os

import pytest

from lib.okta_client import OktaClient
from lib.scenario_matrix import build_matrix, coverage_gaps

_REQUIRED = ("OKTA_ORG_URL", "OKTA_API_TOKEN", "OLD_APP_ID", "NEW_APP_ID",
             "OLD_POLICY_ID", "NEW_POLICY_ID")

pytestmark = pytest.mark.skipif(
    not all(os.environ.get(k) for k in _REQUIRED),
    reason="Simulation 実行には OKTA 接続情報（_REQUIRED）が必要",
)


def _cmp(a: dict, b: dict) -> bool:
    """decision と requirements のみ比較（matched_rule は無視）。"""
    return a.get("decision") == b.get("decision") and a.get("requirements") == b.get("requirements")


def test_behavioral_equivalence(old_policy):
    client = OktaClient()
    matrix = build_matrix(old_policy)

    mismatches: list[str] = []
    matched_idx: set[int] = set()

    for sc in matrix:
        res_old = client.simulate(os.environ["OLD_POLICY_ID"], os.environ["OLD_APP_ID"], sc)
        res_new = client.simulate(os.environ["NEW_POLICY_ID"], os.environ["NEW_APP_ID"], sc)
        if res_old.get("matched_rule_index") is not None:
            matched_idx.add(res_old["matched_rule_index"])
        if not _cmp(res_old, res_new):
            mismatches.append(
                f"  {sc.get('_intent')}: old={res_old} new={res_new}"
            )

    # fall-through 経路（Catch-all）は必ず一致していること＝INV-1 の実挙動確認
    assert not mismatches, "挙動不一致:\n" + "\n".join(mismatches)

    # カバレッジ: 全明示ルールを最低1シナリオで踏めているか（抜けは警告）
    gaps = coverage_gaps(old_policy, matched_idx)
    assert not gaps, f"witness で踏めなかったルール index: {gaps}（シナリオ強化が必要）"
