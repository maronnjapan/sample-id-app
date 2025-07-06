#!/usr/bin/env node

/**
 * OAuth2で保護されたMCP (Model Context Protocol) サーバー
 * Claude AIがアクセスするツールを提供し、JWTトークンで認証を実行する
 */
import express from "express";
import { Request, Response } from "express";
import crypto from "crypto";

/** Expressアプリケーションインスタンス */
const app = express();
/** HTTPサーバーのポート番号（デフォルト: 3000） */
const port = process.env.PORT || 3000;

/** JSONリクエストボディの解析を有効化 */
app.use(express.json());

/**
 * Auth0 JWTトークンの検証処理
 * 
 * この関数は以下のステップでJWTトークンを検証します:
 * 1. Auth0のJWKSエンドポイントから公開鍵を取得
 * 2. JWTヘッダー、ペイロード、署名をデコード
 * 3. トークンの有効期限、発行者、オーディエンスを検証
 * 4. RSA-SHA256アルゴリズムでデジタル署名を検証
 * 
 * @param token 検証するJWTアクセストークン
 * @returns トークンが有効な場合true、無効な場合false
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    console.log('Starting token validation...');
    
    /** Auth0のJWKS (JSON Web Key Set) エンドポイントからJWT署名検証用の公開鍵を取得 */
    const jwksResponse = await fetch('https://mcp-authorization-server.jp.auth0.com/.well-known/jwks.json');
    if (!jwksResponse.ok) {
      throw new Error('Failed to fetch JWKS');
    }
    /** JWKSレスポンスをJSONとして解析 */
    const jwks: any = await jwksResponse.json();
    console.log('JWKS fetched successfully');

    /** JWTトークンをピリオドで分割してヘッダー、ペイロード、署名に分割 */
    const parts = token.split('.');
    console.log('Token parts length:', parts.length);
    /** JWTは必ず3つのパーツ（ヘッダー、ペイロード、署名）から構成される */
    if (parts.length !== 3) {
      console.log('Invalid token format - expected 3 parts');
      return false;
    }

    /** JWTヘッダーをBase64URLデコードしてJSONとして解析 */
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    /** JWTペイロードをBase64URLデコードしてJSONとして解析 */
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    /** JWT署名部分（Base64URLエンコード済み） */
    const signature = parts[2];
    
    console.log('Token header:', header);
    console.log('Token payload:', payload);

    /** JWTペイロードの基本的なクレーム検証 */
    const currentTime = Date.now() / 1000;
    console.log('Current time:', currentTime, 'Token exp:', payload.exp);
    /** トークンの有効期限(expクレーム)を現在時刻と比較して期限切れをチェック */
    if (!payload.exp || payload.exp < currentTime) {
      console.log('Token expired or no exp claim');
      return false;
    }

    console.log('Token issuer:', payload.iss);
    /** トークンの発行者(issクレーム)がAuth0のドメインと一致するか検証 */
    if (payload.iss !== 'https://mcp-authorization-server.jp.auth0.com/') {
      console.log('Invalid issuer, expected: https://mcp-authorization-server.jp.auth0.com/');
      return false;
    }

    console.log('Token audience:', payload.aud);
    /** トークンのオーディエンス(audクレーム)にこのMCPサーバーのURLが含まれているか検証 */
    if (!payload.aud || !payload.aud.includes('http://localhost:3000')) {
      console.log('Invalid audience, expected to include: http://localhost:3000');
      return false;
    }

    /** JWTヘッダーから鍵ID(kid)を取得して署名検証用の鍵を特定 */
    const kid = header.kid;
    console.log('Token kid:', kid);
    if (!kid) {
      console.log('No kid in header');
      return false;
    }

    /** JWKSからkidに一致する公開鍵情報（JWK）を検索 */
    const jwk = jwks.keys.find((key: any) => key.kid === kid);
    console.log('Found JWK for kid:', !!jwk);
    if (!jwk) {
      console.log('No matching JWK found for kid:', kid);
      return false;
    }

    /** JWTヘッダーのアルゴリズムがRSA-SHA256であることを確認 */
    console.log('Token algorithm:', header.alg);
    if (header.alg !== 'RS256') {
      console.log('Unsupported algorithm, expected RS256');
      return false;
    }

    /** JWKからNode.jsのcryptoモジュールで使用可能なRSA公開鍵オブジェクトを構築 */
    console.log('Creating public key from JWK...');
    const publicKey = jwkToPublicKey(jwk);
    console.log('Public key created successfully');

    /** JWT署名の対象データ（ヘッダー + "." + ペイロード）を構築 */
    const signatureData = parts[0] + '.' + parts[1];
    console.log('Signature data length:', signatureData.length);

    /** RSA-SHA256アルゴリズムでJWTのデジタル署名を検証 */
    console.log('Verifying signature...');
    const isSignatureValid = crypto.verify(
      /** 署名アルゴリズム: RSA-SHA256 */
      'RSA-SHA256',
      /** 署名対象データ */
      Buffer.from(signatureData),
      {
        /** 検証用のRSA公開鍵 */
        key: publicKey,
        /** RSAパディング方式: PKCS#1 v1.5 */
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      /** JWT署名をBase64URLデコード */
      Buffer.from(signature, 'base64url')
    );

    console.log('Signature validation result:', isSignatureValid);
    /** デジタル署名が無効な場合はトークンを拒否 */
    if (!isSignatureValid) {
      console.log('Signature validation failed');
      return false;
    }

    console.log('Token validation successful');
    return true;
  } catch (error) {
    /** トークン検証中の任意のエラー（ネットワークエラー、パースエラー等）をキャッチ */
    console.error('Token validation error:', error);
    return false;
  }
}

