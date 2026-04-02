# Okta 認証ポリシー Catch-All Rule の IaC 管理における課題と確認事項

作成日: 2026-04-02

---

## 背景・問題の概要

Okta 上に既存の認証ポリシー（App Sign-On Policy）を Terraform / OpenTofu（以下、IaC）の state に import した際、Catch-All Rule（デフォルトルール）の実際の設定値（ALLOW / DENY）が state に正しく反映されないという問題が判明した。

具体的には、Okta 上で Catch-All Rule が DENY に設定されているにもかかわらず、import 後の state では常に ALLOW（`catch_all = true`）として記録される。そのため、IaC による設定値の管理・差分検知が機能せず、実態と state が乖離した状態になる。

---

## 技術的な詳細

### Catch-All Rule とは

認証ポリシーには必ず1つ「Catch-All Rule」と呼ばれるデフォルトルールが存在し、他のルールにマッチしなかったアクセスの扱い（ALLOW / DENY）を決定する。このルールは Okta 側でポリシー作成時に自動生成される。

### IaC プロバイダーの制限

Terraform / OpenTofu の Okta プロバイダー（`okta_app_signon_policy`）には `catch_all` というプロパティが存在するが、公式ドキュメントには以下の記載がある。

> catch_all (Boolean, default true, creation-only argument)  
> If false, the default rule of the policy is set access to DENY. Otherwise default behavior of the default rule is to leave access at ALLOW.  
> This is only applied during creation and does not affect import or update.

### 発生する問題

| 状況 | 期待する動作 | 実際の動作 |
|------|------------|-----------|
| 既存ポリシーを `tofu import` で取り込む | Catch-All Rule の実態（DENY 等）が state に反映される | 実態に沿わず常にデフォルト値が state に入る |
| Catch-All Rule を `okta_app_signon_policy_rule` で管理しようとする | import ブロックを書いて一括 apply できる | Rule ID が事前に不明なため、2フェーズの作業が必要 |

### なぜ Rule ID が事前に不明なのか

Catch-All Rule の ID は、ポリシーを Okta に作成した後に Okta 側で採番される。そのため IaC の設定ファイルを書く時点では ID が分からず、一度 apply してから Okta API または管理コンソールで ID を確認し、改めて import する必要がある。

---

## 確認事項

### 確認1: プロバイダー側の対応予定はあるか

`catch_all` プロパティが import / update 時にも Okta API の実態値を読み取るよう、Terraform / OpenTofu プロバイダーの改修予定はあるか。

- 対象プロバイダー: [terraform-provider-okta](https://github.com/okta/terraform-provider-okta)
- 該当リソース: `okta_app_signon_policy`

### 確認2: Catch-All Rule を IaC で完全管理するための公式な手順はあるか

現状、以下の2フェーズが必要になっているが、これが公式に推奨される手順か確認したい。

1. ポリシーおよび Catch-All 以外のルールを apply
2. Catch-All Rule の ID を Okta API / 管理コンソールで確認し、import して再 apply

また、このフローを自動化するための公式ツールやスクリプトが提供されているか。

### 確認3: `okta_app_signon_policy_rule` での Catch-All Rule 管理は公式サポートされているか

Catch-All Rule を `okta_app_signon_policy_rule` リソースで管理することは、Okta として公式にサポートされている使い方か。また、その際に注意すべき制約はあるか。

---

## Okta 側で対応不可の場合の代替策

### 案1: 2フェーズ apply による管理

以下の手順を踏むことで、Catch-All Rule を `okta_app_signon_policy_rule` リソースとして IaC 管理下に置く。

1. 第1フェーズ: Catch-All Rule を含まない状態で認証ポリシーおよびその他ルールを `tofu apply` する
2. 第2フェーズ: apply 後に Okta 管理コンソールまたは API で Catch-All Rule の ID を確認し、import ブロックと `okta_app_signon_policy_rule` リソース定義を追記して再度 `tofu apply` する

この手順により、Catch-All Rule を state で管理し、以降の差分検知が機能するようになる。

メリット: state で Catch-All Rule を管理できる。apply 後はドリフト検知が機能する。  
デメリット: 認証ポリシーを新規作成するたびに2フェーズの手順が必要になる。

---

### 案2: Catch-All Rule の IaC 管理を割り切る

Catch-All Rule のみ IaC 管理対象外とし、運用ドキュメントで「Catch-All Rule は常に DENY に手動設定すること」を規定する。

メリット: IaC の複雑さが増えない。  
デメリット: 人的ミスのリスクが残る。ドリフトの検知ができない。IaC 管理の一貫性が失われる。

---

## まとめ

| 確認事項 | 目的 |
|---------|------|
| プロバイダーの改修予定 | 根本解決の可能性を確認 |
| 公式推奨手順の有無 | 現在の対応が正しいか確認 |
| `okta_app_signon_policy_rule` のサポート状況 | 案1の実現可能性を確認 |

Okta 側での根本対応がない場合、上記の2案が考えられる。運用上の現実的な選択として案1・案2のどちらを推奨するかについても合わせて確認したい。
