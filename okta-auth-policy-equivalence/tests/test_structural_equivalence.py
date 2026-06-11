"""L1: 構造等価テスト。

T(old) == new と INV-1 を検証する。設定空間に対して網羅的な主担保。
"""
from __future__ import annotations

from lib.structural_diff import assert_inv1, diff_policies, format_report


def test_structural_equivalence(old_policy, new_policy):
    diffs = diff_policies(old_policy, new_policy)
    assert not diffs, "\n" + format_report(old_policy, new_policy)


def test_inv1_custom_catchall_is_unconditional(new_policy):
    violations = assert_inv1(new_policy)
    assert not violations, "\n".join(violations)


def test_explicit_rules_preserved_in_order(old_policy, new_policy):
    """非 Catch-all ルールが順序・条件・action・要件まで一致しているか。"""
    old_explicit = old_policy.explicit_rules
    new_explicit = new_policy.explicit_rules
    # 新は Allow Catch-all の場合のみ末尾に1本多い
    assert len(new_explicit) in (len(old_explicit), len(old_explicit) + 1)
    for i, r_old in enumerate(old_explicit):
        assert new_explicit[i].key() == r_old.key(), f"rule[{i}] が不一致"
