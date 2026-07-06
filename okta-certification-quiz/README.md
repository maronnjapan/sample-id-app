# Okta Certification Quiz Bank

**Okta Certified Professional** と **Okta Certified Administrator** の合格を目的とした対策問題集です。全 **152 問**(選択問題 123 問+記述問題 29 問)を、後述の JSON 形式で収録しています。

## 情報源ポリシー

- すべての問題は **Okta 公式ドキュメント([help.okta.com](https://help.okta.com/en-us/content/index.htm))** を情報源とし、各問題の `sources` フィールドに根拠ドキュメントの URL を記載しています。
- SAML の概念、Okta Expression Language、API レート制限、System Log API など、**developer.okta.com が正典**となるトピックのみ developer.okta.com を併用しています(公式試験スタディガイド自体がこれらを参照資料に指定しています)。
- 試験範囲は、Okta Certification 公式サイトの各試験スタディガイド(2026年7月時点の Performance Exam 版)のブループリントに基づいています。

> **注意**: Okta のドキュメント・試験内容は更新されます。受験直前に [certification.okta.com の Study Guides](https://certification.okta.com/page/study-guides) と各問題の sources のリンク先で最新情報を確認してください。

## 試験の概要(2026年7月時点)

| 項目 | Okta Certified Professional | Okta Certified Administrator |
|---|---|---|
| 形式 | Performance Exam: 6 つの実技(hands-on)ユースケース | Performance Exam: Part I 選択問題+Part II 実技 4 ユースケース |
| 時間 | 150 分 | Part I / Part II で個別タイマー |
| 特記 | 試験中に Okta Help Center を参照可能。モバイルの Okta Verify が必要 | 有効な Professional 資格が前提 |
| 費用 | USD 250(再受験 USD 100) | USD 250(再受験 USD 100) |

実技中心の試験のため、本問題集は「知識の確認(選択問題)」と「操作・設計手順の言語化(記述問題)」の両面で構成しています。**記述問題の模範解答を自分の言葉で再現できるようになることが、実技ユースケース対策として最も効果的です。**

## ディレクトリ構成

```
okta-certification-quiz/
├── README.md               ← このファイル
├── index.json              ← 全ファイルのマスターインデックス(クイズアプリのエントリポイント)
├── schema/
│   └── question-schema.json ← 問題ファイルの JSON Schema (draft-07)
├── scripts/
│   └── validate.py          ← 検証スクリプト(標準ライブラリのみ)
├── professional/            ← Professional 対策(74 問)
│   ├── pro-mc-01-user-management.json          (16 問 / UC1 26%)
│   ├── pro-mc-02-application-setup.json        ( 7 問 / UC2 10%)
│   ├── pro-mc-03-attribute-mapping-offboarding.json (5 問 / UC3 8%)
│   ├── pro-mc-04-security-enforcement.json     (20 問 / UC4 38%)
│   ├── pro-mc-05-troubleshooting.json          ( 8 問 / UC5 12%)
│   ├── pro-mc-06-syslog-support.json           ( 4 問 / UC6 6%)
│   ├── pro-written-01.json                     ( 7 問)
│   └── pro-written-02.json                     ( 7 問)
└── administrator/           ← Administrator 対策(78 問)
    ├── adm-mc-01-ad-ldap-integration.json      (18 問 / Part I: AD 統合 47%)
    ├── adm-mc-02-profile-sourcing-lifecycle.json (14 問 / Part I: ソーシング 53%)
    ├── adm-mc-03-sso-app-integration.json      (10 問 / Part II: カスタムアプリ統合 30%)
    ├── adm-mc-04-security-policies.json        (12 問 / Part II: 振る舞い検知 30%・デバイス保証 20%)
    ├── adm-mc-05-monitoring-troubleshooting.json (5 問 / Part II: 監視 20%)
    ├── adm-mc-06-api-functions.json            ( 4 問 / API 機能)
    ├── adm-written-01.json                     ( 8 問)
    └── adm-written-02.json                     ( 7 問)
```

問題数の配分は公式ブループリントの出題比率(%)に概ね比例させています。

## JSON フォーマット

各ファイルは `meta`(ファイル情報)と `questions`(問題の配列)を持ちます。正確な仕様は [`schema/question-schema.json`](schema/question-schema.json) を参照してください。

### 選択問題(`single-choice` / `multiple-select`)

```jsonc
{
  "id": "OCP-MC-001",           // OCP=Professional, OCA=Administrator / MC=選択, WR=記述
  "type": "single-choice",      // multiple-select の場合は正解が 2 つ以上
  "domain": "user-management",
  "topic": "user-account-status",
  "difficulty": "basic",         // basic | intermediate | advanced
  "question": "問題文…",
  "choices": [ { "id": "A", "text": "…" }, … ],
  "correctAnswerIds": ["A"],
  "explanation": "正解の根拠と、誤答選択肢がなぜ誤りかの解説",
  "sources": [ { "title": "…", "url": "https://help.okta.com/…" } ],
  "tags": ["…"]
}
```

- 選択肢の並びをアプリ側でシャッフルしても、正解は `correctAnswerIds`(選択肢 `id` への参照)で判定できます。
- `explanation` は正解の根拠に加えて**誤答がなぜ誤りか**まで説明しているので、復習画面にそのまま表示できます。

### 記述問題(`written`)

```jsonc
{
  "id": "OCP-WR-001",
  "type": "written",
  "question": "説明を求める問題文(含めるべき論点を明示)",
  "modelAnswer": "満点相当の模範解答",
  "rubric": {
    "totalPoints": 10,          // criteria の points 合計と必ず一致
    "passingScore": 7,          // 合格ライン
    "criteria": [               // 採点基準(観点別)
      {
        "id": "C1",
        "description": "この基準で評価する内容",
        "points": 3,
        "mustInclude": ["満点に必要な要素"],
        "acceptableAlternatives": ["同義・言い換えとして認める表現"],
        "scoringGuide": "満点/部分点/0点の判定ルール"
      }
    ],
    "deductions": [ { "description": "重大な事実誤認…", "points": -2 } ],
    "gradingInstructions": "採点者向けの全体指示(判断に迷う場合の扱いを含む)",
    "commonMistakes": ["受験者がやりがちな誤答パターン"]
  }
}
```

### 記述問題の採点方法(人間・AI どちらの採点者でも共通)

1. `criteria` を上から順に**独立して**採点する。各基準の `mustInclude`(または `acceptableAlternatives` の言い換え)が解答に含まれるかを確認し、`scoringGuide` に従って点数を付ける。
2. 全基準の合計から `deductions`(該当する場合)を差し引く。**合計は 0 点未満にしない。**
3. 合計が `passingScore` 以上なら合格相当。
4. 判断に迷った場合は `gradingInstructions` の指示に従う。用語は日本語表記・英語表記のどちらでも可。
5. `commonMistakes` は誤答パターンの検出に使う(該当したら当該基準は満点にしない)。

## 検証

```bash
python3 scripts/validate.py
```

全ファイルについて、JSON の構文、必須フィールド、ID の一意性・形式、正解 ID と選択肢の整合、rubric の点数合計(`criteria` の合計 = `totalPoints`)、sources の URL ドメイン(Okta 公式のみ)などを検証します。

## クイズアプリでの利用ガイド

1. `index.json` を読み、証明書(`certifications[]`)→ファイル(`files[]`)の順にロードする。
2. `type` で出題 UI を分岐: `single-choice` はラジオボタン、`multiple-select` はチェックボックス(問題文に「◯つ選択」と明記済み)、`written` はテキストエリア。
3. 採点: 選択問題は `correctAnswerIds` との集合一致。記述問題は `rubric` を採点者(人間または LLM)に渡して観点別採点させる。
4. 復習: `explanation` / `modelAnswer` + `sources` のリンクを表示すると公式ドキュメントへ直接飛べる。
5. 出題比率: `meta.examWeight` を使うと本番の配点に比例した模試を組める。

## 学習の進め方(推奨)

1. **選択問題を全問**解き、`explanation` と `sources` のリンク先ドキュメントで理解を固める(試験中も Help Center は参照できるが、探せる速さが合否を分ける)。
2. **記述問題を書いて答え、rubric で自己採点**する。`passingScore` 未満の問題は sources を読み直す。
3. 可能なら **Okta の無料トライアル org / Developer org(Identity Engine)** で、記述問題の手順(ユーザー作成、グループルール、SAML アプリ、認証ポリシー、振る舞い検知、デバイス保証)を実際に操作して再現する。本番は実技中心。
4. 仕上げに公式の **Practice Exam**(無料の Standard 版が各試験にある)を受ける。

---
生成日: 2026-07-06 / 問題数: 152(選択 123・記述 29)/ 言語: 日本語(Okta 用語は英語表記を保持)
