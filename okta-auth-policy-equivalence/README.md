# Okta 認証ポリシー 等価性担保フレームワーク

既存（手動運用）の Okta authentication policy（app sign-on policy）を import し、
Terraform で「基本的に同じ」ポリシーを再作成した。
本ディレクトリは **「Terraform 版が既存ポリシーと限りなく同一の挙動である」ことを担保する仕組み**
を、テストコードと運用フローとして一から設計したものである。

実際の Okta テナント・プロバイダ設定はまだ無いため、ここにあるコードは
**動く骨格（skeleton）+ 核心ロジックの実装** として提供する。
API 呼び出し部だけ自テナント向けに差し替えれば、そのまま CI に組み込める構成にしている。

---

## 前提となる既知の差分（仕様）

Terraform 版は既存ポリシーと **次の2点だけ** が意図的に異なる。

1. **Catch-All Rule は Terraform 作成時に一律 Deny**
   （`okta_app_signon_policy` 作成時、Okta は既定 Catch-all を `DENY` で自動生成する。これをそのまま使う）

2. **既存ポリシーの Catch-All が Allow の場合のみ**、Terraform 版には
   **条件 ANY（完全無条件）のカスタム Catch-All ルール**（実体のあるルール）を末尾に追加し、
   その **action と認証要件を既存 Catch-All と完全一致** させる。
   システム既定 Catch-all は Deny のまま（フェイルセーフ）。

   > ⚠️ **Catch-All の ALLOW は「ANY ALLOW（誰でも素通し）」ではない**。
   > ALLOW は既定値ではなく、必ず認証要件（factorMode / constraints / 再認証間隔 …）という
   > **設定を伴う**。したがってカスタム Catch-All は「条件 ANY」かつ「旧と同一の認証要件」の
   > 両方を満たして初めて等価になる（要件を `access` だけに縮約してはいけない）。
   > これを INV-2 として自動強制する（`docs/02`）。

→ つまり「Deny 既定 + 〈条件 ANY ＋ 旧と同一の認証要件〉Allow カスタムルール」が
　「旧 Allow Catch-all」と挙動等価であることを証明・検証できれば、全体の等価性が言える。

---

## 担保の三層モデル

| 層 | 何を保証するか | 手法 | 網羅性 |
|----|----------------|------|--------|
| **L1 構造等価** | 設定（ルール列）がテキストレベルで一致 | 正規化 + 差分 0 検証 | 設定空間を **網羅** |
| **L2 挙動等価** | 実際の判定結果が一致 | Policy Simulation API × シナリオ行列 | 入力空間を **代表点でサンプリング** |
| **L3 Catch-all 証明** | L1/L2 の変換が挙動を保存する理由 | 形式的議論 + 前提条件の自動強制 | 論理的に **全域** |

- **L1 が主担保**。両ポリシーは同一ソースから派生しているため、構造一致は網羅的かつ最も安価。
- **L2 は L1 の盲点**（順序・条件の解釈、Catch-all 変換が本当に等価か）を実挙動で裏取りする。
- **L3 は人間の理解とレビューのため**の根拠を文書化し、自動チェックが守るべき不変条件（カスタム Catch-all が完全無条件であること）を明示する。

詳細は `docs/` を参照。

```
docs/01-equivalence-model.md   等価性の形式的定義と入力空間
docs/02-catch-all-proof.md     Catch-all 変換の等価性証明と前提条件（INV-1 / INV-2）
docs/03-operations-runbook.md  CI / 運用フロー（ドリフト検知・カットオーバー）
docs/04-check-items-and-guarantee-boundary.md
                               チェック項目一覧と「静的に担保／実適用しないと分からない」の境界
```

> **本番無影響で適用したい場合は `docs/04` を参照。**
> 「設定の同一性」は apply 前に L1 で網羅的に担保でき、「実評価の同一性」は
> 未割当ポリシーへの read-only Simulation で本番影響ゼロのまま裏取りできる。
> 本番に実際に触れるのは **アプリ割当の切替（カットオーバー）だけ** であることを明示している。

---

## ディレクトリ構成

```
okta-auth-policy-equivalence/
├── README.md                         ← 本ファイル
├── docs/                             ← 設計・証明・運用ドキュメント
├── lib/
│   ├── okta_client.py                Okta API ラッパ（取得 + シミュレーション）
│   ├── canonicalize.py               ルールの正規化（核心ロジック・実装済み）
│   ├── transform.py                  旧→新 期待変換 T（Catch-all 差分を表現）
│   ├── structural_diff.py            構造差分の検証（実装済み）
│   └── scenario_matrix.py            シナリオ行列の生成（実装済み）
├── tests/
│   ├── conftest.py                   フィクスチャ（golden 読込・クライアント）
│   ├── test_structural_equivalence.py   L1 テスト
│   └── test_behavioral_equivalence.py    L2 テスト
└── golden/
    ├── README.md                     golden snapshot の取り方・意味
    ├── policy_old.example.json       既存ポリシーの正規化スナップショット（例）
    └── policy_new.example.json       Terraform 版の正規化スナップショット（例）
```

---

## 使い方（概念フロー）

```bash
# 0) 一度だけ: import 時点の既存ポリシーを golden として凍結
python -m lib.okta_client snapshot --policy-id <OLD_POLICY_ID> > golden/policy_old.json

# 1) Terraform apply の前: plan から新ポリシー想定を取り出し L1 検証
#    （または apply 後に実ポリシーを取得して検証）
python -m lib.okta_client snapshot --policy-id <NEW_POLICY_ID> > golden/policy_new.json

# 2) L1: 構造等価（設定が変換 T の通りか）
pytest tests/test_structural_equivalence.py

# 3) L2: 挙動等価（Simulation API でシナリオ一致）
pytest tests/test_behavioral_equivalence.py
```

CI への組み込み・ドリフト検知・カットオーバー手順は `docs/03-operations-runbook.md`。
