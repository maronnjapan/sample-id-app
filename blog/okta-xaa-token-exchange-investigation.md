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

- Okta の **Cross App Access (XAA)** を構成する、**Token Exchange (RFC 8693)** で ID Token を **ID-JAG (Identity Assertion JWT)** に変換するデモアプリを実装・検証した
- 主目的は「ID-JAG がどのようなトークンとして発行されるか」「中身（クレーム）はどうなっているか」を実際に確認すること
- 加えて、中身を確認することでアクセストークンの発行はOkta以外の認可サーバーで行うことが可能かも確認したい
- 結果として ID-JAG の取得自体は成功したが、「サードパーティのリソースサーバーへの拡張」にはいくつかの制限が判明した
- XAA を検証しようとしている人が「どこまでできて、どこからが現時点で難しいか」を具体的な実装とともに把握できることを意図している

### 1.2 検証の背景：なぜ XAA に注目したか

- AI エージェントが複数サービスを横断して動作するシステムを構築する場面で、「あるサービスの権限を持ちながら別のサービスにアクセスする」問題が生じる
- OAuth 2.0 の標準アクセストークンはサービスごとに独立して発行されるため、複数サービスをまたぐアクセス委譲には別の仕組みが必要
- Okta の XAA は、**AI エージェントを想定したマルチアプリ間のアクセス委譲**を RFC 8693 (Token Exchange) とRFC 7523( JSON Web Token (JWT)Profile for OAuth 2.0 Client Authentication and Authorization Grants)をベースにして解決しようとする仕組み

> Okta 公式記事: https://developer.okta.com/blog/2025/09/03/cross-app-access
> https://oauth.net/cross-app-access/

### 1.3 検証を通じてわかったこと（先に結論）

| 確認したかったこと | 結果 |
|---|---|
| ID-JAG を実際に取得できるか | **できた** |
| ID-JAG に何のクレームが含まれるか | **確認できた**（aud, sub, iss など標準クレーム＋制約あり） |
| audience を自由に設定できるか | **現時点では不可**（固定値 or Okta への申請が必要） |
| resource を自由に設定できるか | **可能**（任意の値を指定でき、ID-JAG に反映される） |
| サードパーティの認可サーバーに ID-JAG を渡してアクセストークンを発行させられるか | **現時点で実用化するのは困難** |
| 汎用 OIDC アプリ単体で Token Exchange を実行できるか | **できない**（OIN カタログの専用アプリが必須） |

---

## 2. Okta XAA (Cross App Access) とは

### 2.1 XAA の概要とユースケース

- Cross App Access (XAA) は複数アプリ間でユーザーの代理としてサービスの権限を委譲するためのプロトコル（Okta が発起人であり、RFC 8693 Token Exchange と RFC 7523 をベースにしている）
- AI エージェントが複数サービスを呼び出す場面を主なユースケースとして設計されている
- 典型的なシナリオ：

```
ユーザーが エージェントアプリ（Agent）にアクセス
  → エージェントが リソースアプリ（Todo API 等）を呼び出したい
  → ユーザーの代理として、リソースアプリに対してアクセス権を得る
```

- 従来はサービスごとに都度権限を委譲するための手続きが必要だったところを、XAAによって管理者が一度接続を設定するだけで中央集権的に権限管理をしつつ、ユーザーの追加認証負担を下げた形で達成できるようになった。

### 2.2 Token Exchange (RFC 8693) との関係

- Token Exchange は既存のトークンを別の種類のトークンに交換するための OAuth 2.0 拡張仕様（RFC 8693）
- リクエスト構造：

```
POST /oauth2/v1/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<既存トークン>
subject_token_type=urn:ietf:params:oauth:token-type:id_token
requested_token_type=<欲しいトークン種別>
audience=<送り先>
```

- XAA における Token Exchange の流れ：
  - **入力**: ユーザーが Agent アプリでログインして取得した ID Token を `subject_token` として送信
  - **出力**: **ID-JAG** という中間トークンを取得
  - **効果**: Agent アプリはリソースアプリに対して「このユーザーの代理であること」を証明できる

### 2.3 ID-JAG (Identity Assertion JWT) とは何か

