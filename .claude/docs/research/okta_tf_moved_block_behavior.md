# Okta Terraform Provider: moved ブロック時の DELETE API 呼び出し有無

調査日: 2026-04-24

## 結論

`moved` ブロックでリソースをリネームしても **Okta DELETE API は呼ばれない**。
git diff 検出は `moved` ブロックを「誤検知（過剰昇格）」として扱う。

## 詳細

### moved ブロックの挙動
- Terraform コアの State 管理上の操作であり、プロバイダーへの API 指示は発生しない
- 属性値に変更がなければ Okta API（DELETE/POST/PUT いずれも）は呼び出されない
- `terraform plan` 上は `is moved from` として表示され、destroy+create ではない

### okta_app_signon_policy の ForceNew 属性
- `name`, `description`, `groups_included` など主要属性に `ForceNew: true` は**設定されていない**
- 属性変更時は `PUT /api/v1/policies/{policyId}` による更新（replace ではない）

### 再作成（DELETE+POST）が走るケース
- `terraform taint` で手動汚染した場合
- State から手動削除した場合
- 通常の属性変更では発生しない

## git diff 検出への影響

| 操作 | DELETE API | git diff 検出 | 判定 |
|------|-----------|--------------|------|
| resource ブロック削除 | ✅ 呼ばれる | ✅ 検出 | 正常 |
| `moved` ブロックでリネーム | ❌ 呼ばれない | ✅ 検出（旧ブロック削除として） | **誤検知（過剰昇格）** |
| 属性値変更（ForceNew なし） | ❌ 呼ばれない | ❌ 非検出 | 正常（昇格不要） |

## 対応方針

`moved` ブロック追加時は git diff 上で旧リソース行が削除されるため検出される。
ただしこれは「過剰昇格」方向の誤検知であり、セキュリティ上は安全側に倒れている。
改善するなら `moved` ブロックの追加を diff から検出し、昇格フラグを下げる処理を追加する。
