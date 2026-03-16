import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { serve } from "@hono/node-server";

const app = new Hono();

// MCPサーバーの作成
const mcpServer = new McpServer({
  name: "hono-mcp-sample",
  version: "1.0.0",
});

// ===== ツールの登録 =====

// 1. 挨拶ツール
mcpServer.tool(
  "greet",
  "指定された名前で挨拶メッセージを返します",
  { name: z.string().describe("挨拶する相手の名前") },
  async ({ name }) => ({
    content: [{ type: "text", text: `こんにちは、${name}さん！` }],
  })
);

// 2. 計算ツール（四則演算）
mcpServer.tool(
  "calculate",
  "二つの数値で四則演算を行います",
  {
    a: z.number().describe("1つ目の数値"),
    b: z.number().describe("2つ目の数値"),
    operator: z
      .enum(["add", "subtract", "multiply", "divide"])
      .describe("演算子: add(加算), subtract(減算), multiply(乗算), divide(除算)"),
  },
  async ({ a, b, operator }) => {
    let result: number;
    switch (operator) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) {
          return {
            content: [{ type: "text", text: "エラー: 0で割ることはできません" }],
            isError: true,
          };
        }
        result = a / b;
        break;
    }
    return {
      content: [{ type: "text", text: `${a} ${operator} ${b} = ${result}` }],
    };
  }
);

// 3. 現在時刻取得ツール
mcpServer.tool(
  "current_time",
  "現在の日時を返します",
  {
    timezone: z
      .string()
      .optional()
      .describe("タイムゾーン（例: Asia/Tokyo）。省略時はUTC"),
  },
  async ({ timezone }) => {
    const tz = timezone ?? "UTC";
    const now = new Date().toLocaleString("ja-JP", { timeZone: tz });
    return {
      content: [{ type: "text", text: `現在時刻 (${tz}): ${now}` }],
    };
  }
);

// 4. テキスト変換ツール
mcpServer.tool(
  "transform_text",
  "テキストの変換を行います（大文字化、小文字化、反転、文字数カウント）",
  {
    text: z.string().describe("変換対象のテキスト"),
    operation: z
      .enum(["uppercase", "lowercase", "reverse", "count"])
      .describe(
        "操作: uppercase(大文字化), lowercase(小文字化), reverse(反転), count(文字数カウント)"
      ),
  },
  async ({ text, operation }) => {
    let result: string;
    switch (operation) {
      case "uppercase":
        result = text.toUpperCase();
        break;
      case "lowercase":
        result = text.toLowerCase();
        break;
      case "reverse":
        result = [...text].reverse().join("");
        break;
      case "count":
        result = `文字数: ${[...text].length}`;
        break;
    }
    return { content: [{ type: "text", text: result }] };
  }
);

// ===== リソースの登録 =====

mcpServer.resource("server-info", "info://server", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          name: "hono-mcp-sample",
          version: "1.0.0",
          description: "HonoとMCP SDKで構築したサンプルMCPサーバー",
          availableTools: [
            "greet",
            "calculate",
            "current_time",
            "transform_text",
          ],
        },
        null,
        2
      ),
    },
  ],
}));

// ===== プロンプトの登録 =====

mcpServer.prompt(
  "code-review",
  "コードレビューを依頼するためのプロンプト",
  { code: z.string().describe("レビュー対象のコード") },
  ({ code }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `以下のコードをレビューしてください。改善点やバグがあれば指摘してください。\n\n\`\`\`\n${code}\n\`\`\``,
        },
      },
    ],
  })
);

// ===== Honoルーティング =====

const transport = new StreamableHTTPTransport();

// ヘルスチェック用エンドポイント
app.get("/", (c) =>
  c.json({
    status: "ok",
    message: "Hono MCP Server is running",
    mcpEndpoint: "/mcp",
  })
);

// MCPエンドポイント
app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

// サーバー起動
const port = Number(process.env.PORT) || 3000;
console.log(`MCP Server is running on http://localhost:${port}`);
console.log(`MCP endpoint: http://localhost:${port}/mcp`);

serve({ fetch: app.fetch, port });
