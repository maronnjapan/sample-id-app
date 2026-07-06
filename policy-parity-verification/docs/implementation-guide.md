# 認証ポリシー同一性検証(Policy Parity Verification)実装完全ガイド

- 対象コード: `policy-parity-verification/` 一式(コミット `c998ff5` 時点)
- 対象読者: 本検証の実装内容と「一致している」と判断できる根拠を、コードレベルまで完全に理解したい人
- 関連文書: 仕様書 `AGENTS.md`(本ガイドは仕様書の §番号を随時参照する)、`README.md`(操作手順)、`docs/risk-register.md`(残リスク台帳)、`docs/decision-log.md`(判断記録)

本ガイドは上から順に読むことで、(1) 何を作っているのか、(2) どういうアーキテクチャなのか、(3) 各コンポーネントが何をどう実装しているのか、(4) なぜ「既存ポリシーと IaC 作成ポリシーが一致している」と担保できるのか、をすべて理解できるように書かれている。

---

## 目次

1. [解決したい問題](#1-解決したい問題)
2. [検証アーキテクチャの全体像](#2-検証アーキテクチャの全体像)
3. [リポジトリ構成とコンポーネント一覧](#3-リポジトリ構成とコンポーネント一覧)
4. [検証パイプラインの実行フロー](#4-検証パイプラインの実行フロー)
5. [実装詳細: 共通基盤パッケージ](#5-実装詳細-共通基盤パッケージ)
6. [実装詳細: データ取得(fetch / audit / oktaclient)](#6-実装詳細-データ取得fetch--audit--oktaclient)
7. [実装詳細: 正規化(normalize)](#7-実装詳細-正規化normalize)
8. [実装詳細: 深層比較(diffcmp)](#8-実装詳細-深層比較diffcmp)
9. [実装詳細: state 比較(tfstate)](#9-実装詳細-state-比較tfstate)
10. [実装詳細: provider カバレッジ(coverage)](#10-実装詳細-provider-カバレッジcoverage)
11. [実装詳細: レポート生成(report)](#11-実装詳細-レポート生成report)
12. [設定ファイルの詳細](#12-設定ファイルの詳細)
13. [検証系の検証: ミューテーションテスト](#13-検証系の検証-ミューテーションテスト)
14. [「一致している」と判断できる根拠の全体像](#14-一致していると判断できる根拠の全体像)
15. [保証されないこと(残リスク)](#15-保証されないこと残リスク)
16. [付録: 終了コード規約・成果物一覧](#16-付録-終了コード規約成果物一覧)

---

## 1. 解決したい問題

### 1.1 背景

Okta 上に手動で作成された認証ポリシー(以下「既存ポリシー」)がある。これを Terraform / OpenTofu(以下「TF」)で IaC 化するため、次の流れで新しいポリシー(以下「新規ポリシー」)を作成した。

```
既存ポリシーを import
  → tofu plan -generate-config-out でコード生成
  → 生成コードを整形・調整
  → tofu apply で新規ポリシーを作成
```

このとき問題になるのが、**「apply でできた新規ポリシーは、本当に既存ポリシーと設定内容が同一なのか?」を誰がどう証明するのか**である。「管理画面で見比べたら同じに見えた」「TF で作成できたから大丈夫なはず」では、以下の見逃しリスクを排除できない。

- TF provider が表現できない設定項目が API 側にあり、コード生成時に落ちていた
- コード整形時に属性を 1 つ消してしまった
- API のデフォルト値挙動で、明示していない項目が既存と異なる値になっていた
- 比較スクリプト自体にバグがあり、差分を検出できていなかった(=「差分ゼロ」が無意味)

### 1.2 ゴール

仕様書(`AGENTS.md` §1)が定義するゴールは、新規ポリシーが**「名前や ID などの明示された許容差分を除き、設定内容として既存ポリシーと 100% 同一である」ことを、機械的・再現可能・説明可能な形で担保する**ことである。具体的には次の 4 条件を満たす。

1. 許容差分リストが明示され、それ以外に差分が存在しないことが機械的に確認されている
2. **その確認方法自体の妥当性**(差分を入れたら検出できること)がテストで証明されている
3. provider が表現できない設定項目の有無が明示的に確認され、残リスクとして文書化されている
4. 上記すべてが再現可能な手順とレポートとして残っている

条件 2 が本設計の肝である。差分検出器が壊れていれば「差分ゼロ」は何の証明にもならないため、**検証系そのものを検証する仕組み**(§13)を必須要素として組み込んでいる。

### 1.3 前提条件(仕様書 §2 より、実装に効いているもの)

| 前提 | 実装への影響 |
|---|---|
| P6: 新規ポリシーはポリシー名のみ意図的に異なる | `$.name` だけは除外リストに入れる(それ以外の名前系、例えばルール名は比較対象) |
| P7: アプリ割り当ては比較対象外(後から手動実施) | `conditions.app` / `conditions.clients` を除外。ただし「ポリシー本体の同一性 ≠ 適用範囲の同一性」としてレポートに明示 |
| P8: 既存・新規は同一 Okta テナント内に存在 | グループ ID・ネットワークゾーン ID などの**参照先 ID は値ごと比較する**(同一テナントなら一致するはずで、一致しなければ「別のグループを見ている」重大差分) |
| P9: 検証期間中は既存ポリシーを変更凍結 | 凍結が守られたことを System Log(監査ログ)で機械確認する(L0 レイヤー) |

---

## 2. 検証アーキテクチャの全体像

### 2.1 なぜ多層構成なのか

単一の確認方法にはそれぞれ盲点がある(仕様書 §3 で 11 アプローチを比較評価している)。例えば:

- **TF state 同士の比較**は、provider スキーマに存在しない API 項目を構造的に見られない(provider のレンズ越しの比較)。
- **plan の冪等性確認**(No changes)も同様に provider 管理外項目に沈黙する。
- **API response 同士の比較**は「IdP が実際に保持している値」を直接見られる最も信頼できる方法だが、比較ロジック自体のバグや、前提(変更凍結)の崩れには気づけない。

そこで、**盲点が直交する 5 つのレイヤー + 前提レイヤー**を重ねる構成を採る。

```
 L0  前提担保          : 監査ログで変更凍結を確認        → policyparity audit
 ------------------------------------------------------------
 L1  主検証            : API response 正規化 + deep diff  → fetch / normalize / diff
                          「IdP 上の実設定が一致」の直接証拠
 L2  カバレッジ検証    : provider schema × API response 突合 → coverage
                          「provider が表現できない項目」の洗い出し
 L3  IaC 整合検証      : plan 冪等性 + state 間比較        → tofu plan / policyparity state
                          「TF コードが両者を同一に表現」の証拠
 L4  検証系の検証      : fixture 差分注入 + 実環境差分注入 → go test ./...(T01〜T24)
                          「差分ゼロ判定が信頼できる」根拠
 L5  補強(任意)      : 代表パス実動作テスト / 画面証跡
```

役割分担のポイント:

- **合否判定(PASS/FAIL)の根拠は L1 のみ**。`policyparity diff` が差分 0 を返すことが「一致」の直接証拠である。
- L2 は値の一致は見ない。「API には存在するが provider では管理できない項目」を列挙し、**今後の IaC 運用でドリフト検知できない項目**をリスク台帳に載せるためのもの。値の一致自体は L1 が API の全フィールドを見るためカバーされる——これがこのアーキテクチャの要である。
- L3 は「provider という別レンズでも一致して見える」という補強証拠。L1 と独立に動くため、L1 側の見落としと L3 側の見落としが同時に起きる確率を下げる。
- L4 がなければ L1 の「差分ゼロ」は「検出器が壊れているだけ」と区別できない。**L4 green は最終 PASS の必要条件**。

### 2.2 データフロー

```
 [Okta API] --fetch--> raw/existing/{policy.json,rules.json,meta.json} --+
 [Okta API] --fetch--> raw/new/{policy.json,rules.json,meta.json} ------+--normalize--> normalized/*.json
                                                                        |                  |
                                                                        |               deep diff
                                                                        |                  v
                                                                        |          diff/diff_result.json   ← 主判定
 [tofu providers schema -json] -----------------------------------------+--coverage--> coverage/gap_report.json
 [tofu show -json] ------------------------------------------------------+--state-----> state/state_diff.json
 [tofu plan -detailed-exitcode] ------------------------------------------+--exitcode--> plan/plan_exitcode.txt
 [fixtures + mutations] ---------------------------------------------------+--go test--> verifier-test-result.txt
 [Okta System Log] --audit--> audit.json                                   |
                                                                           v
                                                              report.md(総合判定 PASS/FAIL)
```

### 2.3 設計を貫く 3 原則

実装のあらゆる箇所で以下の原則が徹底されている。読み進める際の指針にしてほしい。

1. **fail-closed(疑わしきは失敗側に倒す)**
   - 除外リストにない全フィールドが比較対象。未知のフィールド(スキーマ表に載っていないもの)も比較され、差分があれば FAIL(§7.13)。
   - 分類されていない配列 path に出会ったら、勝手にソートせず exit 2 で停止。
   - カバレッジ突合で判定が曖昧なフィールドは「ギャップあり」側に分類。
2. **判定は raw JSON に対してのみ行う**
   - Okta SDK の型付き構造体は、SDK が知らないフィールドを黙って落とす可能性がある。それは fail-closed 原則と両立しないため、**保存・比較対象は必ず API の raw response body**(リスク R17)。
3. **すべての判断を機械可読な証跡として残す**
   - 何を除外したか、何をソートしたか、何を比較したか(path 一覧と件数、その SHA-256 ダイジェスト)をログ・成果物ファイルに全件記録し、レビュー可能にする。

---

## 3. リポジトリ構成とコンポーネント一覧

```
policy-parity-verification/
├── README.md                       # セットアップと実行手順
├── Makefile                        # 一括実行パイプライン(make verify)
├── go.mod / go.sum                 # Go 1.24.5 / okta-sdk-golang v6.1.6 / yaml.v3 に固定
├── config/
│   ├── targets.example.yaml        # 対象ポリシー ID・TF アドレスの設定例
│   ├── exclude-paths.yaml          # 比較除外 path(理由必須)
│   ├── normalize-rules.yaml        # 正規化ルール(配列分類・null 規則ほか)
│   ├── known-defaults.yaml         # 文書化済み API default の注入定義(現状は空)
│   └── schema-mapping.yaml         # L2 用: API path ↔ provider 属性の明示マッピング
├── cmd/policyparity/main.go        # CLI エントリポイント(サブコマンド分岐のみ)
├── internal/
│   ├── jsonio/                     # JSON 読み書き共通(UseNumber・アトミック書き込み)
│   ├── jsonpath/                   # 制限付き JSONPath(再帰禁止・配列のみワイルドカード)
│   ├── rules/                      # YAML 設定ファイルのロードとバリデーション
│   ├── oktaclient/                 # Okta API クライアント(raw body 取得・429 リトライ・ページネーション)
│   ├── fetch/                      # S1: API response 取得(薄いラッパ)
│   ├── audit/                      # S6: 変更凍結確認(薄いラッパ)
│   ├── normalize/                  # S2: 正規化
│   ├── diffcmp/                    # S3: deep diff
│   ├── tfstate/                    # S4: state 抽出・比較
│   ├── coverage/                   # S5: provider schema × API 突合
│   ├── report/                     # S7: 最終レポート生成
│   └── verify/
│       ├── verifier_test.go        # L4: ミューテーションテスト(T01〜T22, T24)
│       └── testdata/
│           ├── fixtures/           # 匿名化した基準ポリシー/ルール JSON
│           └── mutations/          # 将来の YAML 定義ミューテーション置き場
├── artifacts/{run_id}/             # 実行ごとの成果物(git 管理外、証跡として保全)
└── docs/
    ├── risk-register.md            # 残リスク台帳 R1〜R18
    └── decision-log.md             # 除外・正規化の判断記録
```

サブコマンドと仕様書 §8 のスクリプト番号の対応:

| サブコマンド | 仕様 | レイヤー | 役割 |
|---|---|---|---|
| `fetch` | S1 | L1 入力 | policy.json / rules.json / meta.json を raw で取得・保存 |
| `normalize` | S2 | L1 | 除外・null 正規化・配列分類・priority ソートを適用し canonical JSON を生成 |
| `diff` | S3 | L1 | canonical JSON 同士を型込みで deep diff。**主判定** |
| `state` | S4 | L3 | `tofu show -json` から 2 リソースの values を抽出して比較 |
| `coverage` | S5 | L2 | API leaf path と provider schema を突合しギャップを列挙 |
| `audit` | S6 | L0 | 凍結時刻以降の System Log 変更イベントを確認 |
| `report` | S7 | 統合 | artifacts 一式を仕様書 §12 テンプレートの Markdown に統合し総合判定 |

---

## 4. 検証パイプラインの実行フロー

### 4.1 Makefile による一括実行

`make verify EXISTING_ID=... NEW_ID=... FREEZE_TIMESTAMP=... EXISTING_ADDR=... NEW_ADDR=...` が実行する内容(`Makefile:16-35`)を順に追う。ローカルと CI で同一コマンドとし、実行のたびに `RUN_ID`(UTC タイムスタンプ)のディレクトリへ成果物を分離保存する。

1. **必須変数チェック**: 5 変数のどれかが欠けていれば exit 2 で停止(比較エラーと区別するため)。
2. **成果物ディレクトリ作成**: `artifacts/$(RUN_ID)/{raw,normalized,diff,coverage,plan,state}`。
3. **L0** `policyparity audit`: 凍結時刻以降に既存ポリシーへの変更イベントがあれば exit 1 → make が停止。**前提が崩れていたらそもそも比較しない**。
4. **L1 取得** `policyparity fetch` ×2: 既存・新規を近接時刻で取得(Makefile 上で連続実行されるため自然に近接する)。
5. **L1 正規化** `policyparity normalize` ×2: 両者に**同一のルールファイル**を適用。ここが重要で、既存側と新規側で異なる正規化がかかることは構造上あり得ない。
6. **L1 比較** `policyparity diff`: 差分があれば exit 1 → make 停止。
7. **L2** `tofu providers schema -json` → `policyparity coverage`: ギャップ検出(exit 1)は**リスク台帳登録が必要な警告**であり検証続行するため、`set +e` で exit code をファイルに記録した上で「exit 2(実行エラー)でないこと」だけを確認して先へ進む。
8. **L3 plan** `tofu plan -detailed-exitcode`: exit code をファイル保存。0(No changes)でなければ make 停止。plan が No changes であることは「TF コードと実リソースが provider 視点で一致」の証拠。
9. **L3 state** `tofu show -json` → `policyparity state`: 既存(import 側)と新規のリソースを比較。差分があれば exit 1 → 停止。
10. **L4** `go test ./...`: ミューテーションテスト全件を実行し、出力を `verifier-test-result.txt` として成果物に保存。fail なら停止。
11. **統合** `policyparity report`: 上記すべての成果物を読み、総合判定付き `report.md` を生成。いずれかの成果物が欠落・失敗なら FAIL(exit 1)。

### 4.2 PASS の必要条件(仕様書 §10.2 C1〜C9)

最終的に PASS を宣言できるのは以下がすべて成立したときのみ。

| # | 条件 | 対応する成果物 / 実装 |
|---|---|---|
| C1 | L0: 凍結期間中に変更イベントがない | `audit.json`(audit が exit 0) |
| C2 | L1: deep diff が差分ゼロ | `diff_result.json` の `identical: true` |
| C3 | 許容差分リストが明示され理由が記録済み | `exclude-paths.yaml`(reason 必須をコードで強制)+ `decision-log.md` |
| C4 | 必須比較項目が比較済み path に含まれる | `diff_result.json` の `compared_paths` を `normalize-rules.yaml` の `required_compared_path_patterns` と照合(レビュー確認) |
| C5 | L2: ギャップが空、または全件リスク台帳に記録済み | `gap_report.json` + `risk-register.md` |
| C6 | L3: 両リソース plan No changes かつ state 比較一致 | `plan_exitcode.txt` = 0、`state_diff.json` の `identical: true` |
| C7 | L4: T01〜T24 全 green、T23 の実環境検出実績あり | `verifier-test-result.txt` + T23 記録 |
| C8 | アプリ割り当て対象外の明示 | `report.md` §13 スコープ宣言(report が自動出力) |
| C9 | 残リスクと低減策の列挙 | `risk-register.md` |

---

## 5. 実装詳細: 共通基盤パッケージ

判定の信頼性は土台となる JSON の扱いに依存するため、まず基盤 3 パッケージから説明する。

### 5.1 `internal/jsonio` — JSON 入出力の一元化

全パッケージが JSON の読み書きをここに集約している。設計上の要点は 3 つ。

**(1) 数値は必ず `json.Number` として読む。** `ReadJSON` / `Clone` は `decoder.UseNumber()` を必ず設定する(`jsonio.go:17,108`)。Go 標準のデフォルトでは JSON 数値が `float64` になり、大きな整数や小数で丸め誤差が生じて「値は同じなのに不一致」「値が違うのに一致」の両方が起こり得る。`json.Number` は元の 10 進表記文字列を保持するため、後述の diff で**表記そのままの厳密比較**ができる。

**(2) 書き込みはアトミック。** `WriteFileAtomic`(`jsonio.go:48-71`)は同一ディレクトリに一時ファイルを作って書き込み、`os.Rename` で置き換える。途中で失敗した場合に**壊れた中間ファイルが成果物として残らない**ことを保証する(仕様書 S1 のエラー時挙動「部分ファイルを残さない」に対応)。

**(3) ポリシー本体とルールを 1 ドキュメントに合成する。** `LoadPolicyInput`(`jsonio.go:73-100`)は、入力がディレクトリの場合 `policy.json`(オブジェクト)と `rules.json`(配列)を読み、`policy["rules"] = rules` として合成する。これにより正規化・比較・カバレッジのすべてが**「ポリシー本体+全ルール」を単一の JSON ツリー**として扱える。以降本ガイドで `$.rules[*]...` という path が頻出するのはこの合成構造上の path である。

### 5.2 `internal/jsonpath` — 意図的に制限した JSONPath

除外や配列分類の path 指定に使う JSONPath 実装。**汎用実装をあえて避け、表現力を制限している**ことが安全設計そのものになっている(`jsonpath.go:48-90`)。

- path は必ず `$` 始まり。トークンは「キー(`.key`)」「配列インデックス(`[0]`)」「配列ワイルドカード(`[*]`)」の 3 種のみ。
- **再帰下降 `..` は構文エラーとして拒否**する。`$..id` のような指定を許すと、意図しない広範囲(例: ルール配下のあらゆる `id` らしきフィールド)を一括除外してしまう事故が起こる(リスク R10「除外の広げすぎ」への構造的対策)。
- **キー名のワイルドカードは存在しない**。ワイルドカードは配列インデックス位置にのみ許可。つまり「除外したいフィールドはキー名まで完全に書き下す」ことを強制する。
- `Match`(`jsonpath.go:92-118`)はトークン列の**完全一致**(長さも一致)。前方一致でのマッチはしないため、`$.name` という除外定義が `$.rules[0].name` に波及することはない(親ノードごと削除する挙動は §7.1 参照)。
- `CanonicalizeArrays` は `$.rules[0].conditions...` のような実インデックス付き path を `$.rules[*].conditions...` に畳み込む。ログやギャップレポートで「配列の何番目か」に依存しない安定した path 表記を得るために使う。

### 5.3 `internal/rules` — 設定ファイルのロードと強制事項

YAML 設定 4 ファイルの型定義とローダ(`rules.go`)。重要なのは `LoadExclude` が呼ぶ `validatePathReasons`(`rules.go:105-115`): **除外 path の各エントリに `reason`(除外理由)が書かれていなければロード時点でエラー**にする。仕様書 §6 の「除外には理由を必須で付す」を、運用ルールではなくコードで強制している。

設定の型は次の通り(詳細な中身は §12 で解説):

- `ExcludeFile`: `paths`(L1 用除外)/ `state_paths`(L3 用追加除外)/ `coverage_ignore_paths`(L2 用無視)
- `NormalizeRules`: 配列分類 3 種・null/空値規則・大文字小文字規則・default 注入・必須比較 path パターン
- `SchemaMapping`: L2 用の明示マッピングと無視 path
- `DefaultValue`: default 注入 1 件(path・値・根拠 URL)

---

## 6. 実装詳細: データ取得(fetch / audit / oktaclient)

### 6.1 `internal/oktaclient` — raw JSON を取得する HTTP クライアント

`fetch` と `audit` の実体。Okta SDK(v6)は**設定読み込み(`okta.NewConfiguration()` による環境変数 `OKTA_CLIENT_ORGURL` / `OKTA_CLIENT_TOKEN` / `OKTA_CLIENT_AUTHORIZATIONMODE` や `~/.okta/okta.yaml` の解決)とバージョン表記にのみ**使い、HTTP リクエスト自体は素の `net/http` で行って**レスポンスボディを無加工のバイト列で受け取る**(`client.go:50-78,197-241`)。

なぜ SDK の型付き API を使わないのか: SDK のモデル構造体にデコードすると、**SDK が定義していないフィールドが黙って消える**。それは「unknown field も比較対象(fail-closed)」という本検証の根幹(§7.13、リスク R17)を無効化するため、判定に使うデータは必ず raw body 経由とする。これは仕様書 §8 共通仕様の「Okta SDK 利用方針(重要)」の実装である。

信頼性・安全性のための実装:

- **429 リトライ**(`client.go:216-230`): レート制限応答時は `Retry-After` ヘッダ秒数(なければ試行回数に応じた 1〜5 秒)待って再試行、最大 5 回。コンテキストキャンセルにも応答する。
- **ページネーション**(`getAllPages`, `client.go:181-195`): RFC 5988 の `Link: <...>; rel="next"` ヘッダを辿って全ページ取得。ルールが 1 ページに収まらない大規模ポリシーでも取得漏れしない。
- **秘匿情報の非漏洩**: エラーメッセージ中の URL はクエリ文字列を除去(`redactQuery`)、meta.json に保存するレスポンスヘッダから `Authorization` / `Cookie` / `Set-Cookie` を除外(`flattenHeader`)。トークンがログ・成果物に残らない。
- **認証モード**: `SSWS`(API トークン)と `Bearer`/`OAuth2`(スコープドトークン)の両対応(`authorizationHeader`)。

### 6.2 `fetch` サブコマンド(S1)の保存内容

`FetchPolicy`(`client.go:80-133`)は 1 ポリシーにつき以下を保存する。

| ファイル | 内容 | 加工の有無 |
|---|---|---|
| `policy.json` | `GET /api/v1/policies/{id}` のボディ | **無加工**(トリムと改行付与のみ) |
| `rules-pages/page-NNN.json` | `GET /api/v1/policies/{id}/rules` の各ページのボディ | **無加工**。ページ単位の原本証跡 |
| `rules.json` | 全ページのルールを連結した配列 | ページ結合のため再シリアライズ(`UseNumber` で数値表記は保持)。原本は rules-pages/ に残る |
| `meta.json` | 取得時刻(UTC)、org URL、SDK バージョン、エンドポイント、ページ数、レスポンスヘッダ(認証系除去済み) | 生成物 |

meta.json は「いつ・どの API から・どの条件で取得したか」の証跡であり、リスク R13(API バージョン変化)・R16(取得タイミング差)の事後検証を可能にする。

### 6.3 `audit` サブコマンド(S6 / L0)

`AuditPolicy`(`client.go:135-179`)は System Log API `GET /api/v1/logs` を `since=凍結時刻`・`filter=target.id eq "{policyID}"` で全ページ取得し、**該当イベントが 1 件でもあれば `changed: true`** として `audit.json` に全イベントを保存する。main 側(`main.go:113-116`)で `changed` なら exit 1。

- `--since` は RFC3339 であることをパース検証(不正なら exit 2 で「比較できなかった」扱い)。
- `target.id` フィルタはポリシー自体とそのルールへの変更イベントを対象にする。0 件が期待値で、1 件でもあれば**比較の前提(変更凍結 P9)が崩れている**ため、取得からやり直す運用となる。

---

## 7. 実装詳細: 正規化(normalize)

L1 の心臓部その 1。`normalize.Normalize`(`normalize.go:43-105`)は raw JSON(policy+rules 合成済み)に対して**宣言的ルールに基づく変換を決まった順序で適用**し、比較可能な canonical JSON と、適用内容の全記録(`Log`)を返す。

### 7.1 処理パイプライン(適用順)

```go
// normalize.go:43- の実処理順
1. jsonio.Clone           — 入力を deep copy(呼び出し元のデータを壊さない・数値は json.Number 維持)
2. dropExcluded           — 除外 path の削除(ヒット全件記録、未ヒット定義は警告)
3. dropNulls              — null 値キーの削除(null_significant_paths は残す)
4. removeEmptyArrays      — 指定 path のみ空配列キーを削除(現状の設定では 0 件)
5. removeEmptyStrings     — 指定 path のみ空文字キーを削除(現状の設定では 0 件)
6. normalizeCase          — 指定 path のみ小文字化(現状の設定では 0 件)
7. applyDefaults          — 文書化済み default の注入(現状の設定では 0 件)
8. sortAndClassifyArrays  — 全配列の分類チェック + priority ソート + 無順序配列ソート
```

各ステップの詳細:

**Step 2: 除外(`dropExcluded`, `normalize.go:124-154`)** — ツリーを再帰的に歩き、各キー/配列要素の実 path が除外パターンに完全一致したら**そのサブツリーごと削除**する。例えば `$._links` の除外は `_links` オブジェクト全体を落とす。同時に「どの定義が・どの実 path に・何件ヒットしたか」を `ExcludedPathHits` に記録し、**1 件もヒットしなかった除外定義は警告として `Warnings` に載せる**(`normalize.go:55-60`)。この「未使用除外の警告」は、API 仕様変更などで除外定義が空振りし始めたこと(定義の腐敗)を検知する仕掛けで、テスト T22 が動作を保証する。

**Step 3: null 正規化(`dropNulls`, `normalize.go:165-183`)** — 仕様書 §7.2 の「`"key": null` とキー欠落は同値」を、**null キーを削除する**ことで実現する(両側から消えるので、片方が null・片方が欠落でも一致する)。ただし `null_significant_paths` にマッチする path は削除しない。現設定では `$.rules[*].actions.appSignOn.verificationMethod.reauthenticateIn` が登録されており、「再認証間隔が null(=明示的な設定)」と「キー自体がない」を**区別する**。片側だけ削除すると added/removed 差分として FAIL になる(テスト T18c)。削除した path は全件 `DroppedNullPaths` に記録。

**Step 4-5: 空配列・空文字(`removeEmptyArrays` / `removeEmptyStrings`)** — 仕様書 §7.3/7.4 の原則は「空配列・空文字と欠落は**別物**」。したがってデフォルトでは何も削除せず、API 仕様上同義と文書化された path を `empty_array_equals_absent_paths` 等に列挙した場合のみ削除する。**現状どちらも空リスト**なので、`include: []`(誰も含めない)と `include` 欠落は差分として検出される(テスト T18b が FAIL になることを保証)。

**Step 6: 大文字小文字(`normalizeCase`)** — `case_insensitive_paths` にマッチする文字列値のみ小文字化。原則は case-sensitive 比較(§7.8)なので現状は空リスト。実装上、Go では interface 経由の文字列を直接書き換えられないため、親コンテナ(map / slice)側から子の文字列を差し替える 2 段構え(`normalizeCaseAtParent`)になっている。

**Step 7: default 注入(`applyDefaults`, `normalize.go:270-310`)** — 仕様書 §7.5 の例外処理。「既存は明示値・新規は省略」のような API の返し方の揺れが**実際に観測され、かつ公式文書で default 値が確認できた場合のみ**、その path に default 値を注入して比較を成立させる。実装は安全側に固い:

- path は**配列を含まない完全なオブジェクト path のみ**許可(`IsExactPath`)。ワイルドカード不可。
- **キーが存在しない場合のみ**値を入れる(既存の値は絶対に上書きしない)。
- 注入した path は `DefaultedPaths` に全件記録。
- 現状 `defaults` は normalize-rules / known-defaults とも空 = **未文書化 default の推測補完は一切していない**(decision-log に判断記録あり)。

**Step 8: 配列の分類とソート(`sortAndClassifyArrays`, `normalize.go:312-362`)** — 本パッケージで最も重要な fail-closed 機構。ツリー内の**すべての配列**について、その path が次の 3 分類のどれに登録されているかを判定する。

| 分類 | 挙動 | 例 |
|---|---|---|
| `priority_sort_array_paths` | 要素の `priority` 値の昇順で安定ソート | `$.rules`(ルール配列) |
| `unordered_array_paths` | 要素の canonical JSON 文字列表現で安定ソート | グループ ID の include、authenticators 等 |
| `ordered_array_paths` | **何もしない**(順序込みで比較される) | `constraints`(評価順が意味を持つ) |
| どれにも未登録 | **`UnclassifiedArrayPathError` で exit 2** | — |

未分類配列でエラー停止する理由: 新しい配列フィールドが API に現れたとき、それが「順序が意味を持つ配列」なら勝手にソートすると**本物の順序差分を消してしまう**(リスク R9)。逆にソートしないと無害な順序揺れで誤 FAIL する。どちらに転んでも危険なので、**人間がルールファイルで分類を宣言するまで処理を止める**。エラーは未分類 path を全件列挙して返すため、一度の実行で漏れをすべて把握できる(テスト T21)。

**priority ソートの意味(§7.10)**: ルール配列は「API が priority 順で返す」保証に依存せず、比較前に priority 昇順で並べて位置合わせする。ここで重要なのは、**ソートはあくまで位置合わせであり、priority の値自体は正規化後 JSON に残って比較される**こと。したがって「順序は同じだが priority 値がずれている」(T12)も「2 ルールの priority が入れ替わっている」(T13)も差分として検出される。`sortByPriority`(`normalize.go:364-394`)は priority がない要素を前に寄せ、同値時は canonical JSON 表現で安定的に決定するため、ソート結果は入力順に依存しない。

### 7.2 正規化ログ(`Log` 構造体)

正規化のすべての作用が `normalize_log.json` として出力される(出力先は `--log` 指定、省略時は `<out>.normalize_log.json`)。フィールドは: 除外ヒット一覧(定義・実 path・理由)/ 未使用除外定義 / 削除した null path / 削除した空配列・空文字 path / 小文字化 path / default 注入 path / priority ソートした配列 / 無順序ソートした配列 / 順序維持で観測した配列 / 警告。**「正規化が何をしたか」を後からすべて監査できる**ことが、除外・正規化の自傷(検出すべき差分を消してしまうこと)に対するレビュー手段になる。レポート(§11)はこのログの件数サマリを取り込む。

---

## 8. 実装詳細: 深層比較(diffcmp)

L1 の心臓部その 2。`diffcmp.Compare`(`diff.go:29-49`)は正規化済み JSON 2 つを再帰比較し、次を返す。

```json
{
  "identical": true/false,
  "diffs": [ {"path": "$.rules[0].status", "kind": "changed|added|removed", "existing_value": ..., "new_value": ...} ],
  "compared_key_count": 123,
  "compared_paths": ["$.type", "$.status", ...],
  "compared_paths_digest": "sha256..."
}
```

### 8.1 比較アルゴリズム(`compare`, `diff.go:51-106`)

- **オブジェクト**: 両側のキーの**和集合**を辞書順に走査する。片側にしかないキーは `added` / `removed` 差分。ここが unknown field の fail-closed を実現する箇所——**「知らないキーだから無視」という経路が構造的に存在しない**(テスト T19/T20)。
- **配列**: 長い方の長さまでインデックス位置で突き合わせる。長さ差は末尾要素の added/removed になる(ルール数の差 = T14 を検出)。順序が意味を持つ配列は正規化でソートされていないため、位置ズレはそのまま差分になる(T17)。
- **スカラー**: `scalarEqual`(`diff.go:108-118`)で比較。**まず `reflect.TypeOf` で型が一致しない限り不一致**(`"5"` ≠ `5`、`false` ≠ `null` ≠ 欠落。仕様書 §7.7 の型込み比較)。`json.Number` 同士は 10 進表記文字列で比較するため浮動小数点の丸めの影響を受けない。それ以外は `reflect.DeepEqual`。
- 型が違う場合(片側オブジェクト・片側配列など)はそのノードを丸ごと `changed` とする。

### 8.2 「何を比較したか」の証跡

差分の有無だけでなく、**比較が実際に見た leaf path の全リスト**を `compared_paths` として出力し、件数(`compared_key_count`)とソート済みリストの SHA-256(`compared_paths_digest`)を付ける。added/removed になったサブツリーも `markLeaves` で leaf まで展開して比較済み path に計上する。

この出力の役割は 2 つ:

1. **C4(必須項目の比較確認)の突合材料**。`normalize-rules.yaml` の `required_compared_path_patterns`(policy type / status / priority / rule priority / access / factorMode / session 設定など仕様書 §5 のチェックリスト)が `compared_paths` に実在することをレビューで確認できる。「差分ゼロだが、実はほとんど何も比較していなかった」という空振りを排除する。
2. **ダイジェストによる実行間比較**。比較対象集合が実行間で変わっていないこと(API 仕様変更や正規化ルール変更の影響)を 1 値で検知できる。

exit code は main 側で `identical` に基づき 0/1、入力欠落等は 2(`main.go:174-204`)。

---

## 9. 実装詳細: state 比較(tfstate)

L3 の片翼。`tfstate.CompareState`(`state.go:20-60`)は `tofu show -json` の出力から 2 つのリソースアドレス(import した既存側と apply した新規側)の `values` を取り出して比較する。

- **リソース探索**(`findResourceValues` / `findInModule`): `values.root_module.resources[]` から `address` 完全一致で探し、見つからなければ `child_modules` を再帰探索。モジュール内リソースにも対応。アドレスが見つからなければ exit 2(実行エラー)。
- **除外**: ハードコードされたデフォルト除外(`$.id`, `$.name`, `$.created`, `$.last_updated`, `$.lastUpdated`, `$._links`, `$.timeouts` — TF 内部属性や自己 ID・タイムスタンプ)に加え、`exclude-paths.yaml` の `state_paths` セクションを追加適用。除外した実 path は `removed_paths` として出力に記録。
- **比較本体は L1 と同じ `diffcmp.Compare` を再利用**。出力形式(`state_diff.json`)も diff_result と同形で、`identical` でなければ exit 1。

L3 のもう片翼である plan 冪等性は `policyparity` の外(Makefile)で `tofu plan -detailed-exitcode` により実施し、exit code(0 = No changes)をファイル保存する。state 比較 + plan 冪等性で「TF コードが両リソースを provider 視点で同一に表現している」証拠になる。これは L1 と情報源が異なる(state / provider Read 結果)ため、独立した第二のレンズとして機能する。

---

## 10. 実装詳細: provider カバレッジ(coverage)

L2。目的は値の比較ではなく、**「API response には存在するが provider スキーマでは表現できないフィールド」の存在検出**である。ここで検出された項目は「今は L1 で値一致を確認済みだが、今後 TF 管理できずドリフト検知もできない項目」としてリスク台帳に載せる。

`coverage.Check`(`coverage.go:41-106`)の処理:

1. **provider schema の平坦化**(`extractResourceSchemaPaths` / `walkBlock`): `tofu providers schema -json` の `provider_schemas.*.resource_schemas[resourceType].block` を再帰的に歩き、`attributes` と `block_types` を `a.b.c` 形式のドット連結 path 集合にする。対象リソースタイプ(`okta_app_signon_policy`, `okta_app_signon_policy_rule`)が見つからなければ exit 2。
2. **API 側の leaf path 列挙**(`leafPaths`): raw response(policy+rules 合成)の全 leaf を列挙し、配列インデックスを `[*]` に正規化して重複排除。空オブジェクト・空配列も leaf として数える。
3. **各 API path の判定**(優先順):
   - `coverage_ignore_paths`(exclude-paths.yaml)または `ignore_api_paths`(schema-mapping.yaml)にマッチ → `ignored_api_fields`(理由付きで記録。無言で捨てない)
   - **明示マッピング**(schema-mapping.yaml の `mappings`)に一致 → マッピング先属性が schema に実在すれば `mapped`。**実在しなければ `suspect`**(「マッピングは書いたが schema に該当なし」= 定義の腐敗を隠さない)
   - **ヒューリスティック**: API path を camelCase→snake_case 変換しドット連結した候補、およびルール配下なら `rules.` プレフィックスを外した候補(rule はポリシーとは別リソースなので root からの path になる)を生成し、schema に実在すれば `mapped`
   - どれにも該当しない → `unmapped_api_fields`(候補 path 付き)
4. **exit code**: `unmapped + suspect > 0` なら exit 1。**曖昧なもの(suspect)をギャップ側に数える**のが fail 側に倒す設計(仕様書 S5「マッピング判定が曖昧なフィールドは存在しない扱いに倒す」)。

ギャップ検出(exit 1)は L1 の FAIL とは意味が違う点に注意。値の不一致ではなく「provider の表現不足」の発見であり、パイプラインはこれで停止せず(Makefile で exit code を記録して続行)、**リスク台帳への評価付き記録(C5)を要求する**運用となる。テスト T24 が「schema にないフィールドは必ず報告される」ことを保証する。

---

## 11. 実装詳細: レポート生成(report)

`report.Build`(`report.go:23-169`)は `artifacts/{run_id}/` 一式を読み、仕様書 §12 テンプレートに沿った `report.md` を生成して総合判定を下す。

判定ロジック(何が Failure / Warning になるか):

| 検査対象 | 条件 | 扱い |
|---|---|---|
| `audit.json` | 欠落 | Failure |
| | `changed: true`(凍結違反イベントあり) | Failure |
| `diff/diff_result.json` | 欠落 | Failure |
| | `identical: false` | Failure |
| `coverage/gap_report.json` | 欠落 | Failure |
| | ギャップ(unmapped+suspect)> 0 | **Warning**(リスク台帳記録を要求) |
| `state/state_diff.json` | 欠落 / 差分あり | Failure |
| `plan/plan_exitcode.txt` | 欠落 / `0` 以外 | Failure |
| `verifier-test-result.txt` | 欠落 | Failure(内容は全文レポートに埋め込み) |

`OverallPass = len(Failures) == 0`。総合判定・失敗理由・警告はレポート末尾に列挙され、exit code も 0/1 で返る(`main.go:344-346`)。**成果物が「無い」ことも Failure になる**設計により、「L2 を実行し忘れたが PASS が出た」という抜けを防ぐ。

レポートには他に、比較対象ポリシーの name/id/type(raw/policy.json から抽出)、正規化ログの件数サマリ、L1 の比較フィールド数と `compared_paths_digest`、差分がある場合はその path/kind の表、スコープ宣言(アプリ割り当て対象外、「100% 同一」の限定付き定義)、L5 挙動テスト結果(任意、あれば埋め込み)が自動記載される。実行環境(TF/provider/SDK バージョン)の保全は運用側への指示として明記される。

---

## 12. 設定ファイルの詳細

判定の意味論はコードではなく設定ファイルに宣言されている。**「何を許容差分とし、何をどう正規化するか」の全量がこの 4 ファイルでレビューできる**ことが説明可能性の核になる。

### 12.1 `config/exclude-paths.yaml` — 何を比較しないか(L1)

`paths`(L1 用)は以下の 5 カテゴリ・17 定義のみ。すべて理由付き(理由なしはロードエラー)。

| 除外対象 | path | 理由 |
|---|---|---|
| ポリシー名 | `$.name` | 新規は意図的に名前を変えている(P6)。**ルール名 `$.rules[*].name` は除外していない**(変更していない想定のため比較対象) |
| 自己 ID | `$.id`, `$.rules[*].id` | システム採番であり同一になり得ない |
| タイムスタンプ | `$.created`, `$.lastUpdated`, `$.rules[*].created`, `$.rules[*].lastUpdated` | 作成・更新時刻は必然的に異なる |
| HATEOAS リンク | `$._links`, `$.rules[*]._links` | 自己 ID を含む URL メタデータであり設定値ではない |
| 作成主体メタ | `$.createdBy`, `$.lastUpdatedBy`(ポリシー・ルール両方) | 誰が作ったかの記録であり設定値ではない |
| アプリ参照 | `$.conditions.app`, `$.conditions.clients`(ポリシー・ルール両方) | P7 によりアプリ割り当ては対象外。**この除外が「適用範囲の同一性は保証外」というスコープ限定を生む**(レポートに明示) |

逆に言えば、**グループ ID・ユーザー ID・ネットワークゾーン ID・authenticator 名・priority 値・status・description を含む残りすべてが比較対象**である。参照先 ID を placeholder 化しないのは P8(同一テナント)による意図的な設計で、「別のグループを参照している」差分を確実に検出する。

`state_paths` は L3 用の追加除外(id/name/タイムスタンプ/_links)、`coverage_ignore_paths` は L2 でギャップ扱いしないメタデータ(id/タイムスタンプ/_links)。**レイヤーごとに除外を別定義**しているため、「L1 では比較するが L2 のギャップ評価では無視する」といった使い分けが明示的になる。

### 12.2 `config/normalize-rules.yaml` — どう正規化するか

- `priority_sort_array_paths`: `$.rules` のみ。ルール配列は priority で位置合わせ(値は比較対象に残る)。
- `ordered_array_paths`: `constraints`(認証制約の評価順)、`elCondition.conditions`、`chain.conditions` の 3 つ。**これらの順序差分は FAIL になる**。
- `unordered_array_paths`: グループ/ユーザーの include/exclude、network ゾーン、device platforms、identityProvider、authenticators、constraints 内の methods/required など 24 path。**集合として意味を持つ配列を明示列挙**している。ここに列挙されていない配列が現れたら exit 2 で停止する(§7.1 Step 8)。
- `null_significant_paths`: `reauthenticateIn` のみ。null が「明示的な設定」を意味するため欠落と区別する。
- `empty_array_equals_absent_paths` / `empty_string_equals_absent_paths` / `case_insensitive_paths` / `defaults`: **すべて空**。原則(空値と欠落は別物・case-sensitive・default 補完なし)をそのまま適用している。
- `required_compared_path_patterns`: policy type/status/description/priority、group 条件、rule priority/status/name、network 条件、access、factorMode、session 設定の 13 パターン。C4 の照合に使う「必ず比較されているべき項目」の宣言。

### 12.3 `config/schema-mapping.yaml` — L2 の突合補助

camelCase→snake_case のヒューリスティックで対応づかない項目のための明示マッピング(policy の type/description/priority/status、rule の name/priority/status)と、カバレッジ評価から理由付きで外すメタデータ(`createdBy` 等)。マッピングは「書けば通る」のではなく、**マッピング先が provider schema に実在しなければ suspect(ギャップ扱い)になる**(§10)。

### 12.4 `config/known-defaults.yaml` — default 注入(現状空)

`defaults: []`。未文書化 default の推測補完を禁止する方針(仕様書 §7.5)の現れで、「注入なし」という判断自体が decision-log に記録されている。将来注入が必要になった場合は、path・値・根拠 URL(`reason_url`)をここに書き、注入事実が normalize ログとレポートに残る。

### 12.5 `config/targets.example.yaml`

対象の org URL、凍結時刻、既存/新規のポリシー ID と TF リソースアドレス、対象リソースタイプの設定例。実運用ではこれを元に Makefile 変数へ渡す。

---

## 13. 検証系の検証: ミューテーションテスト

「差分ゼロ」という結果を信頼するには、**この検証パイプラインが差分を入れたら本当に FAIL になること**を証明しなければならない(仕様書 §9、A10)。`internal/verify/verifier_test.go` がそれを担う。

### 13.1 テストの構造

- **fixture**: `testdata/fixtures/base_policy.json` + `base_rules.json`。実際の Okta response を模した匿名化データで、ACCESS_POLICY 本体 + ルール 2 本(2FA 要求の ALLOW ルール、1FA の DENY ルール)。注目すべき仕込みが 2 つある:
  - `xProviderUnknownStable` — **SDK モデルに存在しない疑似フィールド**を常設(リスク R17 対策)。もし将来、取得経路が型付き構造体経由に退行してこのフィールドが落ちるようになれば、テストが検出できる。
  - 無順序配列が意図的に非ソート順(`["00gB", "00gA"]`、`["nzB", "nzA"]`)で入っており、正規化のソートが実際に機能していることが T01(完全一致)の成立自体で確認される。
- **実行形態**: table-driven テスト。各ケースは「fixture を existing とし、その deep copy を newer とし、mutate 関数で片側に差分を注入 → **本番と同一の設定ファイル**(`config/normalize-rules.yaml` / `config/exclude-paths.yaml` を相対 path でロード)で `normalize.Normalize` → `diffcmp.Compare`」を通し、期待判定(pass/fail/error)と突き合わせる。**テスト専用の緩いルールではなく本番ルールそのものを検証している**点が重要。

### 13.2 テストケース一覧と、それぞれが証明すること

**許容差分が正しく無視されること(誤 FAIL しない):**

| ID | 注入する差分 | 期待 | 証明内容 |
|---|---|---|---|
| T01 | なし(完全一致) | PASS | ベースライン。正規化がそれ自体で差分を作らない |
| T02 | policy name のみ変更 | PASS | P6 の許容差分が機能 |
| T03/T04 | policy id / rule id のみ変更 | PASS | システム採番 ID の除外が機能 |
| T05 | created/lastUpdated のみ変更 | PASS | タイムスタンプ除外が機能 |
| T06 | _links の href のみ変更 | PASS | HATEOAS リンク除外が機能 |
| T07 | アプリ参照条件のみ変更 | PASS | P7(アプリ割り当て対象外)が機能 |
| T16 | 無順序配列(グループ ID)の順序のみ入替 | PASS | 集合的配列のソート正規化が機能 |
| T18a | 片側にのみ `optionalNull: null` を追加 | PASS | null とキー欠落の同値化が機能 |
| T22 | 実在しない除外定義を追加 | PASS + **警告** | 未使用除外の腐敗検知が機能 |

**実質的な設定差分が確実に検出されること(誤 PASS しない):**

| ID | 注入する差分 | 期待 | 証明内容 |
|---|---|---|---|
| T08 | network zone の include を 1 件変更 | FAIL | 条件差分の検出。参照先 ID を値ごと比較している証明 |
| T09 | access を ALLOW→DENY | FAIL | アクション差分の検出 |
| T10 | factorMode を 2FA→1FA | FAIL | MFA 設定差分の検出 |
| T11 | maxSessionIdleMinutes を変更 | FAIL | セッション設定差分の検出(数値比較) |
| T12 | rule priority の値のみ変更(順序不変) | FAIL | priority ソートが**値の比較を消していない**証明(R7) |
| T13 | 2 ルールの priority を入替 | FAIL | 評価順変更の検出(R8) |
| T14 | ルールを 1 本削除 | FAIL | ルール数差分(配列長差)の検出 |
| T15 | rule status を ACTIVE→INACTIVE | FAIL | ステータス差分の検出 |
| T17 | 順序が意味を持つ配列(constraints)の順序入替 | FAIL | 順序保存配列がソートで破壊されていない証明(R9) |
| T18b | 空配列 vs キー欠落 | FAIL | 「空配列と欠落は別物」原則の証明(R6) |
| T18c | null 有意 path(reauthenticateIn)の null vs 欠落 | FAIL | null_significant_paths の機能証明 |
| T19 | 片側に未知フィールドを追加 | FAIL | **unknown field fail-closed の証明**(§7.13) |
| T20 | 除外にない任意 path(`xProviderUnknownStable.enabled`)の値変更 | FAIL | 「除外リスト外はすべて比較」の証明(R10) |

**異常系が「差分」と混同されないこと:**

| ID | 内容 | 期待 | 証明内容 |
|---|---|---|---|
| T21 | 未分類の配列 path を含む入力 | **ERROR**(`UnclassifiedArrayPathError`) | 未知配列で停止する fail-closed の証明。「エラーで比較できなかった」と「比較して差分ゼロ」の区別 |
| T24 | provider schema にない API フィールド → coverage | ギャップとして報告 | L2 の検出能力の証明(`TestCoverageDetectsProviderGapT24`) |

### 13.3 T23: 実環境ミューテーション(fixture では代替できない確認)

T01〜T22/T24 は fixture 上の確認であり、「TF コード → apply → API 反映 → 取得 → 検出」という**実環境の end-to-end 経路**は通っていない。そこで初回検証時に 1 回、TF コードから設定 1 項目(例: network 条件)を意図的に削除して apply し、L1 が FAIL することを実測 → 復元・再 apply して PASS に戻ることを確認する(仕様書 §11 手順 12)。これは自動実行されず、実施記録を `decision-log.md` と最終レポートに残す運用であり、**C7 の必要条件**になっている。

### 13.4 CI での位置づけ

`make verify` は `go test ./...` の出力を `verifier-test-result.txt` として成果物に保存し、report がその存在を PASS の必要条件として検査する。つまり**「検出能力の証明」が実行のたびに再取得され、最終レポートに紐づく**。

---

## 14. 「一致している」と判断できる根拠の全体像

ここまでの実装を踏まえ、「なぜこのツールが差分ゼロを返したら『一致している』と言い切れるのか」を根拠の連鎖として整理する。

### 14.1 根拠 1: 比較しているのは「実物」である

判定に使うデータは、TF コードでも state でもなく、**Okta API が実際に返した raw response body** である(§6)。TF・provider・state を経由しない「最終結果物」同士の比較なので、provider のバグ・state の欠落・コード生成の落ちの影響を**受けない**。SDK の型付き構造体を経由しないため、モデル定義にないフィールドが黙って落ちることもない(fixture の疑似フィールドで退行検知まで仕込み済み)。

### 14.2 根拠 2: 比較対象は「除外リスト以外の全部」であり、除外は最小・明示・監査可能

- 除外は 17 定義のみで、全件に理由必須(コードで強制)。すべて「設定値ではないメタデータ」または「意図された差分(名前・アプリ参照)」である(§12.1)。
- unknown field を無視する経路が構造的に存在しない: diff はキーの和集合を走査するので、除外されなかったフィールドは既知・未知を問わず必ず比較される(§8.1)。
- 除外の広げすぎ(自傷)への対策が三重にある: JSONPath の再帰・キーワイルドカード禁止(§5.2)、未ヒット除外定義の警告(T22)、除外追加時の decision-log 記録義務。
- 「何を比較したか」が `compared_paths`(全 leaf path 一覧 + 件数 + SHA-256)として残り、必須項目リスト(§12.2)との照合で「比較の空振り」を排除できる(C4)。

### 14.3 根拠 3: 正規化は「無害な揺れ」だけを吸収し、意味のある差分を消さない

- 吸収するのは「null とキー欠落の同値性」「集合的配列の順序」「ルール配列の位置合わせ」のみ。空配列/空文字と欠落の同値化・大文字小文字の同一視・default の推測補完は**行っていない**(設定がすべて空 = 原則通り)。
- priority ソートは位置合わせであり値は比較に残る → 評価順の差分は検出される(T12/T13)。
- 順序が意味を持つ配列はソートされない(T17)。未知の配列は分類されるまで exit 2 で停止する(T21)——「勝手なソートで順序差分を握りつぶす」ことが構造的に不可能。
- 正規化の全作用がログに記録され、両側に**同一ルール**が適用される。

### 14.4 根拠 4: 比較は厳密である

型込み比較(`"5"` ≠ `5`、`false` ≠ null ≠ 欠落)、`json.Number` による 10 進表記そのままの数値比較(浮動小数点の丸めなし)、case-sensitive。「なんとなく等しい」判定は存在しない(§8.1)。

### 14.5 根拠 5: 検出器自体の正しさがテストで証明されている

「差分ゼロ」と「検出器が壊れている」を区別できるのは、T01〜T22/T24 のミューテーションテストが**本番の設定ファイルそのもの**を使って「入れた差分は FAIL になり、許容差分は PASS になり、未知の構造はエラーで止まる」ことを毎実行時に確認しているから(§13)。さらに T23 で実環境の end-to-end 経路でも検出能力を 1 回以上実証する。

### 14.6 根拠 6: 比較の前提が成立していることも機械確認される

比較した 2 スナップショットが「凍結中の既存ポリシー」と「apply 直後の新規ポリシー」を正しく表していることを、L0(System Log 監査、イベント 0 件)と近接時刻取得(meta.json の取得時刻)で担保する。前提が崩れていれば exit 1 で比較に進まない(§6.3)。

### 14.7 根拠 7: 独立したレンズでも矛盾がない

- L3: import 側 state と新規側 state の比較が一致し、plan が両者に対して No changes(provider の見る世界でも同一)。
- L2: provider が表現できない API フィールドの有無が列挙され、あればリスク台帳で管理される(「見えていないものがある」ことすら明示化される)。

これらは L1 と情報源・経路が異なるため、L1 の見落としと同時に同じ穴に落ちる可能性が低い。

### 14.8 根拠 8: 判定は総合され、欠落も失敗になる

report が全レイヤーの成果物を検査し、**1 つでも欠落・失敗があれば FAIL**(§11)。「一部のレイヤーを実行し忘れた PASS」は出ない。最終宣言は仕様書 §10.1 の限定付き宣言文——「比較基準時刻において IdP API が返す全設定フィールドのうち、明示された許容差分を除くすべてについて、正規化ルール適用後に完全一致した。この判定は差分注入テストで検出能力が確認された検証系によるものであり、provider schema カバレッジ・plan 冪等性・state 比較でも矛盾は検出されなかった」——として、保証範囲を正確に述べる。

---

## 15. 保証されないこと(残リスク)

「100% 同一」は無限定の同一性ではない。以下は構造的に保証できず、`docs/risk-register.md`(R1〜R18)で低減策とともに管理される。

| 保証されないこと | 理由 | 低減策 |
|---|---|---|
| API response に現れない内部設定の同一性 | L1 は API が返すものしか見られない | 管理画面と API の項目対応を初回に棚卸し(R4)。スクリーンショット証跡(L5) |
| 実行時挙動の完全同一性 | 設定値が同じでも評価エンジン挙動までは比較していない | 同一テナント・同一エンジンのため実質リスク小(R15)。L5 の代表パステストで補強 |
| アプリ割り当てを含めた「適用結果」の同一性 | P7 により割り当ては対象外 | レポートのスコープ宣言で明示(R11)。割り当て後の確認は別タスク |
| 検証後に加えられた手動変更 | 比較はスナップショット時点のもの | L0 監査の定期実行・CI での定期 L1 再実行(R14) |
| provider 管理外項目の将来ドリフト | TF はその項目を見ていない | L2 のギャップ列挙 + 定期 API スナップショット比較(R2/R3) |

その他、取得タイミング差による過渡的不一致(R16 — FAIL 時は再取得して再現性確認)、provider/API/SDK バージョン変化(R12/R13/R18 — go.mod・lock・meta.json への記録で固定と追跡)も台帳管理されている。

---

## 16. 付録: 終了コード規約・成果物一覧

### 16.1 終了コード規約(全サブコマンド共通)

| code | 意味 |
|---|---|
| 0 | 成功(差分なし / 変更イベントなし / ギャップなし / 正常完了) |
| 1 | 検証上の不一致を検出(差分あり / 凍結違反 / ギャップあり / report FAIL) |
| 2 | 実行エラー(認証失敗・入力欠落・未分類配列 path・設定不備) |

**1 と 2 を厳密に分ける**のが規約の核心: 「比較して差分があった」(1)と「エラーで比較できなかった」(2)を混同すると、実行エラーが握りつぶされて誤 PASS/誤 FAIL の温床になる。未分類配列(exit 2)が FAIL(exit 1)ではないのはこのため。

### 16.2 実行 1 回で生成される成果物(`artifacts/{run_id}/`)

| ファイル | 生成元 | 役割 |
|---|---|---|
| `audit.json` | audit | L0 証跡(凍結違反イベント一覧、0 件が期待値) |
| `raw/{existing,new}/policy.json` | fetch | API raw response(無加工) |
| `raw/{existing,new}/rules-pages/page-NNN.json` | fetch | ルール API 各ページの原本 |
| `raw/{existing,new}/rules.json` | fetch | 全ページ結合済みルール配列 |
| `raw/{existing,new}/meta.json` | fetch | 取得時刻・SDK バージョン・エンドポイント・ヘッダ |
| `normalized/{existing,new}.json` | normalize | canonical JSON(キーソート済み) |
| `normalized/*.normalize_log.json` | normalize | 正規化の全作用記録(除外ヒット・null 削除・ソート・警告) |
| `diff/diff_result.json` | diff | **主判定**(identical / diffs / compared_paths / digest) |
| `coverage/provider_schema.json` | tofu | provider schema スナップショット |
| `coverage/gap_report.json` | coverage | L2 ギャップレポート(unmapped / suspect / mapped / ignored) |
| `coverage/coverage_exitcode.txt` | Makefile | L2 の exit code 記録 |
| `plan/plan.txt`, `plan/plan_exitcode.txt` | tofu | L3 plan 冪等性証跡 |
| `state/state.json`, `state/state_diff.json` | tofu / state | L3 state 比較証跡 |
| `verifier-test-result.txt` | go test | L4 証跡(T01〜T22, T24 の結果全文) |
| `report.md` | report | 最終レポート(総合判定・全レイヤーサマリ・スコープ宣言) |

この一式をリポジトリまたは監査用ストレージへ保全することで、後日第三者が「何を・いつ・どう比較し・なぜ PASS としたか」を完全に追跡できる。