/**
 * JWK (JSON Web Key) からNode.jsのcryptoモジュールで使用可能なRSA公開鍵オブジェクトを構築
 * 
 * この関数はAuth0のJWKSエンドポイントから取得したJWKを
 * Node.js標準のcrypto.verify()関数で使用可能な形式に変換します。
 * 
 * @param jwk Auth0から取得したJSON Web Keyオブジェクト
 * @returns 署名検証用のRSA公開鍵オブジェクト
 */
function jwkToPublicKey(jwk: any): crypto.KeyObject {
  /** Node.js 15.12.0以降で利用可能なJWKフォーマットから直接KeyObjectを作成 */
  const publicKey = crypto.createPublicKey({
    /** JWKオブジェクト */
    key: jwk,
    /** キーのフォーマットをJWKとして指定 */
    format: 'jwk'
  });
  
  return publicKey;
}

/**
 * MCPサーバーで提供するツールのレジストリ
 * Claude AIが呼び出し可能なツールとそのスキーマを定義
 * この例では簡単な電卓機能を提供
 */
const tools = {
  calculator: {
    /** ツールの一意名 */
    name: "calculator",
    /** ツールの説明（Claudeがツールを選択する際の参考情報） */
    description: "Perform basic arithmetic calculations",
    /** ツールの入力パラメータスキーマ（JSON Schema形式） */
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression to evaluate (e.g., '2 + 3 * 4')"
        }
      },
      /** 必須パラメータのリスト */
      required: ["expression"]
    }
  }
};

/**
 * OAuth2リソースサーバーのメタデータエンドポイント
 * 
 * RFC 8414 (OAuth 2.0 Authorization Server Metadata) に準拠したエンドポイント。
 * クライアントが401 UnauthorizedレスポンスのWWW-Authenticateヘッダーから
 * このURLを取得し、認可サーバーの情報を知ることができる。
 */
app.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
  res.json(
    {
      /** このリソースサーバーのURI */
      "resource":
        "http://localhost:3000",
      /** このリソースを保護する認可サーバーのリスト */
      "authorization_servers":
        ["https://mcp-authorization-server.jp.auth0.com"],
    }
  );
});
/**
 * MCP (Model Context Protocol) のメインエンドポイント
 * 
 * Claude AIからのJSON-RPC 2.0リクエストを処理し、適切なレスポンスを返す。
 * 認証が必要なメソッドはOAuth2アクセストークンで認証を実行。
 */
