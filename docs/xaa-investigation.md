# XAA (Cross App Access) / ID-JAG 調査メモ

> 調査日: 2026-03-30
> 参照記事:
> - https://developer.okta.com/blog/2026/02/17/xaa-resource-app
> - https://developer.okta.com/blog/2025/09/03/cross-app-access

---

## 1. XAA とは

Cross App Access (XAA) は、AI エージェントを含む複数アプリ間でのセキュアなアクセス委譲を実現する Okta の新プロトコル（現在 Early Access）。
Token Exchange (RFC 8693) を使い、ID Token を **ID-JAG (Identity Assertion Authorization Grant)** に変換することで、別アプリの API を呼び出す権限を取得する。

---

## 2. 動作に必要な前提条件

### 2-1. Okta 管理画面の設定

| 設定項目 | 場所 | 内容 |
|---|---|---|
| XAA 機能の有効化 | Settings > Features > Early Access | "Cross App Access" をオンにする |
| Agent0 アプリの追加 | アプリカタログ (OIN) | `Agent0 - Cross App Access (XAA) Sample Requesting App` を追加 |
| リソースアプリの追加 | アプリカタログ (OIN) | `Todo0 - Cross App Access (XAA) Sample Resource App` を追加 |
| Managed Connections | Agent0 > Manage Connections タブ | "App granted consent" に Todo0 を追加 |

> **ポイント**: アプリカタログ（OIN）経由で追加した専用アプリを使う必要がある。
> 任意の Custom App を作っても Managed Connections が機能しない。

### 2-2. ユーザー割り当て要件

同一ユーザー（例: Bob Tables）が **Agent0 と Todo0 の両方** に割り当てられている必要がある。
どちらか一方に存在しない場合、Token Exchange は失敗する。

### 2-3. Redirect URI の登録

| アプリ | Redirect URI |
|---|---|
| Agent0 | `http://localhost:5000/openid/callback/customer1` |
| Todo0 | `http://localhost:5001/openid/callback/customer1` |

---

## 3. audience の制約（400エラーの根本原因）

### デフォルト値

**Todo0 のデフォルト audience は `http://localhost:5001` に固定されている。**
この値以外を audience に指定すると `invalid_target` (400) エラーになる。

### audience 変更方法

audience の値を変更するには **Okta チームへのメール申請が必要**。

```
宛先: xaa@okta.com
内容:
  - Okta ドメイン（例: https://your-org.okta.com）
  - 変更したい audience 値
  - Agent0 の Client ID
```

自分で管理画面から変更することはできない（2026-03-30 時点）。

---

## 4. Token Exchange の制約

### Org 認可サーバー限定

**ID-JAG の Token Exchange は Org 認可サーバー (`/oauth2/v1/token`) のみ使用可能。**
カスタム認可サーバー（`/oauth2/{authServerId}/v1/token`）は使用不可。

```
# 使用できる
https://your-org.okta.com/oauth2/v1/token

# 使用できない
https://your-org.okta.com/oauth2/default/v1/token
https://your-org.okta.com/oauth2/aus.../v1/token
```

### ID-JAG 検証フロー

リソースアプリ側での ID-JAG 検証は以下の 3 点：

1. `aud` クレームが自アプリの識別子と一致するか
2. Okta の JWKS 公開鍵で署名を検証
3. `sub` クレームでエンドユーザーを特定

---

## 5. 当初の目的と判明した制限

### 試みたこと

ID Token を ID-JAG に変換し、そのID-JAGを別ドメインの認可サーバー（Okta 外）に渡してアクセストークンを発行させる。

### なぜ困難か

| 制限 | 詳細 |
|---|---|
| audience が固定 | デフォルトは `http://localhost:5001` のみ。変更には Okta への申請が必要 |
| Org 認可サーバー限定 | ID-JAG の発行・検証は Okta の Org 認可サーバーに閉じている |
| リソースドメインの制約 | audience に指定できるのは Okta が認識しているアプリ（OIN カタログ登録済み）に限られる |

→ **外部（Okta ドメイン外）のリソースサーバーに ID-JAG を使ってアクセストークンを発行させる構成は、現時点では実現が難しい。**

---

## 6. 正しく動作させるための最小構成

```
[ ] 1. Okta管理画面で XAA (Early Access) を有効化
[ ] 2. OINカタログから Agent0 と Todo0 を追加
[ ] 3. Agent0 の Managed Connections に Todo0 を追加
[ ] 4. テストユーザーを Agent0・Todo0 の両方に割り当て
[ ] 5. .env に以下を設定:
        OKTA_AGENT0_CLIENT_ID=<Agent0のClient ID>  ← Login Appとは別
        OKTA_AGENT0_CLIENT_SECRET=<Agent0のClient Secret>
        OKTA_RESOURCE_AUDIENCE=http://localhost:5001  ← Todo0のデフォルト
[ ] 6. UIの audience 欄に http://localhost:5001 を入力して実行
```

---

## 7. 現在の .env の問題点

```env
# 現状（問題あり）
OKTA_CLIENT_ID=0oa11glo9gtGN6ulK698
OKTA_AGENT0_CLIENT_ID=0oa11glo9gtGN6ulK698  ← Login App と同じ値！

# 正しい構成
OKTA_CLIENT_ID=<Login App の Client ID>
OKTA_AGENT0_CLIENT_ID=<Agent0 (OINカタログ) の Client ID>  ← 別アプリ
```

`OKTA_AGENT0_CLIENT_ID` は OIN カタログから追加した **Agent0 専用アプリ** の Client ID を使う必要がある。
