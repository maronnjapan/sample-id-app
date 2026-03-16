## Hono MCP Server サンプル

HonoとModel Context Protocol (MCP) SDKを使ったMCPサーバーのサンプル実装です。

### 使用ライブラリ

- [Hono](https://hono.dev/) - 軽量Webフレームワーク
- [@hono/mcp](https://github.com/honojs/middleware/tree/main/packages/mcp) - HonoのMCPミドルウェア
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP公式TypeScript SDK

### セットアップ

```bash
npm install
```

### 起動方法

```bash
# 開発モード（ホットリロード付き）
npm run dev

# プロダクションビルド & 起動
npm run build
npm start
```

サーバーが `http://localhost:3000` で起動します。MCPエンドポイントは `http://localhost:3000/mcp` です。

### 提供するMCP機能

#### ツール (Tools)

| ツール名 | 説明 |
|---------|------|
| `greet` | 名前を指定して挨拶メッセージを返す |
| `calculate` | 四則演算（加算・減算・乗算・除算） |
| `current_time` | 現在日時を取得（タイムゾーン指定可） |
| `transform_text` | テキスト変換（大文字化・小文字化・反転・文字数カウント） |

#### リソース (Resources)

| リソース名 | URI | 説明 |
|-----------|-----|------|
| `server-info` | `info://server` | サーバー情報をJSON形式で返す |

#### プロンプト (Prompts)

| プロンプト名 | 説明 |
|-------------|------|
| `code-review` | コードレビュー依頼用のプロンプトテンプレート |

### MCPクライアントからの接続

Claude DesktopなどのMCPクライアントから接続する場合、以下の設定を追加してください。

```json
{
  "mcpServers": {
    "hono-mcp-sample": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```