app.post("/mcp", async (req: Request, res: Response) => {
  /** クライアントからのJSON-RPCリクエストボディ */
  const request = req.body;
  /** リクエストのHTTPヘッダー（Authorizationヘッダー等を含む） */
  const headers = req.headers;


  /** 
   * Claude AIからの初期化リクエストの例:
   * {
   *   "method": "initialize",
   *     "params": {
   *     "protocolVersion": "2024-11-05",
   *       "capabilities": { },
   *     "clientInfo": {
   *       "name": "claude-ai",
   *         "version": "0.1.0"
   *     }
   *   }
   */

  /**
   * MCP初期化メソッドの処理
   * 
   * Claude AIがMCPサーバーとの接続を確立するための初期ハンドシェイク。
   * サーバーの機能、バージョン情報、対応プロトコルバージョンを通知。
   * このレスポンスがないとClaudeはMCPサーバーとして認識しない。
   */
  if (request.method === "initialize") {
    res.json({
      /** JSON-RPCバージョン */
      jsonrpc: "2.0",
      /** リクエストと対応するID */
      id: request.id,
      result: {
        /** 対応するMCPプロトコルバージョン */
        protocolVersion: "2024-11-05",
        /** サーバーの機能（ツール機能を利用可能） */
        capabilities: { tools: {} },
        /** サーバーの情報 */
        serverInfo: { name: "sample-mcp-server", version: "1.0.0" }
      }
    });
    return;
  }

  /**
   * 利用可能なツールの一覧を取得するメソッド
   * 
   * Claude AIがどのツールを呼び出し可能かを知るために使用。
   * 各ツールの名前、説明、入力スキーマを返す。
   * この情報がないとClaudeはツールを使用できない。
   */
  if (request.method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id: request.id,
      /** 登録済みの全ツールの情報を返す */
      result: { tools: Object.values(tools) }
    });
    return;
  }

  /**
   * ツール実行メソッドの処理（OAuth2認証必須）
   * 
   * Claude AIが実際にツールを呼び出す際に使用されるメソッド。
   * このメソッドはOAuth2アクセストークンによる認証が必要。
   */
  if (request.method === "tools/call") {
    /** HTTPリクエストからAuthorizationヘッダーを取得 */
    const authHeader = headers['authorization'];
    /** Authorizationヘッダーがないか Bearer スキームでない場合は401エラー */
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      /** 
       * RFC 6750 (OAuth 2.0 Bearer Token Usage) に準拠した401レスポンス
       * WWW-AuthenticateヘッダーでリソースメタデータのURLを通知
       */
      res.status(401).header({
        "WWW-Authenticate": 'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
      }).json({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "Unauthorized" }
      });
      return;
    }

    /** Authorizationヘッダーから"Bearer "プレフィックスを除去してアクセストークンを抽出 */
    const token = authHeader.replace(/Bearer\s+/, '');

    /** Auth0 JWTアクセストークンの検証実行 */
    try {
      const isValid = await validateToken(token);
      console.log('Token is valid:', isValid);
      /** トークン検証に失敗した場合は401エラーで再認証を促す */
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
      /** トークン検証中の例外をキャッチして401エラーで返す */
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
    /** ツール呼び出しパラメータからツール名と引数を抽出 */
    const { name, arguments: args } = request.params;

    /** 電卓ツールの実装（簡単な数式評価） */
    if (name === "calculator") {
      /** 
       * JavaScriptのFunctionコンストラクタで数式を安全に評価
       * "use strict"で厳格モードを有効化してセキュリティを向上
       */
      const result = Function(`"use strict"; return (${args.expression})`)();
      res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          /** MCPプロトコルに準拠したテキストコンテントフォーマット */
          content: [{ type: "text", text: `Result: ${result}` }]
        }
      });
      return;
    }
  }

  /** サポートされていないメソッドに対するデフォルトエラーレスポンス */
  res.json({
    jsonrpc: "2.0",
    id: request.id,
    /** JSON-RPC 2.0標準エラーコード: -32601 (Method not found) */
    error: { code: -32601, message: "Method not found" }
  });
});

/** MCPサーバーを指定ポートで起動し、コンソールにサーバー情報を出力 */
app.listen(port, () => {
  console.log(`MCP HTTP Server running on http://localhost:${port}`);
});