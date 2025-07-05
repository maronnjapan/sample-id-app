import express from "express";
import { Request, Response } from "express";
import fs from 'fs';
import { CODE_FILE } from "./mcp-client";
import { SystemKeyring } from './system-keyring';

const app = express();
const port = process.env.CLIENT_PORT || 8000;

app.use(express.json());

const keyring = new SystemKeyring();

/**
 * 認可サーバーから認可コードを受け取り、安全に保存するエンドポイント
 * システムキーリングを優先的に使用
 */
app.get("/verify", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }

  try {
    // システムキーリングに保存
    if (await keyring.isAvailable()) {
      await keyring.store(code);
      console.log('Code stored in system keyring');
    } else {
      // フォールバック: 平文ファイル保存
      fs.writeFileSync(CODE_FILE, code, 'utf8');
      console.log('Code stored as plain text (fallback)');
    }
  } catch (error) {
    console.error('Storage error:', error);
    // 最終フォールバック: 平文ファイル保存
    fs.writeFileSync(CODE_FILE, code, 'utf8');
    console.log('Code stored as plain text (error fallback)');
  }

  res.send(`
    <html>
      <body>
        <h1>Verification Successful</h1>
        <p>Your access has been verified. You can now close this window.</p>
        <p>The calculation result will be returned to Claude.</p>
      </body>
    </html>
  `);
});

// 簡単なルートページ
app.get("/", (req: Request, res: Response) => {
  res.send(`
    <html>
      <body>
        <h1>MCP Authorization Client</h1>
        <p>This server handles OAuth authorization codes for MCP.</p>
        <p>Server is running on port ${port}</p>
      </body>
    </html>
  `);
});

export { app, port };