# 認証ポリシー IaC 化における設定同一性担保 検証仕様書

- 文書バージョン: 1.0
- 対象: 手動作成された既存認証ポリシーの Terraform / OpenTofu IaC 化
- 想定読者: 検証設計者・スクリプト実装者・レビュアー
- 表記: 本書では Terraform / OpenTofu を総称して「TF」と表記する。コマンド例は `tofu` で記載するが、`terraform` に読み替え可能。IdP は Okta を主例として記載するが、方式自体は他 IdP にも適用可能な形で設計する。

---

## 1. 目的

手動作成された既存認証ポリシー(以下「既存ポリシー」)を TF で IaC 化するにあたり、import → `plan -generate-config-out` → コード整備 → apply の流れで作成した新規認証ポリシー(以下「新規ポリシー」)が、**名前や ID などの許容差分を除き、設定内容として既存ポリシーと 100% 同一である**ことを、機械的・再現可能・説明可能な形で担保する方法を定義する。

「だいたい同じに見える」「管理画面上は同じに見える」「TF で作成できた」ではなく、以下を満たす状態をゴールとする。

1. 許容差分リストが明示され、それ以外に差分が存在しないことが機械的に確認されている
2. その確認方法自体の妥当性(差分を入れたら検出できること)がテストで証明されている
3. provider が表現できない設定項目の有無が明示的に確認され、残リスクとして文書化されている
4. 上記すべてが再現可能な手順とレポートとして残っている

## 2. 前提

| # | 前提 |
|---|------|
| P1 | 既存ポリシーは手動作成されたものであり、現時点で IaC 管理されていない |
| P2 | 既存ポリシーの TF への import は実施済み |
| P3 | `plan -generate-config-out` 等によるコード生成は実施済み |
| P4 | 生成コードの整形・調整は実施済み |
| P5 | 新規ポリシーは整備済みの TF コードから apply で作成される |
| P6 | 新規ポリシーは既存ポリシーとポリシー名のみ異なる想定 |
| P7 | アプリ割り当ては比較対象外(後から手動で実施する) |
| P8 | 既存ポリシーと新規ポリシーは同一テナント(同一 Org)内に存在する。したがってグループ ID・ネットワークゾーン ID 等の参照先 ID は両者で一致し得るため、これらは比較対象に含める |
| P9 | 検証期間中、既存ポリシーには手動変更を加えない(変更凍結)。凍結が破られていないことは監査ログで確認する(§4, §13) |
| P10 | 検証に使用する API バージョン・provider バージョン・TF バージョンは固定し、レポートに記録する |

補足: P8 は重要な前提である。もし将来、別テナントへの複製に本仕様を流用する場合、環境依存 ID の扱い(§7.11)を「マッピング表による突合」に変更する必要がある。

---

## 3. 同一性担保アプローチの洗い出し

### 3.1 アプローチ一覧と評価

各アプローチを「何を確認できるか / できないか」「信頼度」「機械化・再現性」「コスト」「見逃しリスク」で評価する。信頼度・コストは 高/中/低 の 3 段階。

#### A1. API response を使った実リソース比較(既存 vs 新規)

IdP の管理 API(Okta なら `GET /api/v1/policies/{id}` と `GET /api/v1/policies/{id}/rules`)から両ポリシーの実リソースを取得し、正規化した上で deep diff する。

- 確認できること: **IdP が実際に保持している設定値**同士の一致。TF・provider・state を経由しない「最終結果物」の比較であり、provider のバグや state の欠落の影響を受けない。
- 確認できないこと: (a) API response に現れない内部設定(存在するなら)。(b) 設定値が同一でも実行時挙動が同一である保証(評価エンジン側の差異)。(c) API 自体が返さない管理画面限定項目。
- 信頼度: **高**(唯一「実物」を見る方法)
- 機械化・再現性: 高。レビュー容易性: 高(diff 結果が JSON path で示せる)
- 実装コスト: 中(正規化ルールの設計が本体)/ 運用コスト: 低
- 見逃しリスク: API に現れない項目のみ。除外 path を広げすぎた場合の自傷リスクあり(→ §9 で担保)

#### A2. TF state 比較(import state vs 新規作成 state)

import 済み既存リソースの state と、apply で作成した新規リソースの state を `tofu show -json` で抽出し比較する。

- 確認できること: **provider が認識する範囲**での両者の一致。TF コードが両リソースを同一に「表現」できているかの確認。
- 確認できないこと: provider スキーマに存在しない API 項目の差分(**構造的に検出不可能**)。provider の Read 実装が読み落とす項目。
- 信頼度: 中(provider のレンズ越しの比較)
- 機械化・再現性: 高
- 実装コスト: 低 / 運用コスト: 低
- 見逃しリスク: **provider 表現不足がそのまま盲点になる**。単独では不十分だが、A1 と組み合わせると「provider 視点でも一致」という補強証拠になる。

#### A3. TF plan 差分確認(冪等性確認)

(a) import 済み既存リソースに対する plan が `No changes` であること、(b) 新規リソース apply 直後の再 plan が `No changes` であること、を確認する。

- 確認できること: TF コードと実リソースが provider 視点で一致していること(コードの表現漏れ・default 差分の一部を検出)。
- 確認できないこと: provider 管理外項目。plan が沈黙する属性(`ignore_changes` 相当の provider 内部挙動、Computed 属性)。
- 信頼度: 中
- 機械化・再現性: 高(`-detailed-exitcode` で機械判定可能)
- 実装コスト: 低 / 運用コスト: 低
- 見逃しリスク: 中。ただし**低コストで常設できる回帰検知**として価値が高い。

#### A4. provider schema と API response の突合(カバレッジギャップ検出)

`tofu providers schema -json` で対象リソースのスキーマを取得し、API response の全フィールドと突合して「API には存在するが provider schema に存在しない項目」を列挙する。

- 確認できること: **provider の表現不足の存在**。「provider では管理できないが認証動作に影響するかもしれない項目」の洗い出し。
- 確認できないこと: 値の一致そのもの(これは A1 の仕事)。schema に存在しても Read/Write が壊れているケース。
- 信頼度: 高(ギャップ検出目的に限れば)
- 機械化・再現性: 高
- 実装コスト: 中(ネスト構造・命名規約差の突合ロジック)/ 運用コスト: 低
- 見逃しリスク: 命名規約変換(camelCase ↔ snake_case、ネストのフラット化)の突合ミス。誤検知はレビューで潰せるため fail 側に倒す。

#### A5. provider の Read 結果を使った検証(refresh 比較)

新規リソースに対し `tofu apply -refresh-only` → state 再取得し、apply 直後 state とドリフトがないことを確認する。

