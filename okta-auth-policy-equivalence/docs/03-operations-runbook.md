# 03. 運用ランブック（CI / ドリフト検知 / カットオーバー）

等価性は「一度確認して終わり」ではなく、**時間経過とともに維持** されねばならない。
以下を運用に組み込む。

## 3.1 Golden snapshot（基準の凍結）

- **import 時点** の既存ポリシーを正規化して `golden/policy_old.json` として **コミット**。
- 比較対象を「生きている旧ポリシー」ではなく **凍結スナップショット** にすることで:
  - 旧ポリシーをカットオーバー後に削除しても基準が残る
  - 基準の変更が **PR レビュー可能** になる（誰かが勝手に基準をずらせない）
- 旧ポリシーを意図的に変えた場合のみ、snapshot を更新する PR を出す（理由を必須記載）。

## 3.2 CI ゲート（マージ前）

Terraform でポリシーに触れる PR では、以下を **必須チェック** にする。

```
1. terraform plan -out plan.bin && terraform show -json plan.bin > plan.json
2. plan.json から新ポリシー想定の正規化形を生成
3. L1: pytest tests/test_structural_equivalence.py   # T(golden_old) == planned_new
4. L2: pytest tests/test_behavioral_equivalence.py   # Simulation 一致（staging org 推奨）
   いずれか fail ならマージ不可
```

- **apply 前検証**が理想（plan ベース）。実テナント変更前に等価性を確定できる。
- Simulation はステージング org（zone/group/device 定義を本番と揃えたもの）で実行。

## 3.3 apply 後検証

```
terraform apply
→ 実ポリシーを再取得し正規化
→ L1 / L2 を再実行（planned ではなく live state に対して）
→ green を確認してから次工程へ
```

## 3.4 ドリフト検知（定期）

- 日次バッチで「live(new) を取得 → `T(golden_old)` と L1 比較」。
- 差分が出たら **UI からの out-of-band 編集** か **手動の旧ポリシー変更**。
  - 前者: Terraform に戻す（`terraform apply` で是正）。
  - 後者: golden_old を更新すべきか判断（意図的変更なら snapshot 更新 PR）。
- あわせて L2 を定期実行し、Okta 側の評価エンジン挙動変化（プラットフォーム仕様変更等）も監視。

## 3.5 カットオーバー手順（旧→新 切替）

```
[Phase 0] 並走        : 新ポリシーは作成のみ、アプリ未割当。L1/L2 green を確認。
[Phase 1] 限定割当    : 一部テストアプリ/テストユーザに新ポリシーを割当、実サインインで確認。
[Phase 2] 本割当      : 対象アプリを新ポリシーへ。旧ポリシーは無効化せず温存（即時ロールバック用）。
[Phase 3] 観測        : N 日（例: 7日）green を継続。サインインログで Deny 急増が無いか監視。
[Phase 4] 旧削除      : N 日無事 → 旧ポリシーを削除。golden_old は残す。
```

- **旧ポリシーは観測期間が終わるまで削除しない**（即ロールバック手段を保持）。
- INV-1（カスタム Catch-all 無条件）違反や Deny 急増を検知したら即 Phase 2 へ戻す。

## 3.6 変更管理

- 今後ポリシーを変える際は **「golden_old 更新」+「等価性再証明」または「意図的乖離の明示記録」** を必須に。
- 「意図的に挙動を変える」変更は、等価性テストの期待値（`transform.py` の `T` または golden）を
  同じ PR 内で更新し、レビューで差分を可視化する。

## 3.7 監視で見るべきシグナル

| シグナル | 意味 |
|----------|------|
| 新ポリシーでの Deny 件数の急増 | INV-1 違反 / Catch-all 取りこぼしの疑い |
| システム Deny Catch-all のヒット数 > 0 | カスタム Catch-all のすり抜け（要調査） |
| L1 ドリフト差分 | out-of-band 編集 |
| L2 不一致シナリオ | 条件解釈/順序のズレ、Okta 評価仕様変更 |
