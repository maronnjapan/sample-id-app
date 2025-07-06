/**
 * MCPクライアントのメインエントリポイント
 * OAuth2 Authorization Code Flowを実装したMCPクライアントとHTTPサーバーを同時に起動する
 */
import { MCPClient } from "./mcp-client";
import { app, port } from "./simple-http-server";

/**
 * メイン関数: MCPクライアントとOAuth2コールバックサーバーを並列で起動
 * 
 * この関数は以下の2つのコンポーネントを同時に起動します:
 * 1. HTTPサーバー: OAuth2認可コールバックを受け取るためのサーバー
 * 2. MCPクライアント: ClaudeとMCPサーバー間のプロキシ
 */
async function main() {
    /** コンソールにMCPクライアントの起動メッセージを出力 */
    console.error('Starting MCP Client...');

    /** 
     * OAuth2認可コールバック用のHTTPサーバーを指定ポートで起動
     * このサーバーは/verifyエンドポイントで認可コードを受け取り、アクセストークンに交換します
     */
    app.listen(port, () => {
        console.log('MCP Client HTTP Server running on http://localhost:' + port);
    })

    /** 
     * MCPクライアントインスタンスを作成し、Claudeからの標準入力監視を開始
     * Claudeが送信するJSON-RPCメッセージを処理し、MCPサーバーとの通信を仲介します
     */
    const proxy = new MCPClient();
    await proxy.start();
}

/**
 * スクリプトが直接実行された場合のmain関数の起動処理
 * require.main === module はNode.jsでスクリプトがメインモジュールとして実行されているかを判定する標準的な方法
 */
if (require.main === module) {
    /** main関数を実行し、エラーが発生した場合はコンソールにエラーを出力 */
    main().catch(console.error);
}