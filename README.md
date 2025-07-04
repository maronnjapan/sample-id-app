# Sample ID App - Keycloak Token Exchange Demo

## プロジェクト概要
このプロジェクトは、KeycloakとNext.jsを使用したOAuth Token Exchangeのデモアプリケーションです。ユーザー認証とトークン交換機能を実装しており、Keycloakを用いたセキュアな認証フローを体験できます。  
このブランチに関するブログ記事も書いていますので、良ければ参考にしてください。  
https://zenn.dev/maronn/articles/token-exchnage-with-keycloak

## 技術スタック
- **Framework**: Next.js 15.3.1 (React 19.0.0)
- **認証**: NextAuth.js 5.0.0-beta.28(Auth.js) + Keycloak
- **言語**: TypeScript

## 主要機能

### 1. Keycloak認証 (`src/auth.ts`)
- Keycloak OIDCプロバイダーを使用した認証
- アクセストークンをセッションに保存
- JWT コールバックでトークン管理

### 2. Token Exchange API (`src/app/api/token-exchange/route.ts`)
- OAuth 2.0 Token Exchange (RFC 8693) の実装
- 既存のアクセストークンを新しいスコープ・オーディエンスで交換
- Keycloakの `/protocol/openid-connect/token` エンドポイントを使用

### 3. Token Exchange UI (`src/components/TokenExchangeClient.tsx`)
- インタラクティブなToken Exchange デモ画面
- スコープとオーディエンスの選択機能
- JWTトークンのデコードと詳細表示
- トークンのクリップボードコピー機能

### 4. JWT Utilities (`src/lib/token-utils.ts`)
- JWTペイロードのデコード機能
- クリップボードへのコピー機能
- TypeScript型定義

## ディレクトリ構造
```
src/
├── app/                    # Next.js App Router
│   ├── actions.ts         # サーバーアクション（ログイン・ログアウト）
│   ├── api/
│   │   ├── auth/          # NextAuth.js API routes
│   │   └── token-exchange/ # Token Exchange API
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx          # ホームページ（ログインフォーム）
│   └── token-exchange/    # Token Exchange デモページ
├── auth.ts               # NextAuth.js 設定
├── components/           # React コンポーネント
│   ├── LoginForm.tsx     # ログインフォーム
│   ├── Logout.tsx        # ログアウトボタン
│   └── TokenExchangeClient.tsx # メインのToken Exchange UI
├── lib/                  # ユーティリティ
│   ├── $path.ts         # pathpida生成ファイル
│   └── token-utils.ts    # JWT関連ユーティリティ
└── middleware.ts         # NextAuth.js ミドルウェア
```

## フロー説明

### 認証フロー
1. ユーザーがアプリにアクセス
2. ログインフォームが表示 (`src/app/page.tsx`)
3. Keycloakにリダイレクトして認証
4. 認証成功後、アクセストークンをセッションに保存
5. Token Exchange ページにリダイレクト

### Token Exchange フロー
1. 認証済みユーザーがToken Exchange ページにアクセス
2. 現在のアクセストークンを表示
3. ユーザーがスコープ・オーディエンスを選択
4. `/api/token-exchange` にPOSTリクエスト
5. Keycloakの Token Exchange エンドポイントを呼び出し
6. 新しいトークンを取得して表示

## 環境変数
```
# Keycloak設定
# 作成したクライアントのID
KEYCLOAK_CLIENT_ID=oauth-token-exchange-client
# Keycloakでコピーしたシークレットの値を設定
KEYCLOAK_CLIENT_SECRET=ddW4XKYyIJQpdyH01iwJcs2F83lSjJhj
# `http://localhost:8080/realms/作成したレルム名`とする
KEYCLOAK_URL=http://localhost:8080/realms/oauth-token-exchange

# Auth.js設定
# AUTH_SECRETはnpx auth secretで生成したものを使用します https://cli.authjs.dev
AUTH_SECRET=your-nextauth-secret
```

## 開発コマンド
- `npm run dev`: 開発サーバー起動（Turbopack使用）
- `npm run build`: プロダクションビルド


## 注意事項
- audienceを設定するとscopeのダウングレードが期待通りに動作しない場合がある
- Keycloakの設定でToken Exchange機能を有効にする必要がある
- 検証用のアプリなので、セキュリティ的には弱い部分が多々ある