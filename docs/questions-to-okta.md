# Okta XAA / ID-JAG 確認事項

> 作成日: 2026-03-30
> 問い合わせ先候補: xaa@okta.com / Okta Developer Community

---

## Q1. audience / resource パラメータを自由に設定できるようになる予定はあるか

### 背景

現在、Token Exchange の `audience` に指定できる値は
OIN カタログ登録済みアプリ（Todo0 等）の固定値（デフォルト: `http://localhost:5001`）に限られており、
変更するには Okta チームへのメール申請が必要（`xaa@okta.com` 宛）。

### 確認したいこと

- 将来的に、Admin Console 上で `audience` / `resource` を自由に設定できるようになる予定はあるか？
- あるとすれば、どのバージョン / 時期を目処にしているか？
- 申請なしで audience を変更する方法は現時点で存在するか？

---

## Q2. ID-JAG 発行に OIN カタログの専用アプリは将来的にも必須となるか

### 背景

現在、ID-JAG を発行するには以下の構成が必要:

1. OIN カタログから **Agent0**（Requesting App）をインストール
2. OIN カタログから **Todo0**（Resource App）をインストール
3. Agent0 の Managed Connections に Todo0 を追加
4. 両アプリにテストユーザーを割り当て

この構成は Managed Connections の設定が OIN 登録済みの XAA 対応アプリでのみ表示されることに起因している。

### 確認したいこと

- 汎用 OIDC アプリ（Custom App）でも Managed Connections を設定できるようになるロードマップはあるか？
- 将来的に、単一のアプリ（Login App 兼 Agent）だけで ID-JAG を発行できる構成は想定されているか？
- OIN カタログへの登録が引き続き必須となる理由（セキュリティ上の制約か、単なる Early Access の制限か）を教えてほしい

---

## Q3. 通常の OIDC アプリ単体では Token Exchange で ID-JAG を発行できないという理解は正しいか

### 背景

2026-03-30 時点での検証では、Login App（汎用 OIDC アプリ）の `OKTA_CLIENT_ID` / `OKTA_CLIENT_SECRET` を使って
Org 認可サーバー（`/oauth2/v1/token`）に Token Exchange リクエストを送ると
`unsupported_grant_type` または `invalid_grant` エラーが返ってくる。

### 確認したいこと

以下の理解は正しいか:

> **「2026-03-30 時点では、汎用 OIDC アプリ単体（OIN 非登録）で Token Exchange（grant_type: `urn:ietf:params:oauth:grant-type:token-exchange`）を実行して ID-JAG を取得することはできない。ID-JAG の発行には OIN カタログ登録済みの XAA 対応アプリ（Agent0 相当）が必須である。」**

- 上記の理解が正しければ、その技術的・設計上の理由を教えてほしい
- 誤りであれば、汎用アプリで ID-JAG を発行するための正しい手順を教えてほしい

---

## メモ

- 参考記事:
  - https://developer.okta.com/blog/2026/02/17/xaa-resource-app
  - https://developer.okta.com/blog/2025/09/03/cross-app-access
- 調査詳細: [`docs/xaa-investigation.md`](xaa-investigation.md)