- **ID-JAG (Identity Assertion JWT Authorization Grant)** は RFC 8693 とは独立した IETF ドラフト（`draft-ietf-oauth-identity-assertion-authz-grant`）で定義されている OAuth 2.0 認可グラントの形式
- `requested_token_type`: `urn:ietf:params:oauth:token-type:id-jag`
- ID-JAG の位置づけ：
  - **発行者**: Okta の Org 認可サーバー（`/oauth2/v1/token`）
  - **使途**: リソースアプリの認可サーバーへのアクセストークン要求の入力
  - **中身**: ユーザーの身元情報（`sub`, `aud`, `iss` などの標準 JWT クレーム）
- つまり「Okta が発行した、あるユーザーの代理として行動してよいことを証明する JWT」として機能する

> **注意**: ID-JAG は最終的なアクセストークンではない。あくまで中間的な身元証明であり、リソースアプリの認可サーバーがこれを検証してアクセストークンを発行する 2 段階構造になっている。

### 2.4 Org 認可サーバーと Custom 認可サーバーの違い

- Okta には 2 種類の認可サーバーがある：

| 種別 | エンドポイント | 特徴 |
|---|---|---|
| **Org 認可サーバー** | `/oauth2/v1/token` | Okta org 全体のシステムサーバー。XAA Token Exchange はここのみ使用可 |
| **Custom 認可サーバー** | `/oauth2/{id}/v1/token` | スコープ・クレーム等をカスタマイズ可能な汎用サーバー |

- **2026-03-30 時点の制約**: XAA による ID-JAG 発行は **Org 認可サーバーを使う OIN カタログ専用アプリ経由でのみ可能**（少なくとも Free Org の場合、汎用 OIDC アプリや Custom 認可サーバーからは利用できない）
- Custom 認可サーバー（`/oauth2/default` 等）に同じリクエストを送ると `unsupported_grant_type` エラーが返ることが公式ドキュメント上示唆されている

---

## 3. Okta 管理画面の設定

### 3.1 XAA (Early Access) 機能の有効化

- XAA は Early Access 機能のため、デフォルトでは無効
- 有効化手順：
  1. Okta Admin Console にログイン
  2. **Settings > Features** に移動
  3. **Early access features** セクションで **"Cross App Access"** を探して **Enable**
  4. 管理画面をリフレッシュして反映を確認
- 表示されない場合は Okta サポートへの有効化依頼が必要なケースもある
- 有効化後、アプリの管理画面に **"Manage Connections"** タブが表示されるようになる

### 3.2 OIN アプリカタログから専用アプリを追加する理由

- **"Manage Connections" タブは OIN 登録済みかつ XAA 対応のアプリにしか表示されない**
- 汎用の OIDC アプリや Custom App を作っても、このタブが出現しない
- Managed Connections の設定自体ができないため、XAAの文脈でのToken Exchange が実行不可能になる
- Okta が提供するサンプルアプリ（OIN カタログ登録済み）を使う必要がある：

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

- Agent0 が Todo0 にアクセスする権限を持つことを Okta に宣言する設定
- 手順：
  1. **Applications > Applications** で **Agent0** を開く
  2. **Manage Connections** タブ（XAA 有効化後に出現）を選択
  3. **"Apps providing consent"** セクションで **"Add resource apps"** → **Todo0** を選択
  4. **Save**
- この設定が完了することで、Agent0 からの Token Exchange リクエストが Okta に承認されるようになる
- **Terraform（okta provider）は未対応** のため手動設定が必須

### 3.5 ユーザーの両アプリへの割り当て

- Token Exchange が成功するには、ログインユーザーが **Agent0 と Todo0 の両方に割り当てられている**必要がある
- どちらか一方のみはエラーになる。
- 割り当て手順：
  1. Agent0 のアプリ画面 → **Assignments** タブ → **Assign to People**
  2. テストユーザーを追加
  3. 同じユーザーを Todo0 にも割り当て

### 3.6 手動作業が避けられない理由（Terraform 非対応）

