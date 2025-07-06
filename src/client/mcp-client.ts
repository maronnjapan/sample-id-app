/**
 * MCP (Model Context Protocol) クライアントのメイン実装
 * Claude と MCPサーバー間のプロキシとして動作し、OAuth2 Authorization Code Flowを実装
 */
import { SendServerRepository } from './send-server-repository';
import { exec } from 'child_process';
import { MemoryStorage } from './memory-storage';
import dotenv from 'dotenv';

/** 環境変数の読み込み */
dotenv.config();

/** インメモリストレージのシングルトンインスタンス */
const memoryStorage = MemoryStorage.getInstance();


/**
 * MCP (Model Context Protocol) リクエストのデータ構造
 * JSON-RPC 2.0 プロトコルに準拠
 */
interface MCPRequest {
  /** JSON-RPCバージョン（必ず "2.0" である必要がある） */
  jsonrpc: string;
  /** リクエストを一意に識別するID */
  id: number | string;
  /** 呼び出すMCPメソッド名（例: "tools/call", "initialize"） */
  method: string;
  /** メソッドに渡すパラメータ（オプション） */
  params?: any;
}

/**
 * MCP (Model Context Protocol) レスポンスのデータ構造
 * JSON-RPC 2.0 プロトコルに準拠
 */
interface MCPResponse {
  /** JSON-RPCバージョン（必ず "2.0" である必要がある） */
  jsonrpc: string;
  /** リクエストと対応するID */
  id: number | string | null;
  /** 成功時のレスポンスデータ（オプション） */
  result?: any;
  /** エラー時のエラー情報（オプション） */
  error?: any;
}

/**
 * MCP (Model Context Protocol) クライアントクラス
 * 
 * このクラスは以下の主要な機能を提供します:
 * 
 * 1. **Claude とのインターフェース**:
 *    - 標準入力(stdin)からClaudeのJSON-RPCリクエストを受信
 *    - 標準出力(stdout)にMCPサーバーのレスポンスを送信
 * 
 * 2. **OAuth2 Authorization Code Flow の自動化**:
 *    - MCPサーバーから401 Unauthorizedを受信時に認可フローを自動開始
 *    - ブラウザを自動起動してユーザー認証を実行
 *    - 取得したアクセストークンでリトライを実行
 * 
 * 3. **プロキシ機能**:
 *    Claude が直接MCPサーバーとOAuth2フローを実行するのは技術的に困難なため、
 *    このクライアントがOAuthにおけるクライアントとしての役割を代行します。
 */
export class MCPClient {
  /** MCPサーバーへのHTTP通信を担当するリポジトリ */
  private httpClient: SendServerRepository;

  /**
   * MCPクライアントのコンストラクタ
   * @param serverUrl MCPサーバーのURL（デフォルト: http://localhost:3000）
   */
  constructor(serverUrl: string = "http://localhost:3000") {
    this.httpClient = new SendServerRepository(serverUrl);
  }

  /**
   * MCPクライアントのメインループを開始
   * Claude からの標準入力を監視し、JSON-RPCメッセージを処理する
   */
  async start() {
    /**
     * 標準入力のUTF-8エンコーディングを設定
     * Claudeからの日本語メッセージも正しく処理できるようにする
     */
    process.stdin.setEncoding('utf8');
    /**
     * 標準入力からデータを受信した時のイベントリスナーを登録
     * Claudeが送信してくJSON-RPCリクエストを非同期で処理する
     */
    process.stdin.on('data', (data) => {
      this.handleStdinData(data.toString()).then((response) => {
        process.stdout.write(response.map(r => JSON.stringify(r)).join('\n') + '\n');
      }).catch((error) => {
        console.error('Error handling stdin data:', error);
        /** エラーが発生した場合はエラーレスポンスを標準出力に書き込む */
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      })
    });
  }

  /**
   * 標準入力から受信したデータを処理する
   * 複数行のJSON-RPCメッセージが含まれる可能性を考慮して各行を個別に処理
   * @param data Claudeから受信した文字列データ
   */
  private async handleStdinData(data: string) {
    /** 改行文字で分割し、空行を除去して個別のJSONメッセージを抽出 */
    const lines = data.trim().split('\n').filter(line => line.trim() !== '');
    const mcpResponses: MCPResponse[] = [];

    /** 各JSON-RPCメッセージを順次処理 */
    for (const line of lines) {
      try {
        /** JSON文字列をMCPRequestオブジェクトにパース */
        const request = JSON.parse(line);
        /** MCPリクエストを処理してレスポンスを取得 */
        mcpResponses.push(await this.handleMCPRequest(request))

      } catch (error) {
        /** JSONパースエラーや処理エラーをログ出力 */
        console.error('Error processing line:', error);
      }
    }

    return mcpResponses;
  }

  /**
   * MCPリクエストを処理し、必要に応じてOAuth2認可フローを実行するメインロジック
   * @param request ClaudeからのJSON-RPCリクエスト
   * @param token オプションのアクセストークン（リトライ時に使用）
   * @returns MCPサーバーからのレスポンス
   */
  private async handleMCPRequest(request: MCPRequest, token?: string): Promise<MCPResponse> {
    /** アクセストークンの取得: パラメータかメモリキャッシュから */
    let accessToken = token;
    if (!accessToken) {
      /** メモリストレージから保存済みのアクセストークンを取得 */
      const cachedToken = memoryStorage.getAccessToken();
      if (cachedToken) {
        accessToken = cachedToken;
        console.log('Using cached access token from memory');
      }
    }

    /** MCPサーバーにHTTPリクエストを送信（アクセストークンがある場合はBearerトークンで認証） */
    const response = await this.httpClient.makeRequest(request.method, request.params,
      accessToken ? { 'Authorization': `Bearer ${accessToken}` } : undefined
    );

    /** OAuth2リソースサーバーからのWWW-Authenticateヘッダーを取得 */
    const wwwAuthenticateHeader = response.headers.get('www-authenticate');

    /** 401 Unauthorized でWWW-Authenticateヘッダーがある場合はOAuth2認可フローを開始 */
    if (!response.ok && response.status === 401 && wwwAuthenticateHeader) {
      /** WWW-AuthenticateヘッダーからリソースメタデータのURLを正規表現で抽出 */
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
        const clientId = process.env.CLIENT_ID || '';
        const redirectUri = 'http://localhost:8000/verify';
        const scope = 'openid profile';
        const state = Math.random().toString(36).substring(2, 15);

        // stateパラメータをメモリに保存
        memoryStorage.storeState(state);

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

        /** Step 5: アクセストークンが取得されるまで待機 */
        const waitForToken = (): Promise<string> => {
          return new Promise((resolve, reject) => {
            const checkToken = () => {
              const token = memoryStorage.getAccessToken();
              if (token) {
                resolve(token);
                return;
              }
              setTimeout(checkToken, 100);
            };
            checkToken();

            // 30秒でタイムアウト
            setTimeout(() => {
              reject(new Error('Timeout waiting for access token'));
            }, 30000);
          });
        };

        const accessToken = await waitForToken();

        /** Step 6: アクセストークンを使ってMCPサーバーにリクエスト */
        return await this.handleMCPRequest(request, accessToken);
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