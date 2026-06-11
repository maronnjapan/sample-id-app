"""L1: 構造等価の検証。

expected = T(old) と actual_new を正規形どうしで突き合わせ、差分を列挙する。
あわせて INV-1（カスタム Catch-all 無条件）を明示的に assert する。
"""
from __future__ import annotations

from dataclasses import dataclass

from .canonicalize import CanonPolicy, CanonRule
from .transform import expected_new


@dataclass
class Diff:
    location: str   # 例: "rule[2].conditions"
    expected: object
    actual: object

    def __str__(self) -> str:
        return f"  - {self.location}\n      expected: {self.expected}\n      actual:   {self.actual}"


def _rule_diffs(idx: int, exp: CanonRule, act: CanonRule) -> list[Diff]:
    out: list[Diff] = []
    if exp.conditions != act.conditions:
        out.append(Diff(f"rule[{idx}].conditions", exp.conditions, act.conditions))
    if exp.access != act.access:
        out.append(Diff(f"rule[{idx}].access", exp.access, act.access))
    if exp.requirements != act.requirements:
        out.append(Diff(f"rule[{idx}].requirements", exp.requirements, act.requirements))
    if exp.is_system_catchall != act.is_system_catchall:
        out.append(
            Diff(f"rule[{idx}].is_system_catchall", exp.is_system_catchall, act.is_system_catchall)
        )
    return out


def diff_policies(old: CanonPolicy, new: CanonPolicy) -> list[Diff]:
    """T(old) と new の全フィールド差分を返す（空なら構造等価）。"""
    exp = expected_new(old)
    diffs: list[Diff] = []

    if len(exp.rules) != len(new.rules):
        diffs.append(Diff("rule_count", len(exp.rules), len(new.rules)))

    for i in range(min(len(exp.rules), len(new.rules))):
        diffs.extend(_rule_diffs(i, exp.rules[i], new.rules[i]))

    return diffs


def assert_inv1(new: CanonPolicy) -> list[str]:
    """Catch-all 変換の不変条件を検証。違反メッセージのリストを返す（空なら OK）。

    旧 Catch-all が ALLOW のときのみカスタム Catch-all が存在する。
    その実体は「明示ルール列の末尾の ALLOW ルール」。これに対し:

    - INV-1: conditions が完全に無条件（ANY）であること。
             narrowing があると fall-through が system Deny に漏れる。
    - INV-2: 認証要件を伴うこと（ANY ALLOW = 素通しの許可ではない）。
             Catch-all ALLOW は必ず設定済みの認証要件を持つため、
             access だけに縮約されていたら要件取りこぼし/誤変換を疑う。

    あわせて system 既定 Catch-all が DENY（フェイルセーフ）であることを要求する。
    """
    violations: list[str] = []
    explicit = new.explicit_rules
    if not explicit:
        return violations
    last = explicit[-1]
    if last.access == "ALLOW":
        # INV-1: 条件は完全に無条件（ANY）。narrowing が1つでもあると
        # fall-through が system Deny に漏れ、旧 Allow と食い違う。
        if not last.is_unconditional:
            violations.append(
                "INV-1 違反: カスタム Catch-all が無条件でない "
                f"(conditions={last.conditions})。fall-through が system Deny に漏れる。"
            )
        # INV-2: Catch-all ALLOW は「ANY ALLOW（素通し）」ではなく、必ず
        # 具体的な認証要件を伴う設定であるはず。access だけに縮約されているなら、
        # 要件の取りこぼし or 誤変換の疑い（旧 Catch-all の設定が失われている）。
        if not last.has_concrete_requirement:
            violations.append(
                "INV-2 違反: カスタム Catch-all が認証要件を持たない "
                f"(requirements={last.requirements})。Catch-all ALLOW は必ず認証要件を"
                "伴うはずで、ANY ALLOW への縮約＝要件取りこぼし/誤変換の疑い。"
            )
    # system 既定 Catch-all は必ず存在し DENY であること（フェイルセーフ）
    sc = new.system_catchall
    if sc is None:
        violations.append("system 既定 Catch-all が存在しない")
    elif sc.access != "DENY":
        violations.append(f"system 既定 Catch-all が DENY でない (access={sc.access})")
    return violations


def format_report(old: CanonPolicy, new: CanonPolicy) -> str:
    diffs = diff_policies(old, new)
    inv = assert_inv1(new)
    lines: list[str] = []
    if not diffs:
        lines.append("[L1] 構造等価: OK（T(old) == new）")
    else:
        lines.append(f"[L1] 構造差分 {len(diffs)} 件:")
        lines.extend(str(d) for d in diffs)
    if inv:
        lines.append(f"[INV-1/2] 違反 {len(inv)} 件:")
        lines.extend(f"  - {v}" for v in inv)
    else:
        lines.append(
            "[INV-1/2] OK（カスタム Catch-all は無条件かつ認証要件あり / "
            "system Deny フェイルセーフ健在）"
        )
    return "\n".join(lines)
