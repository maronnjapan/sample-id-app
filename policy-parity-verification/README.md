# Policy Parity Verification

`AGENTS.md` の仕様に沿って、既存認証ポリシーと Terraform/OpenTofu で作成した新規認証ポリシーの差分有無を検証するためのツールと手順書です。

主判定は L1(API response の正規化 + deep diff) です。`policyparity diff` が差分 0 を返し、L0/L2/L3/L4 の補助証跡にも矛盾がない場合だけ PASS とします。

## セットアップ

```bash
cd policy-parity-verification
go test ./...
go build -o bin/policyparity ./cmd/policyparity
```

Okta へ接続する場合は、少なくとも以下を設定します。

```bash
export OKTA_CLIENT_ORGURL="https://example.okta.com"
export OKTA_CLIENT_TOKEN="..."
export OKTA_CLIENT_AUTHORIZATIONMODE="SSWS" # Bearer トークンを渡す場合は Bearer
```

## 最小実行例

```bash
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p artifacts/$RUN_ID/{raw,normalized,diff,coverage,plan,state}

bin/policyparity audit --policy-id "$EXISTING_ID" \
  --since "$FREEZE_TIMESTAMP" --out artifacts/$RUN_ID/audit.json

bin/policyparity fetch --policy-id "$EXISTING_ID" --out artifacts/$RUN_ID/raw/existing
bin/policyparity fetch --policy-id "$NEW_ID" --out artifacts/$RUN_ID/raw/new

bin/policyparity normalize --in artifacts/$RUN_ID/raw/existing \
  --rules config/normalize-rules.yaml --exclude config/exclude-paths.yaml \
  --defaults config/known-defaults.yaml --out artifacts/$RUN_ID/normalized/existing.json
bin/policyparity normalize --in artifacts/$RUN_ID/raw/new \
  --rules config/normalize-rules.yaml --exclude config/exclude-paths.yaml \
  --defaults config/known-defaults.yaml --out artifacts/$RUN_ID/normalized/new.json

bin/policyparity diff artifacts/$RUN_ID/normalized/existing.json \
  artifacts/$RUN_ID/normalized/new.json --out artifacts/$RUN_ID/diff/diff_result.json
```

## 一括実行

```bash
make verify \
  EXISTING_ID="$EXISTING_ID" \
  NEW_ID="$NEW_ID" \
  FREEZE_TIMESTAMP="$FREEZE_TIMESTAMP" \
  EXISTING_ADDR="$EXISTING_ADDR" \
  NEW_ADDR="$NEW_ADDR"
```

## サブコマンド

- `fetch`: `policy.json`、`rules.json`、`meta.json` を取得します。SDK 型へ再シリアライズせず raw response body を保存します。
- `audit`: 凍結時刻以降の System Log event を取得し、変更イベントがあれば exit 1 にします。
- `normalize`: 除外 path、null 正規化、配列分類、priority sort を適用します。未分類配列は exit 2 です。
- `diff`: 正規化済み JSON を型込みで deep diff します。差分ありは exit 1 です。
- `coverage`: API response の leaf path と provider schema を突合し、provider 管理外候補を列挙します。
- `state`: `tofu show -json` から 2 resource の `values` を抽出し、許容差分を除いて比較します。
- `report`: artifact を §12 テンプレートに沿って Markdown 化します。

## PASS 条件

`AGENTS.md` §10.2 の C1〜C9 を満たすことが必要です。特に、`diff_result.json` の `identical: true`、`go test ./...` の成功、`audit.json` の変更イベント 0 件、`state_diff.json` の差分 0 件を確認してください。

T23 の実環境ミューテーションは自動実行しません。初回検証時に、TF コードから network 条件など 1 項目を意図的に落として apply し、L1 が FAIL することと、復元後に PASS へ戻ることを `docs/decision-log.md` と最終 report に記録してください。