| 設定 | 手動が必要な理由 |
|---|---|
| Cross App Access の有効化 | Early Access 機能。Terraform プロバイダ非対応 |
| Managed Connections の設定 | XAA 固有リソース。Terraform プロバイダ非対応 |
| OIN アプリの追加 | OIN アプリはカタログから手動インストールが必要 |
| ユーザーのアプリ割り当て | Okta API 経由での割り当て自体は可能だが、XAA 固有の Managed Connections 設定は Terraform 非対応 |

---

## 4. 検証アプリの設計と実装

### 4.1 アーキテクチャ概要：2 つのアプリ構成

- Next.js で実装した単一の Web アプリ
- Okta 側では **2 つのアプリ** を使い分ける構成

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

- **Next.js 16** (App Router) — フロントエンド・API ルート
- **NextAuth.js v5** (beta.30) — Okta OIDC 認証
- **TypeScript** — 型安全な実装
- **Tailwind CSS** — スタイリング
- **Vitest** — ユニットテスト（モックなし）

### 4.3 NextAuth.js による Okta OIDC 認証の設定

- `src/auth.ts` で NextAuth.js の Okta プロバイダを使って OIDC 認証を設定
- 重要なポイント：**JWT コールバック** で ID Token と Access Token をサーバー側の JWT に保持
- Okta プロバイダの設定内容：
  - `clientId`: 環境変数 `OKTA_CLIENT_ID`
  - `clientSecret`: 環境変数 `OKTA_CLIENT_SECRET`
  - `issuer`: 環境変数 `OKTA_DOMAIN`
  - スコープ: `openid profile email`
- JWT コールバック：
  - `account.id_token` → `token.idToken` に保持（Token Exchange の subject_token として使用）
  - `account.access_token` → `token.accessToken` に保持
- セッションコールバック：
  - `token.idToken` を `decodeJWTPayload()` でデコードし、ペイロードのみクライアントに渡す
  - トークン文字列の先頭 50 文字 + `"..."` を `idTokenPreview` として渡す（表示用）

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
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    session({ session, token }) {
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

- 設計方針として、**生の ID Token をクライアント（ブラウザ）に公開しない**
- 理由：
  - ID Token はユーザーの身元情報を含む機密性の高いトークン
  - Token Exchange はサーバー側の API Route でのみ実行されるため、クライアントが ID Token を直接持つ必要がない
  - クライアントへの露出最小化により、XSS 等によるトークン漏洩リスクを低減
- クライアントに渡す情報：
  - **`idTokenPayload`**: JWT ペイロード部分を Base64 デコードした内容（表示用。**署名検証は行っていない**）
  - **`idTokenPreview`**: トークン文字列の先頭 50 文字 + `"..."`（表示用）
- 生の ID Token は NextAuth のサーバー側 JWT にのみ保持
- Token Exchange 実行時は `getToken()` でサーバー側から取り出す

### 4.5 Token Exchange API エンドポイントの実装

- `src/app/api/token-exchange/route.ts` が Token Exchange の本体
- 処理フロー：
  1. 環境変数チェック（`OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`）
  2. `auth()` でセッション確認（未認証 → 401）
  3. `next-auth/jwt` の `getToken()` を dynamic import し、サーバー側 JWT から ID Token を取得
  4. リクエストボディ（JSON）から `audience` と `scope` を取得（いずれも任意）
  5. `buildTokenExchangeBody()` で RFC 8693 準拠のリクエストボディを構築
  6. Org 認可サーバー（`/oauth2/v1/token`）へ Token Exchange リクエストを送信
  7. 成功 → ID-JAG を含むレスポンスを返却 / 失敗 → エラーコードに応じたヒントメッセージを返却
- クライアント認証：RFC 6749 Section 2.3.1 準拠の `client_secret_basic`

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

- `src/lib/token-utils.ts` の `buildTokenExchangeBody()` が Token Exchange リクエストの `URLSearchParams` を生成
- 必須パラメータ（常に含まれる）：
  - `grant_type`: `urn:ietf:params:oauth:grant-type:token-exchange`（RFC 8693 標準）
  - `subject_token`: ログイン時に取得した ID Token
  - `subject_token_type`: `urn:ietf:params:oauth:token-type:id_token`
  - `requested_token_type`: `urn:ietf:params:oauth:token-type:id-jag`（**Okta 独自拡張**。RFC 8693 標準のトークン種別にはない）
  - `audience`: ID-JAG の送り先（リソースアプリ識別子）
- 任意パラメータ（指定時のみ追加）：
  - `resource`: リソースアプリ用のアクセストークンを発行する認可サーバー（本検証では `https://example.com` を指定）
  - `scope`: リソースアプリ向けのスコープ
- `resource` パラメータについて：
  - RFC 8693 では「要求先のリソース」を表す任意パラメータとして定義
  - Okta XAA の実装でどの値を渡すべきかは Okta のドキュメント参照が必要

### 4.7 ID-JAG のデコードと画面表示

- `src/components/TokenExchangeClient.tsx` が Token Exchange の実行結果を表示するクライアントコンポーネント
- **Okta XAA の 2026-03-30 時点の実装では、Token Exchange レスポンスの `access_token` フィールドに ID-JAG が格納される**
  - RFC 8693 では `issued_token_type` での種別通知も定義されている
  - Okta はこのフィールドを返さない（本検証で確認済み）
- ID-JAG の取り出し方法：

```typescript
const idJagToken = tokenExchangeResult?.access_token as string | undefined;
const idJagPayload = idJagToken ? decodeJWTPayload(idJagToken) : null;
```

- 画面に表示する情報：
  - 元の ID Token のデコード済みペイロード（ログイン時に取得したもの）
  - Token Exchange 後の ID-JAG のデコード済みペイロード
  - 生レスポンス全体（`token_type`, `expires_in` 等を含む）

### 4.8 エラーハンドリングとトラブルシューティングヒント

- Token Exchange は設定ミスで様々なエラーが返る
- ユーザーが問題を自己解決できるよう、エラーコードに応じたヒントを実装
- 本検証で実際に観測したエラーとその原因推定（設定変更で解消した事実に基づく推定）：

| エラーコード (HTTP ステータス) | 検証時の状況 | 原因推定 | 対処 |
|---|---|---|---|
| `unsupported_grant_type` (400) | XAA 未有効化 or 汎用 OIDC アプリ使用時 | Org AS が Token Exchange grant type を受け付けない | XAA 有効化 / OIN アプリに切り替え |
| `invalid_grant` (400) | Managed Connections 未設定 or ID Token 期限切れ時 | grant が無効と判定された | Managed Connections 設定 or 再ログイン |
| `invalid_target` (400) | デフォルト以外の audience を指定した時 | audience が Okta に認識されていない | `http://localhost:5001`（Todo0 デフォルト）を使用 |
| `invalid_scope` (400) | 未定義スコープを指定した時 | リソースアプリで未許可のスコープ | リソースアプリのスコープ設定を確認 |
| `401 Unauthorized` | Client ID / Secret 誤り時 | クライアント認証失敗 | `OKTA_CLIENT_ID` / `OKTA_CLIENT_SECRET` を確認 |
| `403 Forbidden` | Managed Connections 設定前 | アクセス権がない | Managed Connections の設定を確認 |
---

## 5. 動作確認：ID-JAG の取得と中身の確認

### 5.1 設定完了後の動作フロー

1. `pnpm dev` でアプリ起動（`http://localhost:3000`）
2. 自動で `/token-exchange` にリダイレクト
3. "Okta でログイン" ボタンからログイン（Agent0 経由）
4. ログイン後、元の ID Token のデコード済みペイロードが画面に表示される
5. Token Exchange 設定欄に audience を入力（`http://localhost:5001`）
6. "Token Exchange 実行" ボタンをクリック
7. 成功すると ID-JAG のペイロードが表示される

### 5.2 ID-JAG ペイロードに含まれるクレーム

- ID-JAG に含まれるクレームは標準的な JWT クレームを基本としている：

| クレーム | 内容 |
|---|---|
| `iss` | Okta の Org 認可サーバーの URL |
| `sub` | ユーザーの識別子（元の ID Token の `sub` と同一） |
| `aud` | Token Exchange 時に指定した audience（Todo0 デフォルト: `http://localhost:5001`） |
| `iat` | 発行時刻 |
| `exp` | 有効期限 |
| `jti` | JWT の一意 ID |
| `sub` | ユーザーID |
| `resource` | リソースサーバー用のアクセストークンを発行する認可サーバーのURI |
| `client_id` | 認可サーバーにトークンの発行をリクエストするクライアントのID |

- 元の ID Token との比較で、**`aud` クレームが指定した audience 値に変化している**点が ID-JAG の特徴
- リソースアプリは「このトークンは自分宛てに発行された」と確認できる

### 5.3 audience クレームの実際の値

- **Todo0 のデフォルト audience は `http://localhost:5001` に固定**
- この値以外を指定すると `invalid_target` エラー（400）が返る
- 確認できた受け入れパターン：

| 指定した値 | 結果 |
|---|---|
| `http://localhost:5001` (Todo0 デフォルト) | 成功 |
| Org AS の Issuer URL | エラー (`invalid_target`) |
| Custom AS の Issuer URL | エラー (`invalid_target`) |
| Todo0 の Client ID | 条件次第 |
| 任意の URL | エラー (`invalid_target`) |

### 5.4 resource パラメータの挙動

- `resource` パラメータは自由に設定可能であり、指定した値が ID-JAG に反映されることを確認した（ID-JAG の `resource` クレームに任意の値が入ることを検証済み）
- RFC 8693 で定義されたトークンの対象リソース指定パラメータであり、Okta XAA においても意図した値を渡すことができる
- 一方で `audience` の制約（固定値）は別途存在しており、`audience` の自由設定は現時点では不可

### 5.5 Token Exchange レスポンス全体の構造

- 成功時のレスポンス構造（例）：

```json
{
  "access_token": "<ID-JAG の JWT 文字列>",
  "token_type": "N_A",
  "expires_in": 300,
  "issued_token_type": "urn:ietf:params:oauth:token-type:id-jag"
}
```

- 注目点：
  - フィールド名は `access_token` だが、中身は ID-JAG
  - **Okta のレスポンスには `issued_token_type` フィールドが含まれていなかった**（2026-03-30 時点）
  - `token_type` は `N_A`
  - `expires_in` は 300 秒（5 分）で比較的短い → 中間トークンとしての性質を反映

---

## 6. 当初の目的とぶつかった制限

### 6.1 当初の目標：サードパーティ認可サーバーへの ID-JAG 渡し

- 単に ID-JAG を取得するだけでなく、**取得した ID-JAG をサードパーティ（Okta ドメイン外）の認可サーバーに渡し、そこでアクセストークンを発行させる**構成の実現可能性を確かめたかった
- 想定フロー：

```
Okta ID Token
  → Token Exchange (Org AS)
  → ID-JAG 取得
  → 外部認可サーバーに ID-JAG を提示
  → 外部認可サーバーがアクセストークンを発行
  → 外部リソース API 呼び出し
```

- 実現できれば、Okta の IdP 機能と外部リソースサーバーを組み合わせた柔軟なアーキテクチャが可能になる

### 6.2 audience が固定値に縛られている問題

- **2026-03-30 時点の制約**: Token Exchange で使用できる audience は OIN カタログ登録済みリソースアプリ（Todo0）の識別子に縛られている
- Todo0 のデフォルト audience は `http://localhost:5001` に固定
- 別の値を使おうとすると `invalid_target` エラーになることを本検証で確認
- audience の値を変更するには **Okta チームへのメール申請が必要**
  - Admin Console からの変更は不可（2026-03-30 時点）
- つまり、**任意の URL を audience に設定して ID-JAG を発行させる**使い方は、Okta への申請なしには不可能

### 6.3 Org 認可サーバー限定という根本的な制約

- **ID-JAGを発行するためのToken Exchange が Org 認可サーバーにのみ対応** という制約

```
# 使えるエンドポイント
https://your-org.okta.com/oauth2/v1/token   ← Org AS

# 使えないエンドポイント
https://your-org.okta.com/oauth2/default/v1/token  ← Custom AS（不可）
https://your-org.okta.com/oauth2/aus.../v1/token   ← Custom AS（不可）
```

- Org 認可サーバーは Okta のシステムサーバーであり、スコープやクレームのカスタマイズが制限されている
- 外部リソース向けのカスタムスコープ定義には Custom 認可サーバーが必要
- ID-JAG の発行が Org AS 限定のため、ID-JAGにスコープ情報を載せるのは難しい。

### 6.4 OIN カタログ専用アプリが必須な理由

- **OIN カタログの専用アプリが必須**
- 汎用 OIDC アプリで Token Exchange を実行 → `unsupported_grant_type` または `invalid_grant` が返る
- 原因: Managed Connections の設定が OIN 登録済みかつ XAA 対応のアプリにのみ許可されている
- 外部リソースサーバー対応のカスタムアプリを作成しても、Managed Connections に登録できず、ID-JAGを発行するToken Exchange 自体が実行不可能

### 6.5 外部リソースサーバーへの拡張が現時点で難しい理由の整理

- 3 つの制約が重なっている：

| 制約 | 詳細 | 回避策 |
|---|---|---|
| audience の固定 | OIN アプリ（Todo0）の固定値のみ受け入れ | Okta への申請（`xaa@okta.com`）が必要 |
| Org AS 限定 | ID-JAG 発行は Org AS のみ。カスタムスコープ定義不可 | 現時点で回避策なし |
| OIN アプリ必須 | 汎用 Custom App では Managed Connections 設定不可 | 現時点で回避策なし |

- これらの制約は XAA が **Early Access 段階** にあることと密接に関係
- OIN サンプルアプリ（Agent0 / Todo0）での既定構成では ID-JAG を取得でき、中身を確認できた
- 「外部サービスとの統合」を自前で行うための拡張余地は限られている状態

---

## 7. XAA の現状と今後への期待

### 7.1 Early Access 段階の意味するところ

- 2026-03-30 時点で XAA は **Early Access** 状態
- Early Access の特徴：
  - API・設定項目が変更される可能性がある
  - サポート範囲が限定的
  - Terraform 等のプロバイダが未対応な設定がある
  - audience 変更など一部の操作に Okta への申請が必要
- 現在確認した制約の多くは Early Access 段階の制限に起因している可能性がある
- GA リリースに向けて audience の柔軟な設定や Custom App 対応が追加される可能性は十分ある

### 7.2 現時点でできること・できないこと

**できること:**

- Okta Org AS で ID-JAG を取得する
- ID-JAG のペイロード（クレーム）を確認する
- OIN カタログの Agent0 / Todo0 を使った動作検証

**現時点では難しいこと:**

- audience を自由に設定して任意のリソースサーバー向け ID-JAG を発行する
- Okta ドメイン外のサードパーティ認可サーバーに ID-JAG を渡してアクセストークンを発行させる
- 汎用 Custom App のみで Token Exchange を実行する（OIN アプリが別途必要）
- Custom 認可サーバーを使った Token Exchange

---

## 8. まとめ：検証で得られた知見

- **XAA を動かすための最小構成は明確**
  - 「OIN カタログのアプリが必須」
  - 「Managed Connections タブが XAA 有効化後に出現する」
  - 「ユーザーを両アプリに割り当てる」
  - この 3 点を把握すれば設定が整理できる
- **ID-JAG の実体は Bearer JWT で、中身は標準的な JWT クレーム**
  - Token Exchange レスポンスの `access_token` フィールドに JWT として格納
  - `iss`, `sub`, `aud` などの標準クレームを持つ
  - `aud` が指定した audience 値に変わっている点がリソースアプリ側の検証起点
- **現時点の制約は Early Access 段階に起因している部分が大きい**
  - audience の固定、Org AS 限定、OIN アプリ必須の 3 制約
  - GA に向けて仕様整備により外部リソースサーバーとの統合が容易になることが期待される
- **Okta のサンプル構成の範囲内では動作確認できた**
  - 「サードパーティへの拡張」は現時点では難しい
  - 「ID-JAG がどのようなトークンとして発行されるか」「中身を確認する」という目的は達成
  - XAA の設計意図と現在の機能範囲を理解する上で有意義な検証となった

---

> **リポジトリ**: https://github.com/maronnjapan/sample-id-app (ブランチ: `okta-toke-exchange`)
> **参考記事**:
> - https://developer.okta.com/blog/2025/09/03/cross-app-access
> - https://developer.okta.com/blog/2026/02/17/xaa-resource-app
> - https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/