- 確認できること: provider の Write と Read の整合(書いたつもりの値が読み戻せること)。API default の暗黙適用の一部検出。
- 確認できないこと: A2 と同じ盲点。
- 信頼度: 中 / コスト: 低
- 位置づけ: A3 の亜種。A3 に統合して運用する。

#### A6. 管理画面の設定エクスポート機能の活用

IdP がポリシーのエクスポート機能を持つ場合、両ポリシーをエクスポートして比較する。

- Okta の場合: 認証ポリシー(Authentication Policy / Global Session Policy / MFA Enrollment Policy 等)に対する公式の汎用エクスポート機能は限定的であり、実体は API response と同等の情報になることが多い。存在する場合でも情報源は API と同根。
- 確認できること: A1 とほぼ同等(エクスポートが API ベースの場合)。
- 信頼度: 中(エクスポート仕様がブラックボックスの場合、正規化根拠を説明しにくい)
- 位置づけ: **A1 で代替可能なため主検証には採用しない**。エクスポート機能が API より広い情報を含むことが確認できた場合のみ補助として追加。

#### A7. 管理画面の目視確認(補助)

管理画面で両ポリシーの設定画面を並べ、スクリーンショットを取得して目視比較する。

- 確認できること: **API / provider では確認しづらい UI 表示項目**の存在確認。人間のレビュアーに対する説明材料。
- 確認できないこと: 網羅性・機械性・再現性は皆無。UI は API 値を加工表示するため、UI が同じでも API 値が異なる場合すら理論上あり得る。
- 信頼度: 低(単独では)
- 位置づけ: **証跡・説明補助専用**。判定根拠には使わない。スクリーンショットをレポートに添付する。

#### A8. 監査ログ・変更履歴の確認

IdP の System Log / 監査ログで、(a) 既存ポリシーが検証基準時点以降に変更されていないこと、(b) 新規ポリシーへの変更が TF 実行由来のみであることを確認する。

- 確認できること: **比較の前提条件の成立**(変更凍結の担保、比較スナップショットの鮮度)。
- 確認できないこと: 設定値の一致そのもの。
- 信頼度: 高(前提担保目的に限れば)
- 位置づけ: 前提検証レイヤーとして採用。

#### A9. 認証フローの実動作テスト

テストユーザーで実際に認証を行い、両ポリシー配下で同一の挙動(要求される要素、セッション挙動等)になることを確認する。

- 確認できること: 「設定値は同一だが挙動が異なる」リスクの一部低減。設定→挙動のマッピングの実証。
- 確認できないこと: 全条件分岐の網羅は現実的に不可能(条件の組合せ爆発)。また新規ポリシーはアプリ割り当て前のため、**割り当てなしでは挙動テストの実施自体に検証用アプリの一時割り当てが必要**になり、P7 との整合に注意が要る。
- 信頼度: 高(テストしたパスに限り)/ 網羅性: 低
- 実装・運用コスト: 高
- 位置づけ: **任意の補強レイヤー**。主要ルール数本の代表パスのみをスモークテストとして実施する(検証用ダミーアプリを一時割り当てて実施し、検証後に解除。これはアプリ割り当ての「比較」ではないため P7 と矛盾しない)。

#### A10. 意図的な差分注入による検出確認(ミューテーションテスト)

検証パイプラインが本当に差分を検出できることを、意図的に差分を作って確認する。2 形態で行う。

- (a) fixture ベース: 保存済み API response JSON に人工差分を注入し、diff スクリプトが検出することを CI で常時確認(§9)。
- (b) 実環境ベース: TF コードから一部設定を意図的に落として apply し、A1/A3 が検出することを 1 回以上実証する(実施後に復元)。
- 確認できること: **検証ロジック自体の妥当性**。「差分がない」という結果の信頼性の根拠。
- 信頼度: 検証系の信頼度を直接引き上げる
- 位置づけ: 必須。これがないと「差分ゼロ」は「検出器が壊れているだけ」と区別できない。

#### A11. 複数レイヤーの組み合わせ(多層検証)

A1〜A10 は盲点がそれぞれ異なるため、盲点が重ならない組み合わせで多層化する。→ §4 で採用構成を定義。

### 3.2 アプローチ比較表

| # | アプローチ | 検出できる差分 | 検出できない差分 | 信頼度 | 機械化 | 実装コスト | 見逃しリスク | 採用 |
|---|---|---|---|---|---|---|---|---|
| A1 | API response 実リソース比較 | IdP が保持する全設定値の差分 | API に現れない項目 / 挙動差 | 高 | ○ | 中 | 低 | ◎ 主検証 |
| A2 | state 同士の比較 | provider 認識範囲の差分 | provider 管理外項目 | 中 | ○ | 低 | 中 | ○ 補助 |
| A3 | plan 冪等性確認 | コードと実リソースの provider 視点差分 | provider 管理外 / Computed | 中 | ○ | 低 | 中 | ○ 補助 |
| A4 | schema × API 突合 | provider 表現不足の**存在** | 値の差分そのもの | 高 | ○ | 中 | 低 | ◎ ギャップ検出 |
| A5 | refresh 比較 | Write/Read 不整合 | A2 と同じ | 中 | ○ | 低 | 中 | A3 に統合 |
| A6 | 管理画面エクスポート比較 | (エクスポート仕様依存) | 仕様がブラックボックス | 中 | △ | 低 | 中 | △ 条件付き |
| A7 | 管理画面目視 | UI 限定項目の存在 | ほぼ全て(網羅不可) | 低 | × | 低 | 高 | △ 証跡のみ |
| A8 | 監査ログ確認 | 変更凍結違反 / 比較鮮度 | 設定値差分 | 高 | ○ | 低 | 低 | ○ 前提担保 |
| A9 | 実動作テスト | 代表パスの挙動差 | 非網羅パス | 高(局所) | △ | 高 | 中 | △ 任意補強 |
| A10 | 差分注入検出確認 | 検証ロジックの欠陥 | ― | ― | ○ | 中 | ― | ◎ 必須 |

---

## 4. 推奨検証アーキテクチャ

### 4.1 採用構成(5 レイヤー + 前提レイヤー)

単一方式に依存せず、盲点が直交するレイヤーを重ねる。

```
 L0  前提担保          : 監査ログで変更凍結を確認 (A8)
 ------------------------------------------------------------
 L1  主検証            : API response 正規化 + deep diff (A1)
                          → 「IdP 上の実設定が一致」の直接証拠
 L2  カバレッジ検証    : provider schema × API response 突合 (A4)
                          → 「provider が表現できない項目」の洗い出し
 L3  IaC 整合検証      : plan 冪等性 (A3+A5) + state 間比較 (A2)
                          → 「TF コードが両者を同一に表現」の証拠
 L4  検証系の検証      : fixture 差分注入 + 実環境差分注入 (A10)
                          → 「差分ゼロ判定が信頼できる」根拠
 L5  補強(任意)      : 代表パス実動作テスト (A9) / 画面証跡 (A7)
```

