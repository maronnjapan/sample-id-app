# MCP HTTP Client & Server

TypeScriptで実装したModel Context Protocol (MCP) のHTTPクライアントとサーバーのサンプルです。

## 機能

- **HTTPサーバー**: Express.jsベースのMCPサーバー
- **HTTPクライアント**: fetch APIを使用するMCPクライアント
- **Calculator Tool**: 数式計算機能（例: "2 + 3 * 4"）

## セットアップ

```bash
# 依存関係のインストール
npm install

# TypeScriptのビルド（オプション）
npm run build
```

## 使い方

### 1. サーバーを起動

```bash
npm run server
```

サーバーが http://localhost:3000 で起動します。

### 2. クライアントをテスト（別ターミナル）

```bash
npm run client
```

## 動作確認

サーバーが正常に起動していることを確認：

```bash
curl http://localhost:3000/health
```

手動でMCPリクエストを送信：

```bash
# ツール一覧を取得
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# 計算ツールを呼び出し
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "calculator",
      "arguments": {
        "expression": "2 + 3 * 4"
      }
    }
  }'
```

## Claude Desktopでの使用方法

このMCPサーバーをClaude Desktopで使用するには、Claude Desktopの設定ファイルに追加する必要があります。

### 1. Claude Desktop設定ファイルの場所

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

### 2. 設定ファイルの編集

設定ファイルに以下の内容を追加してください：

```json
{
  "mcpServers": {
    "sample-calculator": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/sample-id-app"
    }
  }
}
```

**注意:** `cwd`の部分は、このプロジェクトの実際のパスに変更してください。

### 3. 使用手順

1. **プロジェクトをビルド:**
   ```bash
   npm run build
   ```

2. **Claude Desktopを再起動**

3. **Claude Desktopで使用:**
   - 新しい会話を開始
   - 計算に関する質問をする（例: "2 + 3 * 4を計算して"）
   - MCPツールが自動的に使用されます

### HTTPサーバー版の使用

HTTPサーバー版を使用する場合は、以下の設定も可能です：

```json
{
  "mcpServers": {
    "sample-calculator-http": {
      "command": "node",
      "args": ["dist/http-server.js"],
      "cwd": "/path/to/sample-id-app"
    }
  }
}
```

## ファイル構成

- `src/http-server.ts` - MCPサーバー実装
- `src/http-client.ts` - MCPクライアント実装
