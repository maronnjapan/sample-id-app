
import { SendServerRepository } from './send-server-repository';
import { exec } from 'child_process';
import fs from 'fs';
import { SystemKeyring } from './system-keyring';

export const CODE_FILE = '/tmp/temp-code.txt';
const keyring = new SystemKeyring();


interface MCPRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: any;
}

export const createCodePromise = (): Promise<string> => {
  return new Promise<string>(async (resolve) => {
    const checkCode = async () => {
      // システムキーリングから取得を試行
      try {
        const code = await keyring.retrieve();
        if (code) {
          resolve(code);
          return;
        }
      } catch (error) {
        console.error('Keyring retrieval error:', error);
      }

      // フォールバック: ファイルベース
      if (fs.existsSync(CODE_FILE)) {
        try {
          const code = fs.readFileSync(CODE_FILE, 'utf8');
          fs.unlinkSync(CODE_FILE);
          resolve(code);
        } catch (error) {
          console.error('File retrieval error:', error);
          setTimeout(checkCode, 100);
        }
      } else {
        setTimeout(checkCode, 100);
      }
    };
    checkCode();
  });
};

/**
 * MCPクライアントクラス
 * Claudeとのやり取りを行うためのクライアント
 * 標準入力からのデータを受け取り、MCPサーバーにリクエストを送信する
 * また、MCPサーバーからのレスポンスを標準出力に出力する
 * Claude⇔MCPサーバーではAuthorization Codeフローを実装するのが難しかったため、プロキシ的な役割としてこのMCPクライアントを作成した
 */
export class MCPClient {
  private httpClient: SendServerRepository;

  constructor(serverUrl: string = "http://localhost:3000") {
    this.httpClient = new SendServerRepository(serverUrl);
  }

  async start() {
    /**
     * 標準入力を受け入れるようにしている。
     * また、データが入力されると、MCPサーバーへのリクエストを実行する
     */
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data) => {
      this.handleStdinData(data.toString());
    });
  }

  private async handleStdinData(data: string) {
    const lines = data.trim().split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      try {
        const request = JSON.parse(line);
        const response = await this.handleMCPRequest(request);
        console.log(JSON.stringify(response));
      } catch (error) {
        console.error('Error processing line:', error);
      }
    }
  }

  private async handleMCPRequest(request: MCPRequest, token?: string): Promise<MCPResponse> {
    const response = await this.httpClient.makeRequest(request.method, request.params,
      token ? { 'Authorization': `Bearer ${token}` } : undefined
    );

    const wwwAuthenticateHeader = response.headers.get('www-authenticate');

    if (!response.ok && response.status === 401 && wwwAuthenticateHeader) {
      const resourceMetadata = wwwAuthenticateHeader.match(/Bearer\s+resource_metadata="([^"]+)"/);

      if (resourceMetadata) {
        const resourceMetadataUrl = resourceMetadata[1];

        const metadataResponse = await fetch(resourceMetadataUrl);

        if (!metadataResponse.ok) {
          throw new Error(`Failed to fetch resource metadata: ${metadataResponse.statusText}`);
        }

        const metadataJson: any = await metadataResponse.json();

        const authorizationServerUrl = metadataJson.authorization_servers[0];
        if (!authorizationServerUrl) {
          throw new Error('No authorization servers found in resource metadata');
        }

        /** Step 1: 認可サーバーの設定情報を取得 */
        const authServerConfigUrl = `${authorizationServerUrl}/.well-known/oauth-authorization-server`;
        const authServerConfigResponse = await fetch(authServerConfigUrl);

        if (!authServerConfigResponse.ok) {
          throw new Error(`Failed to fetch auth server config: ${authServerConfigResponse.statusText}`);
        }

        const authServerConfig: any = await authServerConfigResponse.json();
        console.error('Auth server config:', authServerConfig);

        /** Step 2: Authorization Code フローのためのパラメータを準備 */
        const clientId = 'HwzAbaqWl8ly4aypuQNBej7uuwQcfyNQ';
        const clientSecret = '7LHoaT41RMWY9Y8ISDhLrtQONnB9bCxXVMMRTDovSaBrhoLzMAKbh_oc053APd5j';
        const redirectUri = 'http://localhost:8000/verify';
        const scope = 'openid profile';
        const state = Math.random().toString(36).substring(2, 15);

        /** Step 3: 認可URLを構築 */
        const authUrl = new URL(authServerConfig.authorization_endpoint);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('audience', 'http://localhost:3000');

        /** Step 4: ブラウザで認可画面を開く */
        await this.openBrowserAndConfirm(authUrl.toString());

        /** Step 5: 認可コードを取得 */
        const authorizationCode = await createCodePromise();

        /** Step 6: 認可コードをアクセストークンに交換 */

        /** Basic認証用のクライアント認証情報を準備 */
        const authCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const tokenResponse = await fetch(authServerConfig.token_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authCredentials}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: redirectUri,
            resource: 'http://localhost:3000',
          }).toString(),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
        }

        const tokenData: any = await tokenResponse.json();

        const accessToken = tokenData.access_token;

        /** Step 7: アクセストークンを使ってMCPサーバーにリクエスト */
        return this.handleMCPRequest(request, accessToken);
      }
    }

    const json: any = await response.json();

    if (json.error) {
      throw new Error(`MCP error: ${json.error.message}`);
    }

    const result = json.result;

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: result
    };
  }

  private async openBrowserAndConfirm(url: string): Promise<void> {
    return new Promise((resolve) => {
      let command = '';

      if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
        command = `powershell.exe -Command "Start-Process '${url}'"`;
      } else if (process.platform === 'darwin') {
        command = `open "${url}"`;
      } else if (process.platform === 'win32') {
        command = `start "" "${url}"`;
      } else {
        command = `xdg-open "${url}"`;
      }

      exec(command, () => {
        resolve();
      });
    });
  }
}