役割分担の考え方:

- **主たる同一性確認**: L1。判定(pass/fail)の根拠は L1 の diff 結果のみとする。
- **provider の表現不足の検出**: L2。L2 で検出されたギャップ項目は「L1 で値一致は確認済みだが TF では今後管理できない項目」としてリスク台帳に記録する(値の一致確認自体は L1 が API 全フィールドを見るためカバーされる点が本アーキテクチャの要)。
- **見逃しリスク低減**: L3(provider という別レンズでの二重確認)+ L4(検出能力の証明)+ 除外リスト最小主義(§6)+ unknown field fail-closed(§7.13)。
- **設定値は同じだが挙動が異なるリスクの低減**: L5 の代表パステスト + §13 の残リスク明示。
- **レビュー可能性・説明可能性**: すべての中間生成物(生 response、正規化後 JSON、diff 結果、除外リスト、正規化ルール)をファイルとして保存し、レポート(§12)から参照する。

### 4.2 データフロー

```
 [IdP API] --fetch--> raw/existing.json ----+
 [IdP API] --fetch--> raw/new.json ---------+--normalize--> normalized/*.json --deep diff--> diff-report
                                            |
 [tofu providers schema -json] --------------+--coverage-check--> gap-report
                                            |
 [tofu show -json (import側/新規側 state)] --+--state-diff-----> state-diff-report
 [tofu plan -detailed-exitcode] ------------+--exitcode-------> idempotency-result
                                            |
 [fixtures + mutations] --------------------+--self-test------> verifier-test-result
                                            v
                                     [最終検証レポート]
```

### 4.3 ディレクトリ構成案

```
policy-parity-verification/
├── README.md
├── Makefile                        # 検証パイプラインのエントリポイント
├── config/
│   ├── targets.yaml                # 既存/新規ポリシー ID、API base URL、リソースアドレス
│   ├── exclude-paths.yaml          # 比較対象外 path 定義(§6)※最小限
│   ├── normalize-rules.yaml        # 正規化ルール定義(§7)
│   └── known-defaults.yaml         # 文書化済み API default の注入定義(§7.5)
├── scripts/
│   ├── fetch_policy.py             # S1: API response 取得
│   ├── normalize.py                # S2: 正規化
│   ├── deep_diff.py                # S3: deep diff + 分類
│   ├── extract_state.py            # S4: state 抽出・比較
│   ├── schema_coverage.py          # S5: schema × API 突合
│   ├── check_audit_log.py          # S6: 変更凍結確認
│   └── build_report.py             # S7: レポート生成
├── tests/
│   ├── fixtures/
│   │   ├── base_policy.json        # 基準 fixture(実 response を匿名化して保存)
│   │   └── base_rules.json
│   ├── mutations/                  # 差分注入定義(§9 のケースに対応)
│   │   ├── m01_change_mfa.yaml
│   │   ├── m02_change_priority.yaml
│   │   └── ...
│   └── test_verifier.py            # 検証ロジック自体のテスト
├── artifacts/                      # 実行ごとの成果物(git 管理 or 保全先へ退避)
│   └── {run_id}/
│       ├── raw/existing_policy.json / existing_rules.json
│       ├── raw/new_policy.json / new_rules.json
│       ├── normalized/…
│       ├── diff/diff_result.json
│       ├── state/…
│       ├── coverage/gap_report.json
│       ├── plan/plan_exitcode.txt
│       └── report.md
└── docs/
    ├── risk-register.md            # 残リスク台帳(§13)
    └── decision-log.md             # 除外・正規化の判断記録
```

### 4.4 主要コマンド例(パイプライン)

```bash
RUN_ID=$(date +%Y%m%dT%H%M%S)

# L0: 変更凍結確認(基準時刻以降に既存ポリシーへの変更イベントがないこと)
python scripts/check_audit_log.py --policy-id "$EXISTING_ID" \
  --since "$FREEZE_TIMESTAMP" --out artifacts/$RUN_ID/audit.json

# L1: 取得 → 正規化 → diff
python scripts/fetch_policy.py --policy-id "$EXISTING_ID" --out artifacts/$RUN_ID/raw/existing
python scripts/fetch_policy.py --policy-id "$NEW_ID"      --out artifacts/$RUN_ID/raw/new
python scripts/normalize.py --in artifacts/$RUN_ID/raw/existing --rules config/normalize-rules.yaml \
  --exclude config/exclude-paths.yaml --out artifacts/$RUN_ID/normalized/existing.json
python scripts/normalize.py --in artifacts/$RUN_ID/raw/new --rules config/normalize-rules.yaml \
  --exclude config/exclude-paths.yaml --out artifacts/$RUN_ID/normalized/new.json
python scripts/deep_diff.py artifacts/$RUN_ID/normalized/existing.json \
  artifacts/$RUN_ID/normalized/new.json --out artifacts/$RUN_ID/diff/diff_result.json

# L2: provider schema カバレッジ
tofu providers schema -json > artifacts/$RUN_ID/coverage/provider_schema.json
python scripts/schema_coverage.py --schema artifacts/$RUN_ID/coverage/provider_schema.json \
  --api-response artifacts/$RUN_ID/raw/existing --resource-types okta_app_signon_policy,okta_app_signon_policy_rule \
  --out artifacts/$RUN_ID/coverage/gap_report.json

# L3: plan 冪等性 + state 比較
tofu plan -detailed-exitcode -no-color > artifacts/$RUN_ID/plan/plan.txt; echo $? > artifacts/$RUN_ID/plan/plan_exitcode.txt
tofu show -json > artifacts/$RUN_ID/state/state.json
python scripts/extract_state.py --state artifacts/$RUN_ID/state/state.json \
  --existing-addr "$EXISTING_ADDR" --new-addr "$NEW_ADDR" --out artifacts/$RUN_ID/state/state_diff.json

# L4: 検証系の検証(fixture ミューテーション)
pytest tests/test_verifier.py -q

# レポート生成
python scripts/build_report.py --run artifacts/$RUN_ID --out artifacts/$RUN_ID/report.md
```

`Makefile` に `make verify RUN_ID=...` として一括実行を定義し、ローカル・CI で同一コマンドとする。

---

## 5. 比較対象項目の定義

原則: **除外リスト(§6)に載っていない API response 上の全フィールドが比較対象**である(fail-closed)。以下は「必ず比較対象に含まれていることをレビューで確認すべき項目」のチェックリストであり、比較対象を以下に限定する意味ではない。

