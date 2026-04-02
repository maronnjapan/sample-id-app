# okta_app_signon_policy の catch_all プロパティ調査

調査日: 2026-04-02  
出典: https://registry.terraform.io/providers/okta/okta/latest/docs/resources/app_signon_policy  
（GitHub: okta/terraform-provider-okta / docs/resources/app_signon_policy.md）

## catch_all プロパティの仕様

| 項目 | 内容 |
|---|---|
| リソース | `okta_app_signon_policy`（ポリシー本体。ルールではない） |
| 型 | Boolean |
| デフォルト | `true` |
| 必須/任意 | Optional |

**説明:**  
> If false, the default rule of the policy is set access to `DENY`.  
> Otherwise default behavior of the default rule is to leave access at `ALLOW`.  
> **WARNING** setting this attribute to false changes policy rule's default behavior.  
> **This is only applied during creation and does not affect import or update.**

## import 後に catch_all が null になる根本原因

`catch_all` は **creation-only argument** であり、Okta API 側にこの値を読み返す仕組みが存在しない。

- 作成時: `catch_all = false` を指定すると、プロバイダーがデフォルトルールの access を `DENY` に設定して作成する
- import 時: API レスポンスには `catch_all` に相当するフィールドが存在しないため、state に `null` がセットされる
- update 時: 無視される（変更不可）

結果として `terraform import` 後に `terraform plan` を実行すると、  
`catch_all = null` という差分が常に表示される。  
Catch-All Rule が DENY・ALLOW どちらであっても同じ現象が発生する。

## Read-Only 属性

| 属性 | 説明 |
|---|---|
| `id` | Policy ID |
| `default_rule_id` | デフォルトルール（system=true）のルールID |

## import コマンド

```shell
terraform import okta_app_signon_policy.example <policy_id>
```

## 回避策

`lifecycle { ignore_changes = [catch_all] }` を設定することで、  
import 後の差分を抑制できる。

```hcl
resource "okta_app_signon_policy" "example" {
  name      = "example"
  catch_all = false
  lifecycle {
    ignore_changes = [catch_all]
  }
}
```
