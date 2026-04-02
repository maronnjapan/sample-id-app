# Okta XAA (Cross App Access) 検証レポート
※ このレポートにおけるCross App AccessはAI Agentを使用しない前提になっています。

## 検証概要

Okta XAA (Cross App Access) を用いた Token Exchange (RFC 8693) の動作検証を行い、ID-JAG (Identity Assertion JWT) の取得とそのクレーム構造を確認した。

加えて、「AI Agentに限定せず、取得した ID-JAG をサードパーティ（Okta ドメイン外）の認可サーバーに渡し、そこでアクセストークンを発行させる」構成の実現可能性も確認することを目的とした。
※ サードパーティーの認可サーバーでアクセストークを発行するという要件はありません。あくまで、私が気になったので検証してみたという意味合いがつよいです

## 検証環境

- XAA ステータス: Early Access（管理画面 Settings > Features から手動有効化）
- 使用アプリ:
  - Agent0 - Cross App Access (XAA) Sample Requesting App（OIN カタログ）
  - Todo0 - Cross App Access (XAA) Sample Resource App（OIN カタログ）
- 検証アプリ: Next.js 16 (App Router) + NextAuth.js v5 + TypeScript

## 検証結果サマリー

| 確認したかったこと | 結果 |
|---|---|
| ID-JAG を取得できるか | 成功 |
| ID-JAG のクレーム構造 | 確認済み（後述） |
| `audience` を任意の値に設定できるか | 不可（固定値のみ。変更には申請が必要） |
| `resource` パラメータを任意の値に設定できるか | 可能（指定値が ID-JAG の `resource` クレームに反映される） |
| サードパーティ認可サーバーへ ID-JAG を渡してアクセストークンを発行させられるか | 現時点で困難（後述の制約による） |
| 汎用 OIDC アプリ単体で Token Exchange を実行できるか | 不可（OIN カタログの XAA 対応アプリが必須） |

## ID-JAG のクレーム構造

Token Exchange 成功時、レスポンスの `access_token` フィールドに JWT として格納された ID-JAG を確認した。

レスポンス構造:

```json
{
  "access_token": "<ID-JAG の JWT>",
  "token_type": "N_A",
  "expires_in": 300,
  "issued_token_type": "urn:ietf:params:oauth:token-type:id-jag"
}
```

ID-JAG ペイロードに含まれるクレーム:

| クレーム | 値 |
|---|---|
| `iss` | Okta Org 認可サーバーの URL |
| `sub` | ユーザー識別子（元 ID Token の `sub` と同一） |
| `aud` | Token Exchange 時に指定した audience（`http://localhost:5001`） |
| `iat` | 発行時刻 |
| `exp` | 有効期限（expires_in: 300 秒） |
| `jti` | JWT 一意 ID |
| `resource` | リクエスト時に指定した `resource` パラメータの値 |
| `client_id` | OIN アプリに紐づく固定の識別子（`wiki0-at-todo0` という環境の Client ID ではなく固定値であることを確認） |

注記:

- `token_type` が `N_A` であり、通常の Bearer トークンとは区別されている。
- `issued_token_type` に `urn:ietf:params:oauth:token-type:id-jag` が含まれており、RFC 8693 準拠のトークン種別通知が行われている。
- `expires_in` は 300 秒（5 分）と短く、中間トークンとしての性質を反映している。

## 発見した制約

### `audience` が固定値に縛られている

- Token Exchange で指定できる `audience` は、OIN カタログ登録済みリソースアプリ（Todo0）の識別子（`http://localhost:5001`）に限定される。
- 別の値を指定すると `invalid_target` (400) エラーが返る。

| 指定した audience | 結果 |
|---|---|
| `http://localhost:5001`（Todo0 デフォルト） | 成功 |
| Org AS の Issuer URL | `invalid_target` |
| Custom AS の Issuer URL | `invalid_target` |
| 任意の URL | `invalid_target` |

- `audience` の変更には `xaa@okta.com` へのメール申請が必要であり、Admin Console からの変更は不可（2026-03-30 時点）。

### ID-JAG 発行は Org 認可サーバー限定

- ID-JAG を発行するための Token Exchange はOINカタログのアプリを使用する場合、 Org 認可サーバー（`/oauth2/v1/token`）でのみ動作する。
  - なお、通常の Token Exchange（ID-JAG 以外のトークン交換）は Custom 認可サーバーでも利用可能であり、本制約はあくまで ID-JAG 発行に固有の制限である認識です。
- Org 認可サーバーはスコープ・クレームのカスタマイズが制限されており、外部リソースサーバー向けのカスタムスコープを ID-JAG に含めることが難しい。

### OIN カタログ登録済みアプリが必須

- Managed Connections タブは OIN カタログに登録済みかつ XAA 対応のアプリにしか表示されない。
- 汎用 App（OIDC アプリとして手動作成したもの）では Managed Connections の設定自体が不可能であり、ID-JAG 発行のための Token Exchange が実行できない。
- また、Cross App AccessにおけるIdPとResource Authorization ServerはOINカタログアプリであることが必要。
  - そのため、独自のResource Authorization ServerにID-JAGを渡そうにも、Resource Authorization Serverに相当するOINカタログアプリも作成が必要となる。
  - Cross App Accessのプロトコルで考えると不要な登場人物が存在してしまう。


## サードパーティ認可サーバーへの拡張が困難な理由

当初の目標であった「ID-JAG を Okta 外部の認可サーバーに渡してアクセストークンを発行させる」構成を実現するには、以下の 3 つの制約をすべてクリアする必要がある：

| 制約 | 詳細 | 現時点での回避策 |
|---|---|---|
| `audience` の固定 | 任意の外部サーバー識別子を audience に設定できない | Okta への申請（`xaa@okta.com`）が必要 |
| Org AS 限定 | カスタムスコープを ID-JAG に含められない | 現時点で回避策なし |
| OIN アプリ必須 | 外部リソース向けカスタムアプリで Managed Connections を設定できない | 現時点で回避策なし |

## 確認事項

以下の点について確認したいです。

### Q1. `audience` の自由設定はいつ頃対応予定か

現時点では `xaa@okta.com` へのメール申請が必要とのことだが、GA リリース時に Admin Console または API から自由に設定できるようになる予定はありますでしょうか。

### Q2. OIN カタログ以外のカスタムアプリで Managed Connections を設定できるようにする予定はあるか

外部リソースサーバーとの統合を想定した場合、OIN カタログへの登録なしに XAA を利用できる仕組みが必要になると考えます。この対応の予定がありますでしょうか。

### Q3. カスタム認可サーバーを使用せずともカスタムスコープを設定は可能になるか

スコープなどの管理はIdPに寄せることができると統制しやすいと思うので、カスタムスコープを設定できると嬉しいと感じております。
こちらの機能について対応予定はありますでしょうか。

## 参考情報

- https://developer.okta.com/blog/2025/09/03/cross-app-access
- https://developer.okta.com/blog/2026/02/17/xaa-resource-app
- https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/
- RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693
