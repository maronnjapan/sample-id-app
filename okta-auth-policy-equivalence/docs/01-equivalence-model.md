# 01. 等価性の形式的定義と入力空間

## 1.1 Okta authentication policy の評価モデル

app sign-on policy は **優先度昇順に並んだルール列** であり、評価は次の通り。

```
eval(P, r):
  for rule in P.rules (priority ascending):     # 末尾は必ず system Catch-all
      if matches(rule.conditions, r):
          return (rule.action, rule.requirements)   # 最初にマッチしたルールが勝つ
  # Catch-all は conditions=ANY なので必ずここに到達しない
```

- `r` = 1回の認証リクエスト（= 入力空間 `I` の一点）
- 返り値 = `(decision, requirements)`
  - `decision` ∈ {ALLOW, DENY}
  - `requirements` = ALLOW 時の検証要件
    （factorMode / constraints(knowledge・possession) / reauthenticateIn / inactivityPeriod / phishing-resistant 等）

## 1.2 等価性の定義

2つのポリシー `P_old`, `P_new` が **挙動等価** であるとは:

```
∀ r ∈ I :  eval(P_old, r) == eval(P_new, r)
```

ここで `==` は **(decision, requirements) の一致** を指す。
**「どのルールにマッチしたか（ルール名）」の一致は要求しない** ——
Catch-all 差分では旧 system Catch-all と新カスタムルールで“マッチしたルール”は変わるが、
結果 `(ALLOW, 同一要件)` が同じなら挙動等価だからである（→ `docs/02`）。

## 1.3 入力空間 `I`

`I` は、いずれかのポリシーのルールが参照する **全条件次元の直積**。

| 次元 | 例 |
|------|----|
| network / zone | IP, 既定ゾーン, ブラックリストゾーン |
| user / group | 対象グループ集合への所属有無 |
| user type | employee / contractor 等 |
| device platform | iOS / Android / macOS / Windows / その他 |
| device management | managed / unmanaged |
| device registration | registered / not |
| device assurance | 各 assurance policy 充足有無 |
| authentication method | password / fido2 / okta verify ... |
| risk level | LOW / MEDIUM / HIGH |
| custom expression (elCondition) | 任意属性 |

`I` は実質無限大なので、**全域検証は L1（構造）で**、
**代表点検証は L2（シミュレーション）で** 分担する（次節）。

## 1.4 なぜ構造等価が「網羅的」か

`P_old` と `P_new` は **同一ソースから機械的に派生** している。
よって等価性の証明は「無限の `I` を試す」必要はなく、
**「ルール列が変換規則 `T` の通りに対応している」** を示せば足りる:

```
P_new == T(P_old)
```

`T` は Catch-all 差分のみを表す既知の変換（→ `lib/transform.py`, `docs/02`）。
ルール列は有限なので、`T(P_old)` と `P_new` の **フィールド単位差分が 0** であることは
**設定空間に対して網羅的** に検証できる。これが主担保（L1）。

L2（シミュレーション）は、L1 が前提とする
「matches() の解釈」「優先度順序の実挙動」「`T` の挙動保存性」を
実テナントの判定エンジンで裏取りする補強層である。