| カテゴリ | 項目 | 備考(Okta の例) |
|---|---|---|
| ポリシー本体 | policy type | `type`(例: `ACCESS_POLICY`, `OKTA_SIGN_ON`, `MFA_ENROLL`) |
| | policy status | `status`(ACTIVE / INACTIVE) |
| | policy description | `description` |
| | policy priority | `priority`(同 type 内の他ポリシーとの相対評価順。※新規ポリシー追加により番号自体はずれ得るため扱いは §7.10 参照) |
| | policy conditions | `conditions`(people / groups など。ただしアプリ条件は §6 参照) |
| ルール | rule の集合 | ルール数の一致を含む |
| | rule priority | `priority`。**認証動作に直結するため必須比較** |
| | rule status | ACTIVE / INACTIVE |
| | rule name | ルール名は動作に影響しないが、**設定の同一性の一部として比較対象に含める**(ポリシー名と異なり変更していない想定のため) |
| | rule conditions | `conditions` 配下全て |
| | rule actions | `actions` 配下全て |
| | rule evaluation order | priority 順で決まる評価順(§7.10) |
| 条件詳細 | user conditions | `conditions.people.users`(include / exclude) |
| | group conditions | `conditions.people.groups`(include / exclude) |
| | network / zone conditions | `conditions.network`(connection, include/exclude zones)。ゾーン ID は同一テナントのため値ごと比較(P8) |
| | device conditions | `conditions.device`(registered, managed, platform, assurance 参照等) |
| | risk conditions | `conditions.riskScore`, `conditions.risk` 等 |
| | IdP conditions | `conditions.identityProvider` |
| | authentication method conditions | `conditions.userType`, `conditions.elCondition`, chain 系条件等、認証手段に関わる条件全般 |
| アクション詳細 | MFA / authenticator / assurance | `actions.appSignOn.verificationMethod`(factorMode, type, constraints[].knowledge / possession / methods / reauthenticateIn / required 等)、authenticator 列挙、AAL/assurance 設定 |
| | session settings | `actions.signon.session`(maxSessionIdleMinutes, maxSessionLifetimeMinutes, usePersistentCookie 等) |
| | token lifetime settings | 対象ポリシーが token 系の場合の lifetime / refresh 設定(`actions.token` 等) |
| | access 判定 | `actions.appSignOn.access`(ALLOW / DENY)、`actions.signon.access` |
| その他 | 上記に該当しない全フィールド | **unknown field を含め全て比較対象**(§7.13) |

レビュー時は、正規化後 JSON に上表の項目が実在することを確認する(スクリプト S3 が「比較したキー一覧」を出力する。§8 参照)。

---

## 6. 比較対象外項目の定義

除外は**最小限**とし、各項目に除外理由を必須で付す。除外 path は `config/exclude-paths.yaml` に JSON path 形式で定義し、**定義にない項目の差分はすべて fail** とする。

| 除外項目 | path 例(Okta) | 除外理由 |
|---|---|---|
| policy name | `$.name` | 新規ポリシーは意図的に名前を変えている(P6)。動作に影響しない表示名 |
| policy id | `$.id` | システム採番。同一になり得ない |
| rule id | `$.rules[*].id` | 同上 |
| created | `$.created`, `$.rules[*].created` | 作成時刻。必然的に異なる |
| lastUpdated | `$.lastUpdated`, `$.rules[*].lastUpdated` | 更新時刻。必然的に異なる |
| links / href / self | `$._links`, `$.rules[*]._links` | HATEOAS リンク。ID を含む URL であり設定値ではない |
| system generated metadata | `$.createdBy`, `$.lastUpdatedBy` 等(存在する場合) | 作成主体の記録であり設定値ではない |
| app assignments / application references | ポリシーに紐づくアプリ一覧 API(`/api/v1/policies/{id}/app` 等)、および `conditions.app` / `conditions.clients` 等のアプリ参照条件 | P7 により対象外。**ただし §13 R11 の通り、これはポリシー本体の同一性と適用範囲の同一性が別物になることを意味するため、レポートに明記する** |
| TF state 内部情報 | `.terraform` メタ、state の `serial` / `lineage` / `schema_version` / provider アドレス等 | L3 の state 比較時のみ関係。TF の管理情報であり IdP 設定値ではない |

注意事項:

- `conditions.app` を除外する場合でも、除外は**アプリ参照そのもの**に限定する。例えばアプリ条件の中に認証強度指定が同居する構造であれば、その部分は比較対象に残す設計をレビューで確認する。
- policy priority(ポリシー本体の評価順)は「除外」ではなく「正規化して比較」(§7.10)。安易に除外しない。
- 除外 path の追加は必ず `docs/decision-log.md` に理由とレビュー承認を記録した上で行う。**「diff が消えないから除外する」は禁止**。差分は必ず §11 手順 8 の分類を経る。

---

## 7. 正規化ルール

正規化はすべて `config/normalize-rules.yaml` に宣言的に定義し、スクリプト S2 が適用する。適用した正規化はレポートに全件記録する。

### 7.1 JSON key の順序
オブジェクトのキー順序は意味を持たないため、比較前にキーを辞書順に並べ替える(diff ライブラリがキー順非依存であれば実装上は不要だが、正規化後 JSON を人間が diff するために必ずソートして出力する)。

### 7.2 null と未設定値(キー欠落)の扱い
- 原則: `"key": null` とキー欠落は**同値として正規化**する(null キーを削除)。API がリクエスト内容によって null を返したり省略したりする揺れを吸収するため。
- 例外: null が「明示的な無効化」を意味することが文書化されているフィールドは、`normalize-rules.yaml` の `null_significant_paths` に列挙し、同値化しない。
- 適用結果(削除した null キーの一覧)はレポートに記録する。

### 7.3 空配列と未設定値の扱い
- 原則: 空配列 `[]` とキー欠落は**別物として扱う**(同値化しない)。`include: []` が「誰も含めない」を意味し得るため、安易な同値化は動作差分の見逃しにつながる。
- 例外: API 仕様上「省略時は空配列と同義」と文書化されている path のみ `empty_array_equals_absent_paths` に列挙して同値化する。根拠 URL を decision-log に記録。

### 7.4 空文字列
- `""` と欠落は原則別物。`description: ""` と description 欠落など、API が揺れることが確認された path のみ個別に同値化する。

### 7.5 API default value の扱い
- 原則: **default の暗黙補完は行わない**。API response に現れた値をそのまま比較する(両者とも同じ API から取得するため、default は両者に同様に現れるはず)。
- 例外: 「既存は明示値・新規は省略(またはその逆)で API が異なる形を返す」ケースが実際に観測された場合のみ、公式ドキュメントで default が確認できた path に限り `known-defaults.yaml` に基づき default を注入して比較する。注入した事実と根拠をレポートに記録。
- 未文書化 default の推測補完は禁止。その差分は §11 手順 8 で「API default による差分」と分類し、可能なら TF コード側を明示値に修正して差分自体を解消する方向を優先する。

