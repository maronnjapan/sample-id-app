"""ルールの正規化（canonicalization）。

Okta API / Terraform state から得たポリシーを、比較可能な「正規形」に落とす。
揮発フィールド（id, created, lastUpdated, _links, priority の絶対値）を捨て、
条件・action・認証要件のみを安定したキー順で表現する。

ここが等価性担保の核心ロジック。L1（構造差分）も L2（要件比較）も
この正規形の上で比較する。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

# 比較から除外する揮発フィールド
_VOLATILE = {"id", "created", "lastUpdated", "_links", "priority", "status", "name"}


def _norm_conditions(raw: dict[str, Any] | None) -> dict[str, Any]:
    """条件を正規化。空・未指定はすべて省いて「無条件＝空 dict」に畳む。

    INV-1（カスタム Catch-all は無条件）の判定がこの空 dict 化に依存する。
    """
    if not raw:
        return {}
    out: dict[str, Any] = {}

    # network / zone
    net = raw.get("network") or {}
    if net.get("connection") and net["connection"] != "ANYWHERE":
        out["network.connection"] = net["connection"]
    if net.get("include"):
        out["network.include"] = sorted(net["include"])
    if net.get("exclude"):
        out["network.exclude"] = sorted(net["exclude"])

    # people (users / groups)
    people = raw.get("people") or {}
    for kind in ("users", "groups"):
        sel = people.get(kind) or {}
        if sel.get("include"):
            out[f"people.{kind}.include"] = sorted(sel["include"])
        if sel.get("exclude"):
            out[f"people.{kind}.exclude"] = sorted(sel["exclude"])

    # device
    dev = raw.get("device") or {}
    for k in ("managed", "registered"):
        if dev.get(k) is not None:
            out[f"device.{k}"] = dev[k]
    if dev.get("assurance"):
        out["device.assurance"] = _stable(dev["assurance"])

    # platform / userType / risk / elCondition(custom expression)
    if raw.get("platform"):
        out["platform"] = _stable(raw["platform"])
    if raw.get("userType"):
        out["userType"] = _stable(raw["userType"])
    if raw.get("risk") or raw.get("riskScore"):
        out["risk"] = _stable(raw.get("risk") or raw.get("riskScore"))
    el = raw.get("elCondition") or raw.get("customExpression")
    if el:
        # 式は空白差で誤検知しないよう軽く正規化
        cond = el.get("condition") if isinstance(el, dict) else el
        out["elCondition"] = " ".join(str(cond).split())

    return out


# ALLOW 要件として「意味を持つ」既知フィールド（明示的に拾うもの）
_KNOWN_REQ = ("factorMode", "reauthenticateIn", "inactivityPeriod", "type", "constraints")


def _norm_requirements(raw: dict[str, Any] | None, access: str) -> dict[str, Any]:
    """認証要件（verification requirements）を正規化。

    DENY の場合は要件比較対象が無い（access のみ）。
    ALLOW の場合は factorMode / constraints / 再認証間隔などを含める。

    重要: ALLOW は **必ず何らかの認証要件を伴う設定** であり、
    「ANY ALLOW（素通しの許可）」ではない（特に Catch-all ALLOW）。
    そのため既知フィールドだけを拾って残りを黙って捨てると、
    要件が `{access: ALLOW}` に縮約され＝ ANY ALLOW 化してしまう。
    これを防ぐため、既知フィールドに無いキーも揮発キーを除いて **取りこぼさず** 取り込む。
    """
    out: dict[str, Any] = {"access": access}
    if access != "ALLOW" or not raw:
        return out

    # 1) 既知フィールド（安定したキー名で正規化）
    if raw.get("factorMode"):
        out["factorMode"] = raw["factorMode"]
    if raw.get("reauthenticateIn"):
        out["reauthenticateIn"] = raw["reauthenticateIn"]
    if raw.get("inactivityPeriod"):
        out["inactivityPeriod"] = raw["inactivityPeriod"]
    if raw.get("type"):
        out["type"] = raw["type"]
    # constraints は順不同な配列なので安定ソート
    if raw.get("constraints"):
        out["constraints"] = _stable(raw["constraints"])

    # 2) 既知でないキーも取りこぼさない（要件の ANY ALLOW 化を防ぐ）。
    #    揮発キー・空値・既出キーのみ除外し、残りは安定化して取り込む。
    for k, v in raw.items():
        if k in _VOLATILE or k in _KNOWN_REQ or k == "access":
            continue
        if v in (None, "", [], {}):
            continue
        out[f"req.{k}"] = _stable(v)

    return out


@dataclass(frozen=True)
class CanonRule:
    """正規化済みルール。順序比較のため index を保持（priority 絶対値は捨てる）。"""

    index: int
    conditions: dict[str, Any]
    access: str
    requirements: dict[str, Any]
    is_system_catchall: bool = False

    @property
    def is_unconditional(self) -> bool:
        """conditions が完全に空 = ANY。INV-1 判定に使う。"""
        return len(self.conditions) == 0

    @property
    def has_concrete_requirement(self) -> bool:
        """ALLOW が具体的な認証要件を伴うか。

        requirements が access だけ（= 認証要件の設定が無い ANY ALLOW）なら False。
        Catch-all ALLOW は必ず認証要件を伴うはずなので、INV-2 判定に使う。
        """
        return self.access == "ALLOW" and any(k != "access" for k in self.requirements)

    def key(self) -> tuple:
        """挙動比較用キー（index は含めない＝位置差は別途見る）。"""
        return (
            _freeze(self.conditions),
            self.access,
            _freeze(self.requirements),
        )


@dataclass(frozen=True)
class CanonPolicy:
    rules: tuple[CanonRule, ...] = field(default_factory=tuple)

    @property
    def explicit_rules(self) -> tuple[CanonRule, ...]:
        """システム既定 Catch-all を除いた、明示ルール列。"""
        return tuple(r for r in self.rules if not r.is_system_catchall)

    @property
    def system_catchall(self) -> Optional[CanonRule]:
        for r in self.rules:
            if r.is_system_catchall:
                return r
        return None


def canonicalize_policy(rules_raw: list[dict[str, Any]]) -> CanonPolicy:
    """Okta API の rules 配列（または Terraform state 相当）を正規形へ。

    入力は priority 昇順でなくてもよい（ここでソートする）。
    システム既定 Catch-all は `system == True` で識別する。
    """
    ordered = sorted(rules_raw, key=lambda r: r.get("priority", 1 << 30))
    canon: list[CanonRule] = []
    for i, r in enumerate(ordered):
        actions = (r.get("actions") or {}).get("appSignOn") or r.get("actions") or {}
        access = actions.get("access") or r.get("access") or "DENY"
        canon.append(
            CanonRule(
                index=i,
                conditions=_norm_conditions(r.get("conditions")),
                access=access,
                requirements=_norm_requirements(
                    actions.get("verificationMethod") or actions, access
                ),
                is_system_catchall=bool(r.get("system")),
            )
        )
    return CanonPolicy(rules=tuple(canon))


# ---- helpers -------------------------------------------------------------
def _stable(v: Any) -> Any:
    """list/dict を順序安定化（比較で順序差を誤検知しないため）。"""
    if isinstance(v, dict):
        return {k: _stable(v[k]) for k in sorted(v) if k not in _VOLATILE}
    if isinstance(v, list):
        return sorted((_stable(x) for x in v), key=lambda e: str(e))
    return v


def _freeze(v: Any) -> Any:
    """dict/list を hashable なタプルへ（key() 用）。"""
    if isinstance(v, dict):
        return tuple((k, _freeze(v[k])) for k in sorted(v))
    if isinstance(v, list):
        return tuple(_freeze(x) for x in v)
    return v
