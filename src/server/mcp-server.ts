#!/usr/bin/env node

import express from "express";
import { Request, Response } from "express";
import crypto from "crypto";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Auth0トークン検証関数
async function validateToken(token: string): Promise<boolean> {
  try {
    console.log('Starting token validation...');
    
    // Auth0のJWKSエンドポイントからJWKを取得
    const jwksResponse = await fetch('https://mcp-authorization-server.jp.auth0.com/.well-known/jwks.json');
    if (!jwksResponse.ok) {
      throw new Error('Failed to fetch JWKS');
    }
    const jwks: any = await jwksResponse.json();
    console.log('JWKS fetched successfully');

    // JWTをデコード
    const parts = token.split('.');
    console.log('Token parts length:', parts.length);
    if (parts.length !== 3) {
      console.log('Invalid token format - expected 3 parts');
      return false;
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const signature = parts[2];
    
    console.log('Token header:', header);
    console.log('Token payload:', payload);

    // 基本的な検証
    const currentTime = Date.now() / 1000;
    console.log('Current time:', currentTime, 'Token exp:', payload.exp);
    if (!payload.exp || payload.exp < currentTime) {
      console.log('Token expired or no exp claim');
      return false; // 期限切れ
    }

    console.log('Token issuer:', payload.iss);
    if (payload.iss !== 'https://mcp-authorization-server.jp.auth0.com/') {
      console.log('Invalid issuer, expected: https://mcp-authorization-server.jp.auth0.com/');
      return false; // 発行者が異なる
    }

    console.log('Token audience:', payload.aud);
    if (!payload.aud || !payload.aud.includes('http://localhost:3000')) {
      console.log('Invalid audience, expected to include: http://localhost:3000');
      return false; // オーディエンスが異なる
    }

    // 署名検証
    const kid = header.kid;
    console.log('Token kid:', kid);
    if (!kid) {
      console.log('No kid in header');
      return false;
    }

    // JWKSから対応するキーを取得
    const jwk = jwks.keys.find((key: any) => key.kid === kid);
    console.log('Found JWK for kid:', !!jwk);
    if (!jwk) {
      console.log('No matching JWK found for kid:', kid);
      return false;
    }

    // RSA256署名検証
    console.log('Token algorithm:', header.alg);
    if (header.alg !== 'RS256') {
      console.log('Unsupported algorithm, expected RS256');
      return false;
    }

    // JWKからRSA公開鍵を構築
    console.log('Creating public key from JWK...');
    const publicKey = jwkToPublicKey(jwk);
    console.log('Public key created successfully');

    // 署名対象データ（header + payload）
    const signatureData = parts[0] + '.' + parts[1];
    console.log('Signature data length:', signatureData.length);

    // 署名検証
    console.log('Verifying signature...');
    const isSignatureValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signatureData),
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(signature, 'base64url')
    );

    console.log('Signature validation result:', isSignatureValid);
    if (!isSignatureValid) {
      console.log('Signature validation failed');
      return false;
    }

    console.log('Token validation successful');
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

// JWKからRSA公開鍵を構築する関数
function jwkToPublicKey(jwk: any): crypto.KeyObject {
  // Node.jsのcryptoモジュールでJWKから直接KeyObjectを作成
  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: 'jwk'
  });
  
  return publicKey;
}

// Tools registry
const tools = {
  calculator: {
    name: "calculator",
    description: "Perform basic arithmetic calculations",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression to evaluate (e.g., '2 + 3 * 4')"
        }
      },
      required: ["expression"]
    }
  }
};

app.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
  res.json(
    {
      "resource":
        "http://localhost:3000",
      "authorization_servers":
        ["https://mcp-authorization-server.jp.auth0.com"],
    }
  );
});
app.post("/mcp", async (req: Request, res: Response) => {
  const request = req.body;
  const headers = req.headers;


  // 以下のリクエストがClaudeから来る
  // {
  //   "method": "initialize",
  //     "params": {
  //     "protocolVersion": "2024-11-05",
  //       "capabilities": { },
  //     "clientInfo": {
  //       "name": "claude-ai",
  //         "version": "0.1.0"
  //     }
  //   }

  /**
   * MCPサーバーと接続できるようにするために行う
   * これがないと、MCPサーバーとの接続が確立できない
   */
  if (request.method === "initialize") {
    res.json({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "sample-mcp-server", version: "1.0.0" }
      }
    });
    return;
  }

  /**
   * この情報がないとMCPサーバーを実行するために必要な情報が分からない
   * なので、ここでMCPサーバーを実行する用の情報を返す
   */
  if (request.method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: Object.values(tools) }
    });
    return;
  }

  // Handle tools/call request
  if (request.method === "tools/call") {
    const authHeader = headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).header({
        "WWW-Authenticate": 'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
      }).json({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "Unauthorized" }
      });
      return;
    }

    const token = authHeader.replace(/Bearer\s+/, '');

    // Auth0のトークン検証
    try {
      const isValid = await validateToken(token);
      console.log('Token is valid:', isValid);
      if (!isValid) {
        res.status(401).header({
          "WWW-Authenticate": 'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
        }).json({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: "Invalid token" }
        });
        return;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      res.status(401).header({
        "WWW-Authenticate": 'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
      }).json({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "Token validation failed" }
      });
      return;
    }
    const { name, arguments: args } = request.params;

    // For other calculations, just return the result
    if (name === "calculator") {
      const result = Function(`"use strict"; return (${args.expression})`)();
      res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: `Result: ${result}` }]
        }
      });
      return;
    }
  }

  // Default response for unsupported methods
  res.json({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: "Method not found" }
  });
});

// Start server
app.listen(port, () => {
  console.log(`MCP HTTP Server running on http://localhost:${port}`);
});