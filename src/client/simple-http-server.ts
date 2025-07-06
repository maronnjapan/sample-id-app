/**
 * OAuth2 Authorization Code Flow を実装するHTTPサーバー
 * MCPクライアント用の認可エンドポイントを提供する
 */
import express from "express";
import { Request, Response } from "express";
import { MemoryStorage } from './memory-storage';
import dotenv from 'dotenv';

/** 環境変数の読み込み */
dotenv.config();

/** Express アプリケーションインスタンス */
const app = express();
/** HTTPサーバーのポート番号（デフォルト: 8000） */
const port = process.env.CLIENT_PORT || 8000;

/** JSON リクエストボディの解析を有効化 */
app.use(express.json());

/** インメモリストレージのシングルトンインスタンス */
const memoryStorage = MemoryStorage.getInstance();

/**
 * OAuth2 Authorization Code Flow の認可コールバックエンドポイント
 * 
 * このエンドポイントは以下の処理を実行します:
 * 1. 認可サーバーから認可コード(code)とstate パラメータを受け取る
 * 2. CSRF攻撃を防ぐためstateパラメータを検証する
 * 3. 認可コードをアクセストークンに交換する
 * 4. 取得したアクセストークンを暗号化してメモリに保存する
 * 
 * OAuth2の標準的なAuthorization Code Flowに準拠した実装
 */
app.get("/verify", async (req: Request, res: Response) => {
  /** 認可サーバーから返される認可コード */
  const code = req.query.code as string;
  /** CSRF攻撃防止用のstateパラメータ */
  const state = req.query.state as string;

  /** 認可コードの必須チェック */
  if (!code) {
    res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Error</h1>
          <p>Missing authorization code parameter</p>
        </body>
      </html>
    `);
    return;
  }

  /** stateパラメータの存在チェック（CSRF攻撃防止の第一段階） */
  if (!state) {
    res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Error</h1>
          <p>Missing state parameter</p>
        </body>
      </html>
    `);
    return;
  }

  /** メモリから事前に保存されたstateパラメータを取得 */
  const storedState = memoryStorage.getState();
  /** stateパラメータの値を比較してCSRF攻撃でないことを確認 */
  if (!storedState || storedState !== state) {
    res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Error</h1>
          <p>Invalid state parameter - possible CSRF attack</p>
        </body>
      </html>
    `);
    return;
  }

  /** セキュリティのため、検証成功後にstateパラメータをメモリから削除 */
  memoryStorage.clearState();

  try {

    /** OAuth2クライアント認証情報の準備 */
    /** 環境変数からクライアントIDを取得 */
    const clientId = process.env.CLIENT_ID;
    /** 環境変数からクライアントシークレットを取得 */
    const clientSecret = process.env.CLIENT_SECRET;
    /** 認可サーバーに登録済みのリダイレクトURI */
    const redirectUri = 'http://localhost:8000/verify';
    /** Auth0認可サーバーのベースURL */
    const authorizationServerUrl = 'https://mcp-authorization-server.jp.auth0.com';

    /** OAuth2認可サーバーのメタデータエンドポイントを構築 */
    const authServerConfigUrl = `${authorizationServerUrl}/.well-known/oauth-authorization-server`;
    /** 認可サーバーの設定情報（エンドポイントURL等）を取得 */
    const authServerConfigResponse = await fetch(authServerConfigUrl);

    /** 認可サーバー設定の取得に失敗した場合のエラーハンドリング */
    if (!authServerConfigResponse.ok) {
      throw new Error(`Failed to fetch auth server config: ${authServerConfigResponse.statusText}`);
    }

    /** 認可サーバーの設定情報をJSONとして解析 */
    const authServerConfig: any = await authServerConfigResponse.json();

    /** OAuth2 Client Credentials をBase64エンコードしてBasic認証ヘッダーを準備 */
    const authCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    /** PKCEのcode_verifierをメモリストレージから取得 */
    const codeVerifier = memoryStorage.getCodeVerifier();

    /** 認可コードをアクセストークンに交換するHTTPリクエストを送信 */
    const tokenResponse = await fetch(authServerConfig.token_endpoint, {
      method: 'POST',
      headers: {
        /** OAuth2標準のフォームエンコード形式 */
        'Content-Type': 'application/x-www-form-urlencoded',
        /** RFC 6749に準拠したBasic認証によるクライアント認証 */
        'Authorization': `Basic ${authCredentials}`,
      },
      body: new URLSearchParams({
        /** OAuth2 Authorization Code Grantタイプを指定 */
        grant_type: 'authorization_code',
        /** 認可サーバーから受け取った認可コード */
        code: code,
        /** 認可リクエスト時と同じリダイレクトURI */
        redirect_uri: redirectUri,
        /** アクセスするリソースサーバーのURI（MCPサーバー） */
        resource: 'http://localhost:3000',
        /** PKCEのcode_verifierパラメータ */
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }).toString(),
    });

    /** トークンエンドポイントからのレスポンスエラーをハンドリング */
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    /** トークンレスポンスをJSONとして解析 */
    const tokenData: any = await tokenResponse.json();
    /** レスポンスからアクセストークンを抽出 */
    const accessToken = tokenData.access_token;

    /** アクセストークンの取得確認 */
    if (!accessToken) {
      throw new Error('No access token received');
    }

    /** 取得したアクセストークンを暗号化してメモリストレージに保存 */
    memoryStorage.storeAccessToken(accessToken);

    /** PKCEデータをクリア（セキュリティのため） */
    memoryStorage.clearPKCE();

    console.log('Access token obtained and stored in memory');

    /** 認可成功をユーザーに通知するHTMLレスポンス */
    res.send(`
      <html>
        <body>
          <h1>Authorization Successful</h1>
          <p>Your access token has been obtained and stored securely.</p>
          <p>You can now close this window.</p>
          <p><small>Access token encrypted and stored in memory for this session</small></p>
        </body>
      </html>
    `);

  } catch (error) {
    /** 認可プロセス中の全てのエラーをキャッチしてログ出力 */
    console.error('Authorization failed:', error);

    /** エラーメッセージを安全に抽出 */
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    /** 認可失敗をユーザーに通知するエラーHTMLレスポンス */
    res.status(500).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Failed to obtain access token: ${errorMessage}</p>
          <p>Please try the authorization process again.</p>
          <a href="/">Return to Home</a>
        </body>
      </html>
    `);
  }
});


/** ExpressアプリケーションとポートをエクスポートしてMCPクライアントから利用可能にする */
export { app, port };