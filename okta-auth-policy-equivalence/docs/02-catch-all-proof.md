# 02. Catch-all 変換の等価性証明と前提条件

## 2.1 変換 `T`（旧 → 新の期待形）

```
T(P_old):
  # 非 Catch-all ルール（先頭〜末尾手前）は完全にそのまま
  new.rules[0..n-1] = P_old.rules[0..n-1]          # 順序・条件・action・要件すべて同一

  if P_old.catchall.action == DENY:
      new.system_catchall = DENY                    # 既定のまま。追加ルール無し
  else:  # P_old.catchall.action == ALLOW
      new.append( custom_catchall = Rule(
          conditions = ANY,                          # ★完全無条件（narrowing 一切なし）= INV-1
          action     = ALLOW,
          requirements = P_old.catchall.requirements # ★認証要件まで完全一致（縮約しない）= INV-2
      ))
      new.system_catchall = DENY                     # フェイルセーフとして Deny を温存
  return new
```

> **重要（ANY ALLOW ではない）**：Catch-all の ALLOW は「誰でも素通し」ではなく、
> **必ず認証要件（factorMode / constraints / 再認証間隔 …）という設定を伴う**。
> したがって等価性は「ALLOW で ANY」では決まらず、`action == ALLOW` **かつ**
> `requirements` が旧 Catch-all と完全一致して初めて成立する。
> `T` は `requirements` を **丸ごとコピー** し、`access` だけに縮約しない。

## 2.2 命題

> `P_old.catchall.action == ALLOW` のとき、
> 「`P_new` = 旧ルール列 + 無条件 Allow カスタムルール + システム Deny Catch-all」は
> 「`P_old` = 旧ルール列 + Allow Catch-all」と **挙動等価** である。

## 2.3 証明

非 Catch-all ルール列（プレフィックス）を `R = r_0 … r_{n-1}` とする。
`R` は `P_old`・`P_new` で **同一かつ同順** （T の定義より）。

**(a) プレフィックスに当たるリクエスト**
ある `r` が `R` のいずれか `r_k` に最初にマッチするなら、
評価は `r_k` で停止するので、`P_old` でも `P_new` でも
`eval = (r_k.action, r_k.requirements)` で一致。∎(プレフィックス部)

**(b) プレフィックスをすり抜けるリクエスト（fall-through 集合 `F`）**
`F = { r | R のどのルールにもマッチしない }`。
`R` が両者同一なので **`F` も両者で同一**。

- `P_old`：`F` の各 `r` は system Catch-all（conditions=ANY）にマッチ
  → `eval = (ALLOW, Req_old)`。
- `P_new`：カスタム Catch-all は `conditions = ANY` ＝ 全リクエストにマッチするので、
  `F` の各 `r` は **必ずカスタム Catch-all に最初に到達** し
  → `eval = (ALLOW, Req_old)`（T より要件は `Req_old` と同一）。

よって `F` 上でも両者一致。∎(fall-through 部)

(a)+(b) より、入力空間 `I = (Rにマッチ) ∪ F` の全域で
`eval(P_old, r) == eval(P_new, r)`。よって挙動等価。∎

**系（フェイルセーフの位置づけ）**
`P_new` のシステム Deny Catch-all に到達するのは
「カスタム Catch-all にマッチしないリクエスト」だが、
カスタム Catch-all は ANY なので該当集合は **空**。
従って Deny は通常運用では **到達不能（dead code）** であり、
カスタムルールが誤って無効化・削除された場合にのみ作用する安全網である。

## 2.4 証明が依存する前提

等価性は **次の2点が満たされる限りにおいてのみ** 成立する:

> **前提 INV-1：カスタム Catch-all の conditions は完全に無条件（ANY / 空）である。**
>
> **前提 INV-2：カスタム Catch-all の ALLOW は具体的な認証要件を伴い（≠ ANY ALLOW）、
> その要件が旧 Catch-all と完全一致する。**

**INV-1** が崩れると（ゾーン限定・グループ限定・platform 限定 … が少しでも付くと）、
その条件を外れる fall-through リクエストが **システム Deny Catch-all に落ちてしまい**、
旧 Allow と食い違う（旧=Allow / 新=Deny）。

**INV-2** が崩れると（要件が `access` だけに縮約され ANY ALLOW 化すると）、
decision は ALLOW で一致しても **要求される認証強度（多要素・再認証間隔等）が変わり**、
`(decision, requirements)` の一致＝挙動等価が崩れる。
Catch-all ALLOW は仕様上かならず認証要件を伴うため、要件空＝取りこぼし/誤変換の徴候。

→ この2つは **人手レビューに委ねず自動で強制** する。
  - **L1（構造）**：`structural_diff.assert_inv1()` が
    INV-1（conditions が空）と INV-2（requirements が access 以外を持ち、旧と一致）を assert。
  - **L2（挙動）**：fall-through 経路を狙ったシナリオで両者の `(decision, requirements)`
    一致を確認し、かつ「カスタムルールを除けば Deny になる」ことを回帰観点として記録。

## 2.5 要件（requirements）一致の注意点

`Req_old == Req_new` の比較は **正規化後** に行う（→ `lib/canonicalize.py`）。
比較対象に含めるフィールド:

- `access`（ALLOW/DENY）
- `factorMode`（1FA / 2FA）
- `constraints`（knowledge / possession、phishing-resistant、hardware-protected 等）
- `reauthenticateIn`（再認証間隔）
- `inactivityPeriod`
- `type`（ASSURANCE 等）

除外（揮発フィールド）: `id` / `created` / `lastUpdated` / `_links` / priority の**絶対値**。
priority は **相対順序のみ** を比較する。

**取りこぼし防止**：`canonicalize._norm_requirements` は上記の既知フィールドに加え、
**既知でないキーも揮発キーを除いて取り込む**（`req.*` プレフィックス）。
これは「知らないフィールドを黙って捨てて ALLOW 要件を `{access: ALLOW}` に縮約してしまう」
＝ ANY ALLOW 化を防ぐための保険であり、INV-2 と対になる。
