## Hono MCP Server サンプル

HonoとModel Context Protocol (MCP) SDKを使ったMCPサーバーのサンプル実装です。

### ディレクトリ構成

```
.
├── base-mcp-server/    # ベースのMCPサーバー（認可なし）
└── (今後追加予定)       # Authorization付きMCPサーバーなど
```

### 使用ライブラリ

- [Hono](https://hono.dev/) - 軽量Webフレームワーク
- [@hono/mcp](https://github.com/honojs/middleware/tree/main/packages/mcp) - HonoのMCPミドルウェア
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP公式TypeScript SDK

各ディレクトリの詳細は、それぞれのREADMEを参照してください。
