#!/usr/bin/env node

/**
 * MCPサーバーへのHTTP通信を担当するリポジトリクラス
 * JSON-RPC 2.0プロトコルでMCPサーバーと通信するための抽象化レイヤー
 */
class SendServerRepository {
  /** MCPサーバーのURL */
  private serverUrl: string;
  /** JSON-RPCリクエストの連番カウンタ（ユニークID生成用） */
  private requestId: number = 1;

  /**
   * SendServerRepositoryのコンストラクタ
   * @param serverUrl MCPサーバーのURL（デフォルト: http://localhost:3000）
   */
  constructor(serverUrl: string = "http://localhost:3000") {
    this.serverUrl = serverUrl;
  }

  /**
   * MCPサーバーにJSON-RPCリクエストを送信する
   * @param method 呼び出すMCPメソッド名（例: "tools/call", "initialize"）
   * @param params メソッドに渡すパラメータ（デフォルト: {}）
   * @param headers 追加のHTTPヘッダー（Authorizationヘッダー等）
   * @returns MCPサーバーからのHTTPレスポンス
   */
  async makeRequest(method: string, params: any = {}, headers?: RequestInit['headers']): Promise<Response> {
    /** JSON-RPC 2.0プロトコルに準拠したリクエストオブジェクトを構築 */
    const request = {
      /** JSON-RPCバージョン */
      jsonrpc: "2.0",
      /** ユニークなリクエストID（レスポンスとのマッチング用） */
      id: this.requestId++,
      /** 呼び出すMCPメソッド名 */
      method,
      /** メソッドパラメータ */
      params,
    };

    /** MCPサーバーの/mcpエンドポイントにPOSTリクエストを送信 */
    const response = await fetch(`${this.serverUrl}/mcp`, {
      method: "POST",
      headers: { 
        /** JSONコンテントタイプを指定 */
        "Content-Type": "application/json", 
        /** 追加ヘッダー（Authorization等）をマージ */
        ...(headers ?? {}) 
      },
      /** リクエストオブジェクトをJSON文字列にシリアライズ */
      body: JSON.stringify(request),
    });

    /** レスポンスオブジェクトを返す（ステータスコードやヘッダーの確認は呼び出し元で実行） */
    return response
  }
}

/** SendServerRepositoryクラスをエクスポートしてMCPクライアントから利用可能にする */
export { SendServerRepository };