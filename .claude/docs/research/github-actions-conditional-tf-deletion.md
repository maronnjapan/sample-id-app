# GitHub Actions: Conditional Execution Based on Terraform Deletion

## Summary
Gemini + Codex による設計協議 (2026-04-24) の調査メモ。

## Key Finding: git diff vs terraform plan
- `terraform plan -json` は最も正確だが、CI に Terraform 認証情報を追加するコストが重い。
- `git diff` による `.tf` ファイル検査は精度が落ちるが、human OOB approval が最後の安全弁なので false-positive 許容で十分。
- **採用: `git diff` ベース**

## Detection Pattern
```bash
git diff "${BASE_SHA}" "${HEAD_SHA}" -- terraform/ \
  | grep -qE "^-[[:space:]]*resource[[:space:]]+\"(type1|type2)\""
```
- `^-` で削除行のみ対象（修正行は除外）
- resource ブロック先頭行のみマッチ → 値の変更では発火しない
- `delete + create`（replace）も resource 行が削除されるため検出可能

## Architecture Decision
- ロジックを `scripts/detect_tf_deletion.sh` に集約（CI 非依存）
- GitHub Actions は薄ラッパー `.github/actions/detect-tf-deletion/action.yml` で exit code → output 変換のみ
- 監視対象リソースは `scripts/jit-policy.json` で一元管理

## Exit Code Convention
- 0: 削除検出 → JIT 実行
- 1: 削除なし → スキップ
- 2+: エラー → ジョブ失敗

## Portability Note
Screwdriver 等への移管時は `scripts/detect_tf_deletion.sh` と `scripts/jit-policy.json` をそのまま流用可能。
CI YAML 側は `BASE_SHA` / `HEAD_SHA` / `POLICY_FILE` 環境変数をセットしてスクリプトを呼ぶだけ。
