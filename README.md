# MCP HTTP Client & Server

TypeScriptで実装したModel Context Protocol (MCP) のHTTPクライアントとサーバーのサンプルです。

## 機能

- **MCPサーバー**: TypeScriptで実装したMCPサーバー
- **MCPクライアント**: 標準入力からJSONリクエストを受け取って処理するクライアント
- **Calculator Tool**: 数式計算機能（例: "2 + 3 * 4"）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成してAuth0のクライアントIDとクライアントシークレットを設定してください：

```bash
CLIENT_ID="YOUR_AUTH0_CLIENT_ID"
CLIENT_SECRET="YOUR_AUTH0_CLIENT_SECRET"
```

### 3. TypeScriptのビルド

```bash
npm run build
```

## 使い方

### 1. MCPサーバーを起動

```bash
npm run server
```

**注意:** MCPサーバーは先に起動しておく必要があります。

### 2. クライアントをテスト

```bash
npm run client
```

## 動作確認

```bash
npm run exec:test
```

このコマンドでプロジェクトのビルドとテストを実行します。

## Claude Desktopでの使用方法

このMCPサーバーをClaude Desktopで使用するには、Claude Desktop設定ファイルに追加する必要があります。

### WSL環境での設定

このプロジェクトがWSLにあって、WindowsにClaude Desktopをインストールしている場合、以下の設定で動作します：

```json
{
  "mcpServers": {
    "sample-calculator": {
      "command": "wsl",
      "args": [
        "-d",
        "Ubuntu",
        "-e",
        "bash",
        "-c",
        "cd プロジェクトへのWSL上のパス && npm run client"
      ]
    }
  }
}
```

### 一般的な設定

Claude Desktop設定ファイルの場所は環境によって異なります。具体的な設定方法についてはClaude Desktopの公式ドキュメントを参照してください。

## ファイル構成

```
src/
├── client/
│   ├── index.ts                    - MCPクライアントのエントリーポイント
│   ├── mcp-client.ts              - MCPクライアント実装
│   ├── memory-storage.ts          - メモリベースのストレージ実装
│   ├── send-server-repository.ts  - サーバーとの通信を管理
│   └── simple-http-server.ts      - 簡単なHTTPサーバー実装
└── server/
    └── mcp-server.ts              - MCPサーバー実装
```

### 主要ファイルの説明

- **src/server/mcp-server.ts**: MCPサーバーのメイン実装。Calculator toolを提供
- **src/client/index.ts**: MCPクライアントのエントリーポイント。標準入力からJSONリクエストを受け取って処理
- **src/client/mcp-client.ts**: MCPクライアントの実装
- **src/client/memory-storage.ts**: メモリベースのストレージ実装（暗号化機能付き）
- **src/client/send-server-repository.ts**: サーバーとの通信を管理するリポジトリ
- **src/client/simple-http-server.ts**: 簡単なHTTPサーバー実装
