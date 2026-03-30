# Okta Cross App Access (XAA) を使った Token Exchange と ID-JAG 取得の検証

> 作成日: 2026-03-30
> ブランチ: `okta-toke-exchange`
> リポジトリ: [maronnjapan/sample-id-app](https://github.com/maronnjapan/sample-id-app)

---

## 目次

1. [はじめに](#1-はじめに)
   - 1.1 [この記事の目的](#11-この記事の目的)
   - 1.2 [検証の背景：なぜ XAA に注目したか](#12-検証の背景なぜ-xaa-に注目したか)
   - 1.3 [検証を通じてわかったこと（先に結論）](#13-検証を通じてわかったこと先に結論)

2. [Okta XAA (Cross App Access) とは](#2-okta-xaa-cross-app-access-とは)
   - 2.1 [XAA の概要とユースケース](#21-xaa-の概要とユースケース)
   - 2.2 [Token Exchange (RFC 8693) との関係](#22-token-exchange-rfc-8693-との関係)
   - 2.3 [ID-JAG (Identity Assertion JWT) とは何か](#23-id-jag-identity-assertion-jwt-とは何か)
   - 2.4 [Org 認可サーバーと Custom 認可サーバーの違い](#24-org-認可サーバーと-custom-認可サーバーの違い)

3. [Okta 管理画面の設定](#3-okta-管理画面の設定)
   - 3.1 [XAA (Early Access) 機能の有効化](#31-xaa-early-access-機能の有効化)
   - 3.2 [OIN アプリカタログから専用アプリを追加する理由](#32-oin-アプリカタログから専用アプリを追加する理由)
   - 3.3 [Agent0 と Todo0 のインストール手順](#33-agent0-と-todo0-のインストール手順)
   - 3.4 [Managed Connections の設定](#34-managed-connections-の設定)
   - 3.5 [ユーザーの両アプリへの割り当て](#35-ユーザーの両アプリへの割り当て)
   - 3.6 [手動作業が避けられない理由（Terraform 非対応）](#36-手動作業が避けられない理由terraform-非対応)

4. [検証アプリの設計と実装](#4-検証アプリの設計と実装)
   - 4.1 [アーキテクチャ概要：2 つのアプリ構成](#41-アーキテクチャ概要2-つのアプリ構成)
   - 4.2 [技術スタック](#42-技術スタック)
   - 4.3 [NextAuth.js による Okta OIDC 認証の設定](#43-nextauthjs-による-okta-oidc-認証の設定)
   - 4.4 [ID Token のセキュリティ設計：クライアントに生トークンを渡さない](#44-id-token-のセキュリティ設計クライアントに生トークンを渡さない)
   - 4.5 [Token Exchange API エンドポイントの実装](#45-token-exchange-api-エンドポイントの実装)
   - 4.6 [RFC 8693 準拠のリクエストボディ構築](#46-rfc-8693-準拠のリクエストボディ構築)
   - 4.7 [ID-JAG のデコードと画面表示](#47-id-jag-のデコードと画面表示)
   - 4.8 [エラーハンドリングとトラブルシューティングヒント](#48-エラーハンドリングとトラブルシューティングヒント)
   - 4.9 [ユニットテスト（Vitest / モックなし）](#49-ユニットテストvitest--モックなし)

5. [動作確認：ID-JAG の取得と中身の確認](#5-動作確認id-jag-の取得と中身の確認)
   - 5.1 [設定完了後の動作フロー](#51-設定完了後の動作フロー)
   - 5.2 [ID-JAG ペイロードに含まれるクレーム](#52-id-jag-ペイロードに含まれるクレーム)
   - 5.3 [audience クレームの実際の値](#53-audience-クレームの実際の値)
   - 5.4 [resource パラメータの挙動](#54-resource-パラメータの挙動)
   - 5.5 [Token Exchange レスポンス全体の構造](#55-token-exchange-レスポンス全体の構造)

6. [当初の目的とぶつかった制限](#6-当初の目的とぶつかった制限)
   - 6.1 [当初の目標：サードパーティ認可サーバーへの ID-JAG 渡し](#61-当初の目標サードパーティ認可サーバーへの-id-jag-渡し)
   - 6.2 [audience が固定値に縛られている問題](#62-audience-が固定値に縛られている問題)
   - 6.3 [Org 認可サーバー限定という根本的な制約](#63-org-認可サーバー限定という根本的な制約)
   - 6.4 [OIN カタログ専用アプリが必須な理由](#64-oin-カタログ専用アプリが必須な理由)
   - 6.5 [外部リソースサーバーへの拡張が現時点で難しい理由の整理](#65-外部リソースサーバーへの拡張が現時点で難しい理由の整理)

7. [XAA の現状と今後への期待](#7-xaa-の現状と今後への期待)
   - 7.1 [Early Access 段階の意味するところ](#71-early-access-段階の意味するところ)
   - 7.2 [現時点でできること・できないこと](#72-現時点でできることできないこと)
   - 7.3 [Okta への確認事項（未解決の疑問点）](#73-okta-への確認事項未解決の疑問点)

8. [まとめ：検証で得られた知見](#8-まとめ検証で得られた知見)

---

## 1. はじめに

### 1.1 この記事の目的

本記事では、Okta が提供する **Cross App Access (XAA)** という機能を使い、**Token Exchange (RFC 8693)** によって ID Token を **ID-JAG (Identity Assertion JWT)** に変換するデモアプリを実装・検証した結果をまとめる。

主な目的は「ID-JAG がどのようなトークンとして発行されるか、その中身（クレーム）を実際に確認すること」だった。実装して動かしてみた結果、ID-JAG の取得自体は成功したものの、当初想定していた「サードパーティのリソースサーバーへの拡張」という構想においていくつかの制限が明らかになった。

この記事は、同じく XAA や Token Exchange を検証しようとしている人が「どこまでできて、どこから先は現時点で難しいのか」を把握できるよう、具体的な実装とともに記録することを意図している。

### 1.2 検証の背景：なぜ XAA に注目したか

AI エージェントが複数のサービスを横断して動作するシステムを構築するとき、エージェントが「あるサービスの権限を持ちながら別のサービスにアクセスする」という問題が生じる。

OAuth 2.0 の標準的なアクセストークンはサービスごとに独立して発行されるため、複数サービスをまたぐ安全なアクセス委譲を実現するには何らかの仕組みが必要になる。Okta の XAA は、そのような **AI エージェントを想定したマルチアプリ間のアクセス委譲** を RFC 8693 (Token Exchange) を使って解決しようとする仕組みだ。

> Okta 公式記事: https://developer.okta.com/blog/2025/09/03/cross-app-access

### 1.3 検証を通じてわかったこと（先に結論）

| 確認したかったこと | 結果 |
|---|---|
| ID-JAG を実際に取得できるか | **できた** |
| ID-JAG に何のクレームが含まれるか | **確認できた**（aud, sub, iss など標準クレーム＋制約あり） |
| audience や resource を自由に設定できるか | **現時点では不可**（固定値 or Okta への申請が必要） |
| サードパーティの認可サーバーに ID-JAG を渡してアクセストークンを発行させられるか | **現時点では困難** |
| 汎用 OIDC アプリ単体で Token Exchange を実行できるか | **できない**（OIN カタログの専用アプリが必須） |

---

## 2. Okta XAA (Cross App Access) とは

### 2.1 XAA の概要とユースケース

Cross App Access (XAA) は、Okta が 2025 年から提供している認証・認可の拡張機能（2026-03-30 時点で **Early Access**）。複数アプリ間で安全にユーザーの身元を委譲するためのプロトコルで、AI エージェントが複数のサービスを呼び出す場面を主なユースケースとして設計されている。

典型的なシナリオは以下のようなものだ：

```
ユーザーが エージェントアプリ（Agent）にアクセス
  → エージェントが リソースアプリ（Todo API 等）を呼び出したい
  → ユーザーの代理として、リソースアプリに対してアクセス権を得る
```

従来のアーキテクチャでは、ユーザーがそれぞれのアプリに個別ログインするか、OAuth 2.0 の On-Behalf-Of フローを使う必要があった。XAA は Token Exchange (RFC 8693) を使ってこの仕組みをより宣言的に扱えるようにしている。

### 2.2 Token Exchange (RFC 8693) との関係

Token Exchange は、既存のトークンを別の種類のトークンに交換するための OAuth 2.0 拡張仕様（RFC 8693）。

```
POST /oauth2/v1/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<既存トークン>
subject_token_type=urn:ietf:params:oauth:token-type:id_token
requested_token_type=<欲しいトークン種別>
audience=<送り先>
```

XAA における Token Exchange では、**ユーザーが Agent アプリでログインして取得した ID Token** を subject_token として送り、**ID-JAG** という中間トークンを取得する。この ID-JAG を持つことで、Agent アプリはリソースアプリに対して「このユーザーの代理であること」を証明できる。

### 2.3 ID-JAG (Identity Assertion JWT) とは何か

**ID-JAG (Identity Assertion Authorization Grant)** は、Okta が RFC 8693 に独自拡張として定義した中間トークンの形式。

```
requested_token_type: urn:ietf:params:oauth:token-type:id-jag
```

ID-JAG の位置づけは次のとおり：

- **発行者**: Okta の Org 認可サーバー（`/oauth2/v1/token`）
- **使途**: リソースアプリの認可サーバーへのアクセストークン要求の入力
- **中身**: ユーザーの身元情報（`sub`, `aud`, `iss` などの標準 JWT クレーム）

つまり、ID-JAG は「Okta が発行した、あるユーザーの代理として行動してよいことを証明する JWT」として機能する。

> **注意**: ID-JAG は最終的なアクセストークンではない。あくまで中間的な身元証明であり、リソースアプリの認可サーバーがこれを検証してアクセストークンを発行する、という 2 段階の構造になっている。

### 2.4 Org 認可サーバーと Custom 認可サーバーの違い

Okta には 2 種類の認可サーバーがある：

| 種別 | エンドポイント | 特徴 |
|---|---|---|
| **Org 認可サーバー** | `/oauth2/v1/token` | Okta org 全体のシステムサーバー。XAA Token Exchange はここのみ使用可 |
| **Custom 認可サーバー** | `/oauth2/{id}/v1/token` | スコープ・クレーム等をカスタマイズ可能な汎用サーバー |

**Okta XAA の 2026-03-30 時点の実装では**、Token Exchange で ID-JAG を発行できるのは **Org 認可サーバーのみ** に限られている。Custom 認可サーバー（`/oauth2/default` 等）に対して同じリクエストを送ると `unsupported_grant_type` エラーが返ってくることを本検証で実際に確認した。

---

## 3. Okta 管理画面の設定

### 3.1 XAA (Early Access) 機能の有効化

XAA は Early Access 機能のため、デフォルトでは無効になっている。有効化の手順：

1. Okta Admin Console にログイン
2. **Settings > Features** に移動
3. **Early access features** セクションで **"Cross App Access"** を探して **Enable** にする
4. 管理画面をリフレッシュして反映を確認

> 表示されない場合は Okta サポートへの有効化依頼が必要なケースもある。

有効化後、アプリの管理画面に **"Manage Connections"** タブが表示されるようになる。このタブの存在が XAA の設定起点となる。

### 3.2 OIN アプリカタログから専用アプリを追加する理由

XAA の設定で最初に躓くポイントが「なぜ汎用 OIDC アプリではなく OIN カタログの専用アプリが必要なのか」という点だ。

理由は明確で、**"Manage Connections" タブは OIN 登録済みかつ XAA 対応のアプリにしか表示されない**。汎用の OIDC アプリや Custom App を作っても、このタブが出現しないため、Managed Connections の設定自体ができない。

Okta が提供しているサンプルアプリが OIN カタログに登録されており、検証目的ではこれを使う必要がある：

| アプリ名 | 役割 |
|---|---|
| **Agent0** - Cross App Access (XAA) Sample Requesting App | エージェント側アプリ（Token Exchange を実行する側） |
| **Todo0** - Cross App Access (XAA) Sample Resource App | リソース側アプリ（ID-JAG の audience 先） |

### 3.3 Agent0 と Todo0 のインストール手順

1. Okta Admin Console で **Applications > Browse App Catalog** を開く
2. 検索欄に "Agent0" と入力して **Agent0 - Cross App Access (XAA) Sample Requesting App** を選択
3. **Sign On** タブの **Authentication** で **Client Secret** を選択
4. Redirect URI に `http://localhost:3000/api/auth/callback/okta` を設定
5. インストール後、**Client ID** と **Client Secret** を控える（後で `.env` に設定する）
6. 同様に "Todo0" を検索してインストール

### 3.4 Managed Connections の設定

Agent0 が Todo0 にアクセスする権限を持つことを Okta に宣言する設定。

1. **Applications > Applications** で **Agent0** を開く
2. **Manage Connections** タブ（XAA 有効化後に出現）を選択
3. **"Apps providing consent"** セクションで **"Add resource apps"** → **Todo0** を選択
4. **Save**

この設定が完了することで、Agent0 からの Token Exchange リクエストが Okta に承認されるようになる。

> この Managed Connections の設定は、現時点で **Terraform（okta provider）がサポートしていない**。Terraform で自動化できないため、手動設定が必須となる。

### 3.5 ユーザーの両アプリへの割り当て

Token Exchange が成功するには、ログインするユーザーが **Agent0 と Todo0 の両方に割り当てられている**必要がある。どちらか一方のみに割り当てた状態では `invalid_grant` または `access_denied` エラーが返ってくる。

割り当て手順：
1. Agent0 のアプリ画面 → **Assignments** タブ → **Assign to People**
2. テストユーザーを追加
3. 同じユーザーを Todo0 にも割り当て

### 3.6 手動作業が避けられない理由（Terraform 非対応）

本検証で手動作業が必要だった設定をまとめておく：

| 設定 | 手動が必要な理由 |
|---|---|
| Cross App Access の有効化 | Early Access 機能。Terraform プロバイダ非対応 |
| Managed Connections の設定 | XAA 固有リソース。Terraform プロバイダ非対応 |
| OIN アプリの追加 | OIN アプリはカタログから手動インストールが必要 |
| ユーザーのアプリ割り当て | 本検証では Admin Console から手動で実施（Okta API 経由での割り当て自体は可能だが、XAA 固有の Managed Connections 設定は Terraform 非対応） |

---

## 4. 検証アプリの設計と実装

### 4.1 アーキテクチャ概要：2 つのアプリ構成

本検証アプリは Next.js で実装した単一の Web アプリだが、Okta 側では **2 つのアプリ** を使い分ける構成になっている。

```
[ ユーザー ]
     │
     ▼
[ Next.js App (localhost:3000) ]
     │                    │
     │                    ▼
     │        [ /api/token-exchange (POST) ]
     │                    │
     ▼                    ▼
[ Okta: Agent0 ]  →  [ Okta: Org 認可サーバー ]
  ログイン用           /oauth2/v1/token
  NextAuth プロバイダ   (Token Exchange エンドポイント)
                              │
                              ▼
                       [ ID-JAG 返却 ]
```

| Okta アプリ | 役割 | 認証方式 |
|---|---|---|
| Agent0 (`test-cwo-app`) | NextAuth の OIDC プロバイダ。ユーザーログインと Token Exchange の両方に使用 | client_secret_basic |
| Todo0 (`test-cwo-app-2`) | ID-JAG の `audience` 先（リソースアプリ） | — |

### 4.2 技術スタック

- **Next.js** (App Router) — フロントエンド・API ルート
- **NextAuth.js v5** — Okta OIDC 認証
- **TypeScript** — 型安全な実装
- **Tailwind CSS** — スタイリング
- **Vitest** — ユニットテスト（モックなし）

### 4.3 NextAuth.js による Okta OIDC 認証の設定

`src/auth.ts` では、NextAuth.js の Okta プロバイダを使って OIDC 認証を設定している。重要なのは **JWT コールバック** で ID Token をサーバー側の JWT に保持する処理だ。

```typescript
// src/auth.ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Okta({
      clientId: process.env.OKTA_CLIENT_ID || '',
      clientSecret: process.env.OKTA_CLIENT_SECRET || '',
      issuer: process.env.OKTA_DOMAIN || '',
      authorization: {
        params: { scope: 'openid profile email' },
      },
    }),
  ],
  callbacks: {
    jwt({ token, account }) {
      // Okta からの ID Token をサーバー側 JWT に保持
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      return token;
    },
    session({ session, token }) {
      // クライアントにはデコード済みペイロードのみ渡す（後述）
      if (token.idToken) {
        const payload = decodeJWTPayload(token.idToken as string);
        session.idTokenPayload = payload;
        session.idTokenPreview = (token.idToken as string).substring(0, 50) + '...';
      }
      return session;
    },
  },
});
```

### 4.4 ID Token のセキュリティ設計：クライアントに生トークンを渡さない

本アプリの重要な設計方針として、**生の ID Token をクライアント（ブラウザ）に公開しない** ようにしている。

その理由は以下のとおり：

1. ID Token はユーザーの身元情報を含む機密性の高いトークン
2. Token Exchange はサーバー側の API Route でのみ実行されるため、クライアントが ID Token を直接持つ必要がない
3. クライアントへの露出を最小化することで、XSS 等によるトークン漏洩リスクを低減できる

代わりに、クライアントには以下の情報のみを渡している：

- **`idTokenPayload`**: JWT のペイロード部分を Base64 デコードして表示用に渡したもの（**署名検証は行っていない**。あくまでブラウザでの内容確認用途）
- **`idTokenPreview`**: トークン文字列の先頭 50 文字 + "..."（見せても問題ない表示用）

生の ID Token は NextAuth が管理するサーバー側 JWT にのみ保持され、Token Exchange 実行時は `getToken()` でサーバー側から取り出す仕組みになっている。

### 4.5 Token Exchange API エンドポイントの実装

`src/app/api/token-exchange/route.ts` が Token Exchange の本体。処理フローは以下のとおり：

```
1. 環境変数チェック (OKTA_DOMAIN, OKTA_CLIENT_ID, OKTA_CLIENT_SECRET)
2. セッション確認 (未認証 → 401)
3. サーバー側 JWT から ID Token を取得
4. リクエストボディから audience と scope を取得（任意）
5. Org 認可サーバー (/oauth2/v1/token) への Token Exchange リクエスト
   - クライアント認証: client_secret_basic
   - grant_type: urn:ietf:params:oauth:grant-type:token-exchange
   - requested_token_type: urn:ietf:params:oauth:token-type:id-jag
6. 成功: ID-JAG を含むレスポンスを返却
   失敗: エラーコードに応じたヒントメッセージを返却
```

クライアント認証には RFC 6749 Section 2.3.1 に準拠した `client_secret_basic` を使用している：

```typescript
const credentials = Buffer.from(
  `${agentClientId}:${agentClientSecret}`
).toString('base64');

await fetch(tokenEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentials}`,
  },
  body: exchangeBody.toString(),
});
```

### 4.6 RFC 8693 準拠のリクエストボディ構築

`src/lib/token-utils.ts` の `buildTokenExchangeBody()` 関数が Token Exchange リクエストの URLSearchParams を生成する。

Okta 向けの特徴的な設定：

```typescript
// src/lib/token-utils.ts の実コード抜粋
const body = new URLSearchParams({
  // RFC 8693 標準の grant_type
  'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
  // 変換元トークン
  'subject_token': params.idToken,
  'subject_token_type': 'urn:ietf:params:oauth:token-type:id_token',
  // Okta 独自拡張: id-jag を要求（RFC 8693 標準の token-type には含まれない）
  'requested_token_type': 'urn:ietf:params:oauth:token-type:id-jag',
  // resource パラメータ: RFC 8693 では「対象リソース」を表す任意パラメータ
  // Okta XAA の実装では Issuer URL を指定することを本検証で確認したが、
  // この値が実際にどう解釈されるかは Okta の内部実装依存
  'resource': 'https://your-org.okta.com/oauth2/default',
});
```

`requested_token_type` の `urn:ietf:params:oauth:token-type:id-jag` は Okta の独自拡張であり、RFC 8693 の標準トークン種別には含まれない。

また `resource` パラメータは RFC 8693 では「要求先のリソース」を表す任意パラメータとして定義されているが、Okta XAA の実装でどのような値を渡すべきかは Okta のドキュメント参照が必要。本検証では Custom 認可サーバーの Issuer URL を指定したが、必ずしも Issuer URL と「対象リソース」が同一ではない。

### 4.7 ID-JAG のデコードと画面表示

`src/components/TokenExchangeClient.tsx` では Token Exchange の実行結果を表示する。

注目すべき点として、**Okta XAA の 2026-03-30 時点の実装では、Token Exchange レスポンスの `access_token` フィールドに ID-JAG が格納される**（RFC 8693 では `issued_token_type` での種別通知も定義されているが、Okta はこのフィールドを返さない）：

```typescript
// src/components/TokenExchangeClient.tsx の実コード抜粋
// Okta XAA では access_token フィールドに ID-JAG が入る（Okta 実装固有の挙動）
const idJagToken = tokenExchangeResult?.access_token as string | undefined;
const idJagPayload = idJagToken ? decodeJWTPayload(idJagToken) : null;
```

画面には以下を表示する：
- 元の ID Token のデコード済みペイロード（ログイン時に取得したもの）
- Token Exchange 後の ID-JAG のデコード済みペイロード
- 生レスポンス全体（`token_type`, `expires_in` 等も含む）

### 4.8 エラーハンドリングとトラブルシューティングヒント

Token Exchange は設定ミスがあると様々なエラーが返ってくる。ユーザーが問題を自己解決できるよう、エラーコードに応じたヒントを実装している。

以下の表は本検証で実際に観測したエラーと、その際の設定状態から推定した原因をまとめたものだ（「原因推定」は確定的な情報ではなく、設定変更によって解消した事実に基づく推定）：

| エラーコード (HTTP ステータス) | 検証時の状況 | 原因推定 | 対処 |
|---|---|---|---|
| `unsupported_grant_type` (400) | XAA 未有効化 or 汎用 OIDC アプリ使用時に観測 | Org AS が Token Exchange grant type を受け付けない | 管理画面で XAA 有効化 / OIN アプリに切り替え |
| `invalid_grant` (400) | Managed Connections 未設定 or ID Token 期限切れ時に観測 | grant が無効と判定された | Managed Connections 設定 or 再ログイン |
| `invalid_target` (400) | デフォルト以外の audience を指定した時に観測 | audience が Okta に認識されていない | `http://localhost:5001`（Todo0 デフォルト）を使用 |
| `invalid_scope` (400) | 未定義スコープを指定した時に観測 | リソースアプリで未許可のスコープ | リソースアプリのスコープ設定を確認 |
| `401 Unauthorized` | Client ID / Secret 誤り時に観測 | クライアント認証失敗 | OKTA_CLIENT_ID / SECRET を確認 |
| `403 Forbidden` | Managed Connections 設定前に観測 | アクセス権がない | Managed Connections の設定を確認 |

### 4.9 ユニットテスト（Vitest / モックなし）

`src/lib/token-utils.test.ts` に Vitest を使ったユニットテストを実装した。設計方針として**モックを使わず**、実際の実装コードを直接テストしている。

テスト内容：

```
decodeJWTPayload のテスト:
  ✓ 有効な JWT からペイロードをデコードできる
  ✓ scope クレームを含む JWT をデコードできる
  ✓ aud が配列の JWT をデコードできる
  ✓ 不正な形式のトークンで null を返す
  ✓ Base64 デコード不可能なペイロードで null を返す

buildTokenExchangeBody のテスト:
  ✓ 必須パラメータのみでリクエストボディを構築する
  ✓ audience を含むリクエストボディを構築する
  ✓ scope を含むリクエストボディを構築する
  ✓ 全パラメータを含むリクエストボディを構築する
```

---

## 5. 動作確認：ID-JAG の取得と中身の確認

### 5.1 設定完了後の動作フロー

設定が完了した状態での動作確認の手順：

1. `pnpm dev` でアプリ起動（`http://localhost:3000`）
2. 自動で `/token-exchange` にリダイレクト
3. "Okta でログイン" ボタンからログイン（Agent0 経由）
4. ログイン後、元の ID Token のデコード済みペイロードが画面に表示される
5. Token Exchange 設定欄に audience を入力（`http://localhost:5001`）
6. "Token Exchange 実行" ボタンをクリック
7. 成功すると ID-JAG のペイロードが表示される

### 5.2 ID-JAG ペイロードに含まれるクレーム

ID-JAG に含まれるクレームは標準的な JWT クレームを基本としている：

| クレーム | 内容 |
|---|---|
| `iss` | Okta の Org 認可サーバーの URL |
| `sub` | ユーザーの識別子（元の ID Token の sub と同一） |
| `aud` | Token Exchange 時に指定した audience（Todo0 のデフォルト: `http://localhost:5001`） |
| `iat` | 発行時刻 |
| `exp` | 有効期限 |
| `jti` | JWT の一意 ID |

元の ID Token と比較すると、**`aud` クレームが指定した audience 値に変化している**点が ID-JAG の特徴だ。これによりリソースアプリは「このトークンは自分宛てに発行された」と確認できる。

### 5.3 audience クレームの実際の値

本検証での audience に関する重要な発見：

**Todo0 のデフォルト audience は `http://localhost:5001` に固定されている。**

この値以外を audience パラメータに指定して Token Exchange を実行すると、`invalid_target` エラー（400）が返ってくる。

確認できた audience の受け入れパターン：

| 指定した値 | 結果 |
|---|---|
| `http://localhost:5001` (Todo0 デフォルト) | 成功 |
| Org AS の Issuer URL | エラー (`invalid_target`) |
| Custom AS の Issuer URL | エラー (`invalid_target`) |
| Todo0 の Client ID | 条件次第 |
| 任意の URL | エラー (`invalid_target`) |

### 5.4 resource パラメータの挙動

`buildTokenExchangeBody()` 内で `resource` パラメータにカスタム認可サーバーの Issuer URL を指定しているが、現状では Okta 側でこの値は実質的に固定的な扱いになっており、自由に変更して意味のある効果を得ることは難しかった。

`resource` パラメータは RFC 8693 で定義されたトークンの対象リソースを指定するパラメータだが、Okta XAA においては audience の制約の方が強く影響する。

### 5.5 Token Exchange レスポンス全体の構造

本検証で観測した成功時のレスポンス構造（レスポンス例）：

```json
{
  "access_token": "<ID-JAG の JWT 文字列>",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "openid profile email"
}
```

**注目点**: フィールド名は `access_token` だが、中身は ID-JAG である。RFC 8693 では交換後のトークン種別を `issued_token_type` フィールドで返すことが定義されているが、**本検証では Okta のレスポンスに `issued_token_type` フィールドは含まれていなかった**。つまり Okta XAA の実装は RFC 8693 の `issued_token_type` を返さない形になっている（2026-03-30 時点）。

`token_type` は `Bearer` で、有効期限 (`expires_in`) は比較的短い（300 秒 = 5 分）。これは中間トークンとしての性質を反映している。

---

## 6. 当初の目的とぶつかった制限

### 6.1 当初の目標：サードパーティ認可サーバーへの ID-JAG 渡し

本検証の当初の目標は、単に ID-JAG を取得するだけでなく、**取得した ID-JAG をサードパーティ（Okta ドメイン外）の認可サーバーに渡し、そこでアクセストークンを発行させる**という構成の実現可能性を確かめることだった。

想定していたフロー：

```
Okta ID Token
  → Token Exchange (Org AS)
  → ID-JAG 取得
  → 外部認可サーバーに ID-JAG を提示
  → 外部認可サーバーがアクセストークンを発行
  → 外部リソース API 呼び出し
```

この構成が実現できれば、Okta の IdP 機能と外部のリソースサーバーを組み合わせた柔軟なアーキテクチャが可能になる。

### 6.2 audience が固定値に縛られている問題

最初にぶつかった壁は **audience の固定**だ。

**Okta XAA の 2026-03-30 時点の実装では**、Token Exchange で使用できる audience は OIN カタログに登録済みのリソースアプリ（Todo0）の識別子に縛られている。Todo0 のデフォルト audience は `http://localhost:5001` に固定されており、別の値を使おうとすると `invalid_target` エラーになることを本検証で確認した。

audience の値を変更するには **Okta チームへのメール申請が必要**（`xaa@okta.com` 宛）で、自分で Admin Console から変更することはできない（2026-03-30 時点）。

つまり、**任意の URL を audience に設定して ID-JAG を発行させる**という使い方は、現時点では Okta への申請なしには不可能だ。

### 6.3 Org 認可サーバー限定という根本的な制約

次の壁は **Okta XAA の現時点実装では Token Exchange が Org 認可サーバーにのみ対応している**という制約。

```
# 使えるエンドポイント
https://your-org.okta.com/oauth2/v1/token   ← Org AS

# 使えないエンドポイント
https://your-org.okta.com/oauth2/default/v1/token  ← Custom AS（不可）
https://your-org.okta.com/oauth2/aus.../v1/token   ← Custom AS（不可）
```

Org 認可サーバーは Okta のシステムサーバーであり、スコープやクレームのカスタマイズが制限されている。外部リソース向けのカスタムスコープを定義するには Custom 認可サーバーが必要だが、ID-JAG の発行は Org AS 限定という制約により、両立が難しい。

### 6.4 OIN カタログ専用アプリが必須な理由

外部リソースサーバーへの拡張を試みる際に判明したもう一つの制約が、**OIN カタログの専用アプリが必須**という点だ。

汎用 OIDC アプリで Token Exchange を実行しようとすると `unsupported_grant_type` または `invalid_grant` が返ってくる。これは Managed Connections の設定が OIN 登録済みかつ XAA 対応のアプリにのみ許可されているためだ。

外部リソースサーバーに対応したカスタムアプリを作成しても、Managed Connections に登録できないため、Token Exchange 自体が実行できない状態になる。

### 6.5 外部リソースサーバーへの拡張が現時点で難しい理由の整理

以上の制約を整理すると、外部リソースサーバーへの拡張が困難な理由は以下の 3 つの制約が重なっているためだ：

| 制約 | 詳細 | 回避策 |
|---|---|---|
| audience の固定 | OIN アプリ（Todo0）の固定値のみ受け入れ | Okta への申請（`xaa@okta.com`）が必要 |
| Org AS 限定 | ID-JAG 発行は Org AS のみ。カスタムスコープ定義不可 | 現時点で回避策なし |
| OIN アプリ必須 | 汎用 Custom App では Managed Connections 設定不可 | 現時点で回避策なし |

これらの制約は XAA が **Early Access 段階**にあることと密接に関係している。Okta の OIN サンプルアプリ（Agent0 / Todo0）を使った既定の構成での動作検証という目的においては ID-JAG を取得でき、その中身を確認できた。しかし現時点では、その先の「外部サービスとの統合」を自前で行うための拡張余地が限られている状態だ。

---

## 7. XAA の現状と今後への期待

### 7.1 Early Access 段階の意味するところ

2026-03-30 時点で XAA は **Early Access** 状態にある。Early Access は GA（General Availability / 一般提供）前の段階であり、以下の特徴がある：

- API・設定項目が変更される可能性がある
- サポート範囲が限定的
- Terraform 等のプロバイダが未対応な設定がある
- audience 変更など一部の操作に Okta への申請が必要

裏を返せば、**現在確認した制約の多くは Early Access 段階の制限に起因している可能性がある**。GA リリースに向けて audience の柔軟な設定や Custom App 対応が追加される可能性は十分ある。

### 7.2 現時点でできること・できないこと

本検証で確認した現時点（2026-03-30）での能力範囲：

**できること:**

- ✅ Okta Org AS で ID-JAG を取得する
- ✅ ID-JAG のペイロード（クレーム）を確認する
- ✅ OIN カタログの Agent0 / Todo0 を使った動作検証
- ✅ NextAuth.js を使った Okta OIDC 認証の実装
- ✅ client_secret_basic による Token Exchange クライアント認証

**現時点では難しいこと:**

- ❌ audience を自由に設定して任意のリソースサーバー向け ID-JAG を発行する
- ❌ Okta ドメイン外のサードパーティ認可サーバーに ID-JAG を渡してアクセストークンを発行させる
- ❌ 汎用 Custom App のみで Token Exchange を実行する（OIN アプリが別途必要）
- ❌ Custom 認可サーバーを使った Token Exchange

### 7.3 Okta への確認事項（未解決の疑問点）

本検証を通じて、以下の点を Okta に確認したいと感じた（`xaa@okta.com` またはコミュニティフォーラムへの質問候補）：

1. **audience / resource を Admin Console で自由設定できるようになるロードマップはあるか**
2. **汎用 OIDC アプリ（Custom App）での Managed Connections サポートは予定されているか**
3. **通常の OIDC アプリ単体で Token Exchange を実行できないという現在の理解は正しいか**（技術的・設計上の理由は何か）

---

## 8. まとめ：検証で得られた知見

本検証で得られた主な知見を以下にまとめる。

**XAA を動かすための最小構成は思ったより明確だった**

ドキュメントの断片的な記述をつなぎ合わせて設定する必要があったが、一度「OIN カタログのアプリが必須」「Managed Connections タブが XAA 有効化後に出現する」「ユーザーを両アプリに割り当てる」という 3 点を把握してからは設定が整理できた。

**ID-JAG の実体は Bearer JWT であり、中身は標準的な JWT クレームだった**

Token Exchange のレスポンスの `access_token` フィールドに JWT として格納されており、`iss`, `sub`, `aud` などの標準クレームを持つ。`aud` が指定した audience 値になっている点がリソースアプリ側での検証の起点となる。

**現時点の制約は Early Access 段階に起因している部分が大きい**

audience の固定、Org AS 限定、OIN アプリ必須という 3 つの制約は、XAA が Early Access であることと関係している可能性が高い。GA に向けて仕様が整備されることで、外部リソースサーバーとの統合が容易になることが期待される。

**Okta の標準的なサンプル構成の範囲内では動作確認できた**

当初の目標だった「サードパーティへの拡張」は現時点では難しかったが、「ID-JAG がどのようなトークンとして発行されるか」「その中身を確認する」という目的は達成できた。XAA の設計意図と現在の機能範囲を理解する上で、有意義な検証になったと感じている。

---

> **リポジトリ**: https://github.com/maronnjapan/sample-id-app (ブランチ: `okta-toke-exchange`)
> **参考記事**:
> - https://developer.okta.com/blog/2025/09/03/cross-app-access
> - https://developer.okta.com/blog/2026/02/17/xaa-resource-app