### 7.6 boolean default の扱い
7.5 に準じる。`false` と欠落の同値化は文書化された default が `false` の場合のみ。

### 7.7 数値と文字列の型差分
- 原則: 型込みで比較する(`"5"` ≠ `5`)。同一 API から取得する限り型は揃うはずであり、型差分が出た場合はむしろ取得経路の不整合を疑う。
- state 比較(L3)でのみ、provider が型変換するフィールドについて個別に型正規化を許可する。

### 7.8 大文字小文字
- 原則: case-sensitive で比較する。
- 例外: API 仕様上 case-insensitive と定義されている値(一部の enum 等)のみ `case_insensitive_paths` で小文字化。

### 7.9 順序が意味を持つ配列 / 持たない配列
- **順序が意味を持つ配列**(例: `constraints` の評価順が定義されている場合、chain 系条件): ソートせず、インデックス位置込みで比較する。順序差分は fail。
- **順序が意味を持たない配列**(例: グループ ID の include リスト、zone ID リスト、authenticator の許可集合): 比較前に安定ソート(要素が scalar なら値で、object なら正規化キーで)した上で比較する。
- どちらに属するかは `ordered_array_paths` / `unordered_array_paths` に**全配列 path を明示的に分類**する。未分類の配列 path が現れた場合、S2 はエラー(exit 2)で停止する(安易なデフォルトソートの禁止)。

### 7.10 rule priority / evaluation order の扱い
- ルール配列は API が priority 順で返す保証に依存せず、**priority 昇順に安定ソートしてから位置合わせ比較**する。
- その上で **priority の値自体も比較対象**とする(ソートで順序を合わせても、値のズレ・重複・欠番の差は検出される)。
- Okta のデフォルトルール(Catch-all 等、システムが自動生成する最後尾ルール)は「除外」せず比較対象に含める。ただし ID・timestamp は §6 に従う。
- ポリシー本体の priority: 同 type のポリシー集合に新規ポリシーが 1 つ増えるため、絶対値の一致は原理的に保証できない場合がある。方針: (a) 絶対値が一致すればそのまま pass、(b) 一致しない場合は「ポリシー間相対順序が意図通りか」を手動確認項目としてレポートに残し、絶対値差分は「許容差分(理由付き)」として明示分類する。無条件除外はしない。

### 7.11 環境依存 ID の扱い
- 同一テナント内比較(P8)のため、グループ ID・ユーザー ID・zone ID・authenticator ID 等の**参照先 ID は正規化せず値ごと比較**する(同一 ID を参照していなければ fail が正しい)。
- ポリシー自身・ルール自身の ID のみ §6 で除外。
- 参照先 ID の除外・placeholder 化は行わない(行うと「別のグループを参照している」重大差分を見逃す)。

### 7.12 除外 path の指定方法
- JSONPath 記法(`$.rules[*].id` 形式)で `exclude-paths.yaml` に定義。ワイルドカードは配列インデックスにのみ許可し、キー名のワイルドカード(`$..id` のような再帰)は**禁止**(意図しない広範囲除外を防ぐ)。
- S2 は「実際に除外がヒットした path と件数」を出力し、**1 件もヒットしなかった除外定義は警告**とする(定義の腐敗検知)。

### 7.13 unknown field の扱い
- スキーマや本仕様の項目表に載っていないフィールドが API response に現れた場合も、**比較対象に含める(fail-closed)**。
- unknown field で差分が出た場合は fail とし、§11 手順 8 の分類に回す。「知らないフィールドだから無視」は禁止。

---

## 8. 検証スクリプト仕様

共通仕様:

- 言語: Python 3.11+(標準ライブラリ + `pyyaml` + `deepdiff` 程度に依存を絞る)
- 終了コード規約(全スクリプト共通): `0` = 成功(差分なし/正常完了)、`1` = 検証上の不一致を検出、`2` = 実行エラー(認証失敗、path 未分類、設定不備等)。**「エラーで比較できなかった」と「比較して差分があった」を必ず区別する**
- すべての出力は JSON(機械可読)+ 人間可読サマリを stderr に出す
- 秘匿情報(API トークン)は環境変数(`IDP_API_TOKEN`)からのみ取得し、出力ファイル・ログに書かない
- CI では `make verify` として同一パイプラインを実行し、artifacts をビルド成果物として保全する

### S1. fetch_policy.py — API response 取得

| 項目 | 内容 |
|---|---|
| 目的 | ポリシー本体とルール一覧の API response を無加工で取得・保存する(L1 の入力、および証跡) |
| 入力 | `--policy-id`, `--base-url`(config から), 環境変数 `IDP_API_TOKEN` |
| 出力 | `{out}/policy.json`(本体)、`{out}/rules.json`(ルール配列)、`{out}/meta.json`(取得時刻 UTC、API バージョン、HTTP ヘッダの関連情報、リクエスト URL) |
| 終了コード | 0=取得成功 / 2=HTTP エラー・認証エラー |
| エラー時挙動 | レスポンスボディを含めて stderr に出力し、部分ファイルを残さない(アトミック書き込み) |
| 実行例 | `python scripts/fetch_policy.py --policy-id rst1abc... --out artifacts/$RUN_ID/raw/existing` |
| 備考 | 既存・新規は**可能な限り近接した時刻に、同一 API バージョンで**取得する。ページネーションがある rules API は全ページ取得する |

### S2. normalize.py — 正規化

| 項目 | 内容 |
|---|---|
| 目的 | §6 の除外と §7 の正規化を宣言的ルールに基づいて適用し、比較可能な canonical JSON を生成する |
| 入力 | raw JSON ディレクトリ、`normalize-rules.yaml`、`exclude-paths.yaml` |
| 出力 | canonical JSON(キーソート・整形済み)、`normalize_log.json`(除外ヒット一覧、削除した null キー、ソートした配列 path、適用した default 注入) |
| 終了コード | 0=正常 / 2=未分類の配列 path 検出、ルールファイル不正 |
| エラー時挙動 | 未分類配列 path を全件列挙して停止(§7.9) |
| 実行例 | `python scripts/normalize.py --in raw/existing --rules config/normalize-rules.yaml --exclude config/exclude-paths.yaml --out normalized/existing.json` |

疑似コード:

```python
def normalize(doc, rules, excludes, path="$"):
    doc = drop_excluded_paths(doc, excludes, hit_log)      # §6(ヒットを記録)
    doc = drop_null_keys(doc, rules.null_significant, log) # §7.2
    doc = apply_documented_defaults(doc, rules.defaults)   # §7.5(定義がある場合のみ)
    for arr_path in find_all_array_paths(doc):
        if arr_path in rules.unordered: stable_sort(arr_path)
        elif arr_path in rules.ordered: pass
        else: fail_unclassified(arr_path)                  # exit 2
    if is_rules_array(path): sort_by_priority(doc)         # §7.10
    return sort_keys_recursively(doc)
```

