"""L2: シナリオ行列の生成。

入力空間の全探索は不可能なので、「ルールの判定を変えうる境界値」だけを抽出し、
有限な代表シナリオ集合を作る。サイズは概ね O(#rules × #condition-dims) に収まる
（指数爆発しない）。

生成方針:
  1. ルールごとの witness   : そのルールの条件を満たす1点（各ルールが最初にマッチするか確認）
  2. 境界値                : 各条件次元の「内側/外側」1点ずつ
  3. fall-through          : どの明示ルールにもマッチしない点（Catch-all 経路の検証＝INV-1 の実挙動確認）
  4. pairwise              : 独立次元の2因子組合せ（条件間の相互作用バグ検出）
"""
from __future__ import annotations

import itertools
from typing import Any

from .canonicalize import CanonPolicy


# 1シナリオ = Simulation API に渡す context（抽象表現）。
# okta_client.simulate() がこれを実 API リクエストへ写像する。
Scenario = dict[str, Any]


def _values_in_conditions(policy: CanonPolicy) -> dict[str, set]:
    """各条件次元で「実際に使われている値」を集める＝境界の素。"""
    dims: dict[str, set] = {}
    for r in policy.explicit_rules:
        for k, v in r.conditions.items():
            dims.setdefault(k, set())
            if isinstance(v, (list, tuple)):
                dims[k].update(map(str, v))
            else:
                dims[k].add(str(v))
    return dims


def witness_per_rule(policy: CanonPolicy) -> list[Scenario]:
    """各明示ルールの条件を満たす witness を1つずつ生成。

    「そのルールが本当に最初にマッチするか」は Simulation 結果の matchedRule で確認する
    （coverage チェック）。ここでは条件を満たす最小シナリオを組むだけ。
    """
    out: list[Scenario] = []
    for r in policy.explicit_rules:
        sc: Scenario = {"_intent": f"witness:rule[{r.index}]"}
        for k, v in r.conditions.items():
            sc[k] = (v[0] if isinstance(v, (list, tuple)) and v else v)
        out.append(sc)
    return out


def boundary_scenarios(policy: CanonPolicy) -> list[Scenario]:
    """各次元の内側/外側1点ずつ。"""
    out: list[Scenario] = []
    for dim, vals in _values_in_conditions(policy).items():
        inside = sorted(vals)[0]
        out.append({"_intent": f"boundary:in:{dim}", dim: inside})
        out.append({"_intent": f"boundary:out:{dim}", dim: f"__NOT__{inside}"})
    return out


def fall_through_scenarios() -> list[Scenario]:
    """どの明示条件にも合致しない点（Catch-all 経路）。

    全条件次元を「どのルールの値にも一致しない」状態にする抽象シナリオ。
    INV-1 の実挙動確認（旧 Allow と新 Allow が一致するか）に効く。
    """
    return [{"_intent": "fall-through", "_match_none": True}]


def pairwise(policy: CanonPolicy, limit: int = 50) -> list[Scenario]:
    """独立次元の2因子組合せ（上限つき）。相互作用バグ検出用。"""
    dims = _values_in_conditions(policy)
    keys = list(dims)
    out: list[Scenario] = []
    for a, b in itertools.combinations(keys, 2):
        va, vb = sorted(dims[a])[0], sorted(dims[b])[0]
        out.append({"_intent": f"pairwise:{a}×{b}", a: va, b: vb})
        if len(out) >= limit:
            break
    return out


def build_matrix(policy: CanonPolicy) -> list[Scenario]:
    """全方針を結合した代表シナリオ集合。"""
    seen: set = set()
    matrix: list[Scenario] = []
    for sc in (
        *witness_per_rule(policy),
        *boundary_scenarios(policy),
        *fall_through_scenarios(),
        *pairwise(policy),
    ):
        sig = tuple(sorted((k, str(v)) for k, v in sc.items() if k != "_intent"))
        if sig in seen:
            continue
        seen.add(sig)
        matrix.append(sc)
    return matrix


def coverage_gaps(policy: CanonPolicy, matched_rule_indices: set[int]) -> list[int]:
    """Simulation 実行後、どのルールも witness で踏めなかった抜けを返す。"""
    all_idx = {r.index for r in policy.explicit_rules}
    return sorted(all_idx - matched_rule_indices)
