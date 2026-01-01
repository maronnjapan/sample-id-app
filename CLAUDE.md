# OAuth Token Endpoint Cache-Control 検証アプリ

## プロジェクト概要

OAuth 2.0のToken Endpointで`Cache-Control: no-store`が必要な理由を実際に確認するための検証アプリケーション。

### 目的

RFC 6749で規定されている`Cache-Control: no-store`ヘッダの重要性を、実際のブラウザキャッシュ動作を通じて体感する。

### 確認したいシナリオ

1. **シナリオA**: スコープを変更したのに、キャッシュされた古いトークンが返され、新しいスコープのトークンに更新できない
2. **シナリオB**: 新しいトークンを取得したいのに、キャッシュから古いトークンが返され続ける

## 技術スタック

- **ランタイム**: Cloudflare Workers
- **フロントエンド**: 素のHTML/CSS/JavaScript（Workersから静的配信）
- **JWT署名**: RS256（事前生成した鍵をハードコード）

## ディレクトリ構成

```
/
├── src/
│   ├── index.ts          # Workersエントリポイント、ルーティング
│   ├── token.ts          # トークンエンドポイントのロジック
│   ├── jwt.ts            # JWT生成ユーティリティ（RS256）
│   └── frontend.ts       # HTMLを返す関数
├── wrangler.toml         # Cloudflare Workers設定
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## APIエンドポイント設計

### `GET /`

フロントエンドHTMLを返す。

### `POST /token-with-cache-control`

`Cache-Control: no-store`ヘッダ**あり**のトークンエンドポイント（RFC 6749準拠）。

**リクエストボディ（JSON）**:
```json
{
  "scope": "read",
  "expires_in": 60
}
```

**レスポンスヘッダ**:
```
Content-Type: application/json
Cache-Control: no-store
Pragma: no-cache
```

**レスポンスボディ**:
```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 60,
  "scope": "read"
}
```

### `POST /token-without-cache-control`

`Cache-Control: no-store`ヘッダ**なし**で、代わりに明示的なキャッシュ許可ヘッダを付与するトークンエンドポイント。

**リクエストボディ**: 同上

**レスポンスヘッダ**:
```
Content-Type: application/json
Cache-Control: public, max-age=60
```

**レスポンスボディ**: 同上

#### なぜ明示的に`max-age`を付けるのか（重要：ブログ執筆用メモ）

POSTリクエストのレスポンスは、ブラウザのデフォルト動作ではキャッシュされない。
そのため、単に`Cache-Control: no-store`を省略しただけでは問題が再現しない。

しかし、以下の理由から`no-store`は省略すべきではない：

1. **ブラウザ依存**: キャッシュ動作はブラウザの実装に依存しており、将来的に変わる可能性がある
2. **中間プロキシ/CDN**: 企業のプロキシサーバーやCDNが独自のキャッシュポリシーを適用する可能性がある
3. **設定ミス**: リバースプロキシやロードバランサーの設定で誤ってキャッシュが有効になるケースがある
4. **仕様の明確性**: RFC 6749で明示的に要求されている

この検証アプリでは、問題を確実に再現するために意図的に`max-age=60`を付与している。
現実世界では「たまたま動いている」状態が危険であり、明示的に`no-store`を付けることで
環境に依存しない安全なトークンエンドポイントを実装すべきである。

## JWT仕様

### ペイロード

```json
{
  "iss": "https://cache-control-demo.example.com",
  "sub": "demo-client",
  "scope": "read",
  "iat": 1234567890,
  "exp": 1234567950,
  "jti": "<ランダムUUID>"
}
```

### 署名アルゴリズム

RS256（RSA + SHA-256）

### 鍵生成コマンド

デプロイ前に以下のコマンドで鍵ペアを生成し、コードにハードコードする：

```bash
# 秘密鍵生成
openssl genrsa -out private.pem 2048

# 公開鍵生成（検証用、必要に応じて）
openssl rsa -in private.pem -pubout -out public.pem

# 秘密鍵をPKCS#8形式に変換（Web Crypto APIで使用するため）
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private.pem -out private_pkcs8.pem

# 鍵の内容を表示（コードに貼り付け用）
cat private_pkcs8.pem
```

## フロントエンド仕様

### UI要素

1. **スコープ選択**（セレクトボックスで複数選択を可能とする）
   - `read`
   - `write`
   - `admin`

2. **有効期限入力**（数値入力フィールド）
   - 秒数を自由入力（デフォルト: 60）

3. **エンドポイント選択**（ラジオボタン）
   - `Cache-Control: no-store あり`
   - `Cache-Control: no-store なし`

4. **トークン取得ボタン**

5. **結果表示エリア**
   - 生のアクセストークン（JWT文字列）
   - デコードしたヘッダ（JSON整形表示）
   - デコードしたペイロード（JSON整形表示）
     - 特に`scope`、`exp`、`iat`、`jti`を強調表示
   - 取得時刻（ブラウザ側のタイムスタンプ）

6. **リクエスト履歴**（オプション）
   - 過去のリクエストと結果を一覧表示
   - 同じ`jti`が返ってきたらキャッシュヒットと判断できる

### 確認フロー（UIに説明として記載）

```
【正常動作の確認】
1. スコープ「read」、有効期限「60秒」を選択
2. 「Cache-Control: no-store あり」で取得
3. トークン内容を確認（jtiをメモ）
4. スコープを「write」に変更して再取得
5. → 新しいjti、新しいscopeのトークンが返る ✓

【キャッシュ問題の確認】
1. スコープ「read」、有効期限「60秒」を選択
2. 「Cache-Control: no-store なし」で取得
3. トークン内容を確認（jtiをメモ）
4. スコープを「write」に変更して再取得
5. → 同じjti、古いscopeのトークンが返る可能性あり ✗
```

## 実装上の注意点

### フロントエンドからのリクエスト

- `fetch()`を使用
- OAuth 2.0仕様に準拠し、`POST`メソッドを使用
- キャッシュ制御は**サーバー側のレスポンスヘッダに任せる**（fetch側でcache制御しない）

```javascript
// キャッシュ動作をサーバーのレスポンスヘッダに委ねる
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scope, expires_in })
});
```

### コードへのコメント記載（ブログ執筆用）

実装時、以下の箇所に詳細なコメントを残すこと：

1. **`/token-without-cache-control`エンドポイントの`max-age`設定箇所**
   - なぜ意図的に`max-age`を付けているか
   - POSTのデフォルト動作ではキャッシュされないこと
   - 現実世界でのリスク（プロキシ、CDN、ブラウザ依存）

2. **`/token-with-cache-control`エンドポイントの`no-store`設定箇所**
   - RFC 6749の該当セクションへの参照
   - これが正しい実装であること

## デプロイ

```bash
# 依存関係インストール
npm install

# ローカル開発
npm run dev

# デプロイ
npm run deploy
```

## 依存パッケージ

```json
{
  "devDependencies": {
    "wrangler": "^3.0.0",
    "typescript": "^5.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

## 補足：なぜCache-Control: no-storeが必要か

RFC 6749 Section 5.1より：

> The authorization server MUST include the HTTP "Cache-Control" response header field with a value of "no-store" in any response containing tokens, credentials, or other sensitive information.

アクセストークンは機密情報であり、以下の理由でキャッシュされるべきではない：

1. **セキュリティ**: キャッシュに残ったトークンが第三者に漏洩するリスク
2. **正確性**: スコープや有効期限が変わっても古いトークンが使われる問題
3. **トークン更新**: リフレッシュしても新しいトークンを取得できない問題

このアプリでは特に2と3の問題を実際に体験できるようにする。