### S3. deep_diff.py — deep diff + 判定

| 項目 | 内容 |
|---|---|
| 目的 | canonical JSON 同士の完全比較。差分ゼロ判定の唯一の根拠を生成する |
| 入力 | `normalized/existing.json`, `normalized/new.json` |
| 出力 | `diff_result.json`: `{"identical": bool, "diffs": [{"path", "existing_value", "new_value", "kind"(changed/added/removed/order)}], "compared_key_count": n, "compared_paths_digest": "..."}` |
| 終了コード | 0=完全一致 / 1=差分あり / 2=入力不正 |
| エラー時挙動 | 片方のファイル欠落等は exit 2 |
| 実行例 | `python scripts/deep_diff.py normalized/existing.json normalized/new.json --out diff/diff_result.json` |
| 備考 | 型込み比較(§7.7)。`compared_key_count` と比較 path 一覧を出力し、「何を比較したか」をレビュー可能にする(§5 チェックリスト照合に使用) |

### S4. extract_state.py — state 抽出・比較(L3)

| 項目 | 内容 |
|---|---|
| 目的 | `tofu show -json` 出力から既存(import 側)と新規のリソース attributes を抽出し、TF 内部情報・許容差分を除いて比較する |
| 入力 | `state.json`、両リソースアドレス、`exclude-paths.yaml`(state 用セクション) |
| 出力 | `state_diff.json`(S3 と同形式) |
| 終了コード | 0/1/2(共通規約) |
| 備考 | 除外: `id`, `name`, timestamps, provider 内部属性。L1 と独立した第二のレンズとして結果をレポートに併記する |

### S5. schema_coverage.py — provider schema × API 突合(L2)

| 項目 | 内容 |
|---|---|
| 目的 | API response に存在するが provider schema に対応属性が見当たらないフィールド(カバレッジギャップ)を列挙する |
| 入力 | `tofu providers schema -json` の出力、raw API response、対象リソースタイプ名、`config/schema-mapping.yaml`(camelCase↔snake_case・ネスト対応の明示マッピング) |
| 出力 | `gap_report.json`: `{"unmapped_api_fields": [...], "mapped": n, "suspect": [...]}` |
| 終了コード | 0=ギャップなし / 1=ギャップあり(→リスク台帳へ) / 2=エラー |
| エラー時挙動 | マッピング判定が曖昧なフィールドは `suspect` に入れ、**存在しない扱い(=ギャップ側)に倒す** |
| 実行例 | `python scripts/schema_coverage.py --schema coverage/provider_schema.json --api-response raw/existing --resource-types okta_app_signon_policy,okta_app_signon_policy_rule --out coverage/gap_report.json` |
| 備考 | ギャップは即 fail ではなく「L1 で値一致は確認済みだが provider 管理外」としてリスク台帳(§13)に記録し、レポート必須記載とする |

### S6. check_audit_log.py — 変更凍結確認(L0)

| 項目 | 内容 |
|---|---|
| 目的 | 基準時刻以降、既存ポリシー(およびそのルール)に対する変更イベントがないことを System Log で確認する |
| 入力 | `--policy-id`, `--since`(凍結宣言時刻)、System Log API |
| 出力 | `audit.json`(該当イベント一覧。0 件が期待値) |
| 終了コード | 0=変更なし / 1=変更イベント検出(比較の前提崩れ→再取得からやり直し) / 2=エラー |
| 実行例 | `python scripts/check_audit_log.py --policy-id $EXISTING_ID --since 2026-07-01T00:00:00Z` |

### S7. build_report.py — 検証レポート生成

| 項目 | 内容 |
|---|---|
| 目的 | 各レイヤーの出力を §12 のテンプレートに沿った単一レポート(Markdown + 添付 JSON)に統合する |
| 入力 | `artifacts/{run_id}/` 一式、`tofu version` / provider version 情報 |
| 出力 | `report.md`、総合判定(全レイヤー pass かつ検証系テスト green のときのみ PASS) |
| 終了コード | 0=PASS / 1=いずれかのレイヤーが fail / 2=入力欠落 |

### S8(任意). 認証挙動テスト用スクリプト(L5)

| 項目 | 内容 |
|---|---|
| 目的 | 代表ルール数本について、テストユーザーでの認証時に要求される要素・結果が両ポリシーで一致することを確認する |
| 入力 | テストシナリオ定義(ユーザー、ネットワーク条件、期待結果)、検証用ダミーアプリ |
| 出力 | シナリオごとの pass/fail |
| 備考 | 実装は Playwright 等によるスモーク、または IdP の policy simulation API が利用可能ならそれを優先(Okta の Policy Simulation 相当機能が対象ポリシータイプで使えるか事前確認)。網羅を狙わず、主要ルールの ALLOW / DENY / MFA 要求の代表 3〜5 パスに限定する |

---

## 9. 検証ロジック自体の妥当性確認(テスト仕様)

目的: 「差分ゼロ」という結果が、検出器の欠陥によるものでないことを証明する。`tests/test_verifier.py` で fixture(実 response を匿名化した `base_policy.json` / `base_rules.json`)に mutation を適用し、S2→S3 パイプラインの判定を検証する。CI で毎回実行し、**このテストが green であることを最終 PASS の必要条件**とする(S7 が結果を取り込む)。

### テストケース一覧

| ID | ケース | 期待結果 |
|---|---|---|
| T01 | 完全一致(fixture をそのまま両側に) | PASS (exit 0) |
| T02 | policy name のみ変更 | PASS |
| T03 | policy id のみ変更 | PASS |
| T04 | rule id のみ変更 | PASS |
| T05 | created / lastUpdated のみ変更 | PASS |
| T06 | _links / href / self のみ変更 | PASS |
| T07 | app assignment(アプリ参照条件・割り当て)のみ変更 | PASS |
| T08 | 認証条件(例: network zone の include を 1 件変更) | FAIL (exit 1) |
| T09 | action の変更(例: access を ALLOW→DENY) | FAIL |
| T10 | MFA 設定の変更(例: factorMode / constraints の要素変更) | FAIL |
| T11 | session 設定の変更(例: maxSessionIdleMinutes) | FAIL |
| T12 | rule priority の値変更(順序は同じでも値が異なる) | FAIL |
| T13 | rule evaluation order の変更(2 ルールの priority 入替) | FAIL |
| T14 | rule 数の差(1 本削除) | FAIL |
| T15 | rule status の変更(ACTIVE→INACTIVE) | FAIL |
| T16 | 順序が意味を持たない配列の順序のみ入替(グループ ID リスト) | PASS |
| T17 | 順序が意味を持つ配列の順序入替 | FAIL |
| T18a | null キー vs キー欠落(§7.2 対象 path) | PASS |
| T18b | 空配列 vs キー欠落(§7.3 原則) | FAIL |
| T18c | null_significant_paths に登録した path の null vs 欠落 | FAIL |
| T19 | unknown field(fixture にない新フィールド)を片側に追加 | FAIL |
| T20 | 除外 path に登録していない項目の差分(§6 表以外の任意 path) | FAIL |
| T21 | 未分類の配列 path を含む入力 | ERROR (exit 2) |
| T22 | 除外定義が 1 件もヒットしない場合 | PASS + 警告出力 |
| T23 | **実環境ミューテーション**: TF コードから設定 1 項目(例: network 条件)を意図的に削除して apply → L1 diff | FAIL を実測(手順は §11 手順 12。実施記録をレポートに添付し、実施後に復元・再検証) |
| T24 | provider 管理外フィールドを模した API フィールドを fixture に追加 → S5 | gap_report に検出・報告される (exit 1) |

