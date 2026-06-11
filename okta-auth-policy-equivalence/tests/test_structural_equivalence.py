"""L1: 構造等価テスト。

T(old) == new と INV-1 を検証する。設定空間に対して網羅的な主担保。
"""
from __future__ import annotations

from dataclasses import replace

from lib.canonicalize import CanonPolicy, CanonRule
from lib.structural_diff import assert_inv1, diff_policies, format_report


def test_structural_equivalence(old_policy, new_policy):
    diffs = diff_policies(old_policy, new_policy)
    assert not diffs, "\n" + format_report(old_policy, new_policy)


def test_inv1_custom_catchall_is_unconditional(new_policy):
    violations = assert_inv1(new_policy)
    assert not violations, "\n".join(violations)


def test_inv2_rejects_bare_any_allow_catchall(new_policy):
    """カスタム Catch-all の ALLOW から認証要件を剥がす（= ANY ALLOW 化）と
    INV-2 違反として検出されること。要件の取りこぼし/誤変換のガード。"""
    rules = list(new_policy.rules)
    # 末尾の system Deny を除いた最後の明示ルール（= カスタム Catch-all）を bare ALLOW に
    idx = max(i for i, r in enumerate(rules) if not r.is_system_catchall)
    rules[idx] = replace(rules[idx], requirements={"access": "ALLOW"})
    bared = CanonPolicy(rules=tuple(rules))

    violations = assert_inv1(bared)
    assert any("INV-2" in v for v in violations), (
        "ANY ALLOW（認証要件なし）の Catch-all が検出されていない: " + str(violations)
    )


def test_explicit_rules_preserved_in_order(old_policy, new_policy):
    """非 Catch-all ルールが順序・条件・action・要件まで一致しているか。"""
    old_explicit = old_policy.explicit_rules
    new_explicit = new_policy.explicit_rules
    # 新は Allow Catch-all の場合のみ末尾に1本多い
    assert len(new_explicit) in (len(old_explicit), len(old_explicit) + 1)
    for i, r_old in enumerate(old_explicit):
        assert new_explicit[i].key() == r_old.key(), f"rule[{i}] が不一致"
