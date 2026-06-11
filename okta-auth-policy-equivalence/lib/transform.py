"""期待変換 T : 旧ポリシー(正規形) → Terraform版の「あるべき正規形」。

docs/02 の T を実装。Catch-all 差分のみを表現する。
structural_diff はこの T(old) を期待値として new と突き合わせる。
"""
from __future__ import annotations

from dataclasses import replace

from .canonicalize import CanonPolicy, CanonRule


def expected_new(old: CanonPolicy) -> CanonPolicy:
    """T(old) を返す。

    - 明示ルール（非 system catch-all）はそのまま。
    - 旧 Catch-all が DENY: 追加なし。system catch-all は DENY のまま。
    - 旧 Catch-all が ALLOW: 末尾に「無条件 ALLOW（旧要件と同一）」のカスタムルールを足し、
      その後ろに system DENY catch-all を置く。
    """
    old_catchall = old.system_catchall
    explicit = list(old.explicit_rules)

    if old_catchall is None:
        raise ValueError("旧ポリシーに system Catch-all が見つからない")

    rebuilt: list[CanonRule] = []
    # 明示ルールはインデックスを振り直して保持
    for i, r in enumerate(explicit):
        rebuilt.append(replace(r, index=i, is_system_catchall=False))

    n = len(rebuilt)
    if old_catchall.access == "ALLOW":
        # 無条件 ALLOW カスタム Catch-all（旧 Catch-all の要件をコピー）
        rebuilt.append(
            CanonRule(
                index=n,
                conditions={},  # ★ INV-1: 完全無条件
                access="ALLOW",
                requirements=old_catchall.requirements,
                is_system_catchall=False,
            )
        )
        n += 1

    # system 既定 Catch-all は常に DENY
    rebuilt.append(
        CanonRule(
            index=n,
            conditions={},
            access="DENY",
            requirements={"access": "DENY"},
            is_system_catchall=True,
        )
    )
    return CanonPolicy(rules=tuple(rebuilt))