補足: T23 は fixture では代替できない end-to-end の検出能力確認であり、初回検証時に最低 1 回実施する。T24 は S5 用のテストで、schema-mapping にないフィールドが必ず報告されることを確認する。

---

## 10. 「100% 同一」と判定する条件

本検証における「100% 同一」は無限定の同一性ではなく、**以下の範囲・方法・残リスクを明示した上での限定付き宣言**である。

### 10.1 宣言の正確な形

> 「既存ポリシーと新規ポリシーは、比較基準時刻において IdP API が返す全設定フィールドのうち、明示された許容差分(§6)を除くすべてについて、正規化ルール(§7)適用後に完全一致した。この判定は差分注入テスト(§9)で検出能力が確認された検証系によるものであり、provider schema カバレッジ検証・plan 冪等性・state 比較でも矛盾は検出されなかった。アプリ割り当ては本比較の対象外である。」

### 10.2 PASS の必要条件(すべて必須)

| # | 条件 | 根拠となる成果物 |
|---|---|---|
| C1 | L0: 凍結期間中に既存ポリシーへの変更イベントがない | audit.json (S6 exit 0) |
| C2 | L1: deep diff が差分ゼロ(exit 0) | diff_result.json |
| C3 | 許容差分リスト(§6)が明示され、decision-log に理由が記録されている | exclude-paths.yaml, decision-log.md |
| C4 | §5 の必須比較項目が比較済み path 一覧に含まれている | diff_result.json の compared paths |
| C5 | L2: gap_report が空、または全ギャップがリスク台帳に評価付きで記録済み | gap_report.json, risk-register.md |
| C6 | L3: 両リソースの plan が No changes(exit 0 of `-detailed-exitcode`)かつ state 比較が一致 | plan_exitcode.txt, state_diff.json |
| C7 | L4: 検証ロジックのテスト(T01〜T24)が全件 green、T23 の実環境検出実績がある | verifier-test-result, T23 記録 |
| C8 | アプリ割り当てが対象外であることがレポートに明示されている | report.md |
| C9 | 残リスク(§13)がレポートに列挙され、それぞれ低減策が記載されている | report.md, risk-register.md |

### 10.3 何が保証され、何が保証されないか

- 保証されること: 比較時点の API 可視設定の同一性(許容差分を除く)。TF コードがその設定を provider 視点でも過不足なく表現していること。
- 保証されないこと(残リスクとして明示): API に現れない内部設定の同一性、実行時挙動の完全同一性(L5 で部分的に補強)、アプリ割り当てを含めた「適用結果」の同一性、比較後に加えられた手動変更。低減策は §13 参照。

---

## 11. 検証手順

前提: TF コード整備・apply 済み(P2〜P5)。

1. **凍結宣言**: 既存ポリシーへの手動変更を凍結し、凍結時刻を記録する。
2. **バージョン固定の記録**: `tofu version`、provider version(lock ファイル)、API バージョンを記録する。
3. **比較対象外項目の確定**: `exclude-paths.yaml` をレビューし、decision-log に承認を記録する(§6)。
4. **正規化ルールの確定**: `normalize-rules.yaml` の配列分類(§7.9)・null 規則(§7.2)をレビュー承認する。
5. **検証ロジックのテスト実行**: `pytest tests/test_verifier.py`(T01〜T22, T24)。green でなければ検証に進まない。
6. **L0 実行**: S6 で凍結違反がないことを確認する。
7. **L1 実行**: S1 で両ポリシーを近接時刻に取得 → S2 正規化 → S3 diff。
8. **差分の分類**(差分があった場合): 各差分 path を以下のいずれかに分類し、decision-log に記録する。
   - (a) 許容差分 → §6 の表に該当し除外漏れだった場合のみ。除外追加はレビュー必須
   - (b) TF コードの不足 → コード修正へ(手順 9)
   - (c) provider の表現不足 → gap_report と突合し、リスク台帳へ。TF 外の補完手段(API 直接設定 + ドリフト監視)を検討
   - (d) API default による差分 → 可能なら TF コードに明示値を書いて解消。不可能なら文書化された default に限り §7.5 の注入で吸収
   - (e) 正規化ルールの不足 → ルール修正(レビュー必須)+ 検証ロジックテストに再発防止ケース追加
   - (f) 本当に修正すべき設定差分 → コード修正へ
9. **修正**: (b)(d)(f) は TF コードを修正する。
10. **再 apply**: `tofu apply`。
11. **再検証**: 手順 6〜8 を差分ゼロになるまで反復する。修正履歴は都度記録する。
12. **実環境ミューテーション(T23、初回のみ必須)**: TF コードから設定 1 項目を意図的に落として apply → L1 が FAIL することを実測 → 復元して再 apply → L1 が PASS に戻ることを確認。一連の記録を保存する。
13. **L2 実行**: S5 でカバレッジギャップを確認し、検出分をリスク台帳に評価付きで記録する。
14. **L3 実行**: plan 冪等性(両リソース)+ state 比較。
15. **L5 実行(任意)**: 代表パスの挙動テスト。
16. **最終レポート生成**: S7 で §12 のレポートを生成し、§10.2 の C1〜C9 を満たすことを確認して PASS を宣言する。
17. **証跡保全**: `artifacts/{run_id}/` 一式をリポジトリまたは監査用ストレージに保全する。

---

## 12. 検証結果レポート仕様

S7 が生成する `report.md` のテンプレート:

