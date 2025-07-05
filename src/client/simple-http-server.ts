import express from "express";
import { Request, Response } from "express";
import { MemoryStorage } from './memory-storage';

const app = express();
const port = process.env.CLIENT_PORT || 8000;

app.use(express.json());

const memoryStorage = MemoryStorage.getInstance();

/**
 * 認可サーバーから認可コードを受け取り、アクセストークンに交換してメモリに保存するエンドポイント
 */
app.get("/verify", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

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

  try {
    console.log('Received authorization code, exchanging for access token...');

    // OAuth設定
    const clientId = 'HwzAbaqWl8ly4aypuQNBej7uuwQcfyNQ';
    const clientSecret = '7LHoaT41RMWY9Y8ISDhLrtQONnB9bCxXVMMRTDovSaBrhoLzMAKbh_oc053APd5j';
    const redirectUri = 'http://localhost:8000/verify';
    const authorizationServerUrl = 'https://mcp-authorization-server.jp.auth0.com';

    // 認可サーバー設定を取得
    const authServerConfigUrl = `${authorizationServerUrl}/.well-known/oauth-authorization-server`;
    const authServerConfigResponse = await fetch(authServerConfigUrl);

    if (!authServerConfigResponse.ok) {
      throw new Error(`Failed to fetch auth server config: ${authServerConfigResponse.statusText}`);
    }

    const authServerConfig: any = await authServerConfigResponse.json();

    // Basic認証用のクライアント認証情報を準備
    const authCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // アクセストークンリクエスト
    const tokenResponse = await fetch(authServerConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authCredentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        resource: 'http://localhost:3000',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData: any = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // アクセストークンをメモリに保存
    memoryStorage.storeAccessToken(accessToken);
    console.log('Access token obtained and stored in memory');

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
    console.error('Authorization failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
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


export { app, port };