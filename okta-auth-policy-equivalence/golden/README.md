# golden snapshots

import 時点の **基準（凍結スナップショット）** を置く場所。

- `policy_old.json` … 既存ポリシーの正規形（import 時に1回取得しコミット）
- `policy_new.json` … Terraform 版の正規形（apply 後 or plan から生成）
- `*.example.json`  … 仕組みを動かして確認するためのサンプル（Allow Catch-all のケース）

## 取得方法

```bash
python -m lib.okta_client snapshot --policy-id <OLD_POLICY_ID> > golden/policy_old.json
python -m lib.okta_client snapshot --policy-id <NEW_POLICY_ID> > golden/policy_new.json
```

## なぜ凍結するか

- 比較基準を「生きている旧ポリシー」にすると、旧ポリシー削除後に基準を失う。
- snapshot をコミットしておけば、基準の変更が **PR diff として可視化** され、
  誰かが無断で基準をずらすことを防げる（docs/03 §3.1）。

## example の構成（Allow Catch-all ケース）

`policy_old.example.json`:
  - rule[0] 社内ゾーンは 2FA Allow
  - rule[1] system Catch-all = **ALLOW**（パスワードのみ）

`policy_new.example.json`（= T(old) の期待形）:
  - rule[0] 社内ゾーンは 2FA Allow（同一）
  - rule[1] **無条件 ALLOW カスタム Catch-all**（旧 Catch-all と同一要件）
  - rule[2] system Catch-all = **DENY**（フェイルセーフ）

→ `pytest tests/test_structural_equivalence.py` が green になることを確認できる。