```markdown
# 認証ポリシー同一性検証レポート

## 1. 検証サマリ
- 総合判定: PASS / FAIL
- 実行 ID / 比較日時 (UTC):
- 実施者 / レビュアー:

## 2. 比較対象
- 既存ポリシー: 名称 / ID / type
- 新規ポリシー: 名称 / ID / type
- 両者の意図的差分: ポリシー名のみ

## 3. 実行環境
- Terraform / OpenTofu version:
- provider name / version(lock hash):
- IdP API バージョン / base URL:
- 使用した検証方式: L0〜L5 のうち実施したもの
- 使用した情報源: API endpoints / state / provider schema / 監査ログ

## 4. 前提の成立確認 (L0)
- 凍結宣言時刻: / 凍結違反イベント: 0 件(audit.json)

## 5. 比較対象外項目一覧と理由
(exclude-paths.yaml の全項目 + 除外理由 + 実ヒット件数)

## 6. 適用した正規化ルール
(normalize_log.json の要約: null 削除件数、ソートした配列 path、default 注入の有無と根拠)

## 7. 比較結果 (L1)
- 比較したフィールド数: n / 差分: 0 件(または差分一覧)
- 差分があった場合: path / 既存値 / 新規値 / 分類 (a)〜(f) / 対応
- §5 必須項目の比較済み確認: チェックリスト結果

## 8. provider カバレッジ (L2)
- ギャップ検出: n 件 / 各項目の評価とリスク台帳リンク

## 9. IaC 整合 (L3)
- plan 冪等性: 既存側 No changes / 新規側 No changes
- state 比較: 一致

## 10. 検証系の妥当性 (L4)
- テスト T01〜T24: 全 green(結果リンク)
- 実環境ミューテーション T23: 実施日 / 検出確認済み / 復元確認済み

## 11. 挙動テスト (L5・任意)
- 実施シナリオと結果

## 12. 修正履歴
- 反復ごとの差分・分類・修正内容・コミットハッシュ

## 13. スコープ宣言
- アプリ割り当ては比較対象外である(適用範囲の同一性は本レポートの保証外)
- 「100% 同一」の正確な意味: §10.1 の宣言文をそのまま記載

## 14. 残リスクと低減策
(risk-register.md から転記)

## 添付
- raw response(既存/新規)、normalized JSON、diff_result.json、gap_report.json、
  state_diff.json、plan 出力、audit.json、管理画面スクリーンショット(任意)
```

---

## 13. 注意点・リスク(リスク台帳の初期項目)

| ID | リスク | 影響 | 低減策 |
|---|---|---|---|
| R1 | TF state に存在しない項目がある | state 比較(L3)の盲点 | L1(API 直比較)を主判定にする設計そのもので低減 |
| R2 | provider で表現できない設定項目がある | 今後の IaC 運用でその項目がドリフトしても TF が検知しない | L2 で存在を列挙 → 台帳化。該当項目は定期 API スナップショット比較で監視 |
| R3 | API には出るが provider で管理できない項目 | R2 と同様 | 同上。provider への issue 起票も検討 |
| R4 | 管理画面には表示されるが API では確認しづらい項目 | L1 の盲点 | 初回に管理画面の全設定タブとAPI response の項目対応を 1 回棚卸しし、対応不明項目を台帳化。A7 のスクリーンショットを証跡化 |
| R5 | API default と TF default の差異 | 「コードでは省略 → API では値あり」の差分・plan ノイズ | §7.5 方針(TF コードに明示値を書く方向を優先) |
| R6 | null / empty / omitted の差異 | 誤 PASS / 誤 FAIL | §7.2〜7.4 の宣言的ルール + T18 系テスト |
| R7 | rule priority の扱いミス | 評価順差分の見逃し | ソートは priority 正規化のみ + 値も比較(§7.10)+ T12/T13 |
| R8 | rule evaluation order の扱いミス | 同上 | 同上 |
| R9 | 順序差分の誤判定(意味のある順序をソートで消す) | 重大差分の見逃し | 配列 path 全数分類の強制(未分類は exit 2)+ T17/T21 |
| R10 | 除外項目の広げすぎ | 本来検出すべき差分の見逃し | 除外は最小限 + レビュー必須 + ヒット 0 件警告 + T20 |
| R11 | アプリ割り当てを対象外にすることによる誤解 | ポリシー本体の同一性 ≠ 実際の適用範囲の同一性 | レポート §13 で明示宣言。割り当て作業後の確認は別タスクとして定義 |
| R12 | provider version 変更による挙動差分 | 再現性喪失・plan ノイズ | lock ファイルで固定 + レポートに記録。更新時は本検証を再実行 |
| R13 | API version 変更による response 差分 | 誤 FAIL / 比較不能 | 取得時に API バージョンを記録。両側を必ず同一バージョン・近接時刻で取得 |
| R14 | 検証後に手動変更が入る | 「同一」宣言の陳腐化 | L0 の監査ログ確認を定期実行(または CI での定期 L1 再実行)+ 管理画面変更の運用禁止ルール |
| R15 | 設定値が同一でも実行時挙動が完全同一とは限らない | 理論上の残リスク | 同一テナント・同一評価エンジンである点で実質リスクは小。L5 の代表パステストで補強。保証範囲を §10.3 で正直に限定 |
| R16 | 取得タイミング差による過渡的不一致 | 誤 FAIL | 近接時刻取得 + FAIL 時は再取得して再現性を確認 |

---

## 14. 成果物一覧

| 成果物 | 実体 | 本書該当箇所 |
|---|---|---|
| 同一性担保アプローチ比較表 | §3.2 の表 | §3 |
| 推奨検証アーキテクチャ | 5 レイヤー構成図 + データフロー | §4 |
| 比較対象項目一覧 | §5 の表 + diff_result.json の compared paths | §5 |
| 比較対象外項目一覧 | exclude-paths.yaml + 理由 | §6 |
| 正規化ルール定義 | normalize-rules.yaml + known-defaults.yaml | §7 |
| 検証スクリプト | S1〜S7(+任意 S8) | §8 |
| 検証ロジックのテストコード | tests/test_verifier.py + fixtures + mutations | §9 |
| 検証手順書 | §11 の手順 | §11 |
| 検証結果レポート | report.md(テンプレート準拠) | §12 |
| 差分修正記録 | decision-log.md + レポート §12 修正履歴 | §11 手順 8〜11 |
| 残リスク一覧 | risk-register.md | §13 |

---

## 15. 最終的な成功条件(再掲)

§10.2 の C1〜C9 をすべて満たしたとき、本検証は PASS であり、以下の一文で説明できる状態が達成される。

> 「新規認証ポリシーは、明示された許容差分(ポリシー名・ID・タイムスタンプ・リンク・アプリ割り当て)を除き、IdP API が返す全設定フィールドにおいて既存認証ポリシーと完全一致することを、検出能力が実証済みの機械検証で確認した。provider が表現できない項目の有無も確認済みであり、残リスクは台帳に列挙し低減策を定義している。」
