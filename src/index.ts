/**
 * Cloudflare Workers 上で動作する OpenID Provider
 * node-oidc-provider を使用
 */
import Provider from "oidc-provider";
import { createOidcConfig } from "./oidc-config";
import { toNodeRequest, captureNodeResponse } from "./node-http-bridge";

interface Env {
  OIDC_STORE: KVNamespace;
  ISSUER: string;
}

// Provider インスタンスをキャッシュ
let providerCache: InstanceType<typeof Provider> | null = null;
let cachedIssuer: string | null = null;

function getProvider(env: Env): InstanceType<typeof Provider> {
  const issuer = env.ISSUER || "https://oidc-provider.example.com";

  if (providerCache && cachedIssuer === issuer) {
    return providerCache;
  }

  const config = createOidcConfig(env.OIDC_STORE);
  const provider = new Provider(issuer, config);

  // プロキシ設定（Cloudflare の背後で動作するため）
  provider.proxy = true;

  providerCache = provider;
  cachedIssuer = issuer;

  return provider;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const provider = getProvider(env);

      // Koa の callback ハンドラを取得
      const handler = provider.callback();

      // Workers の Request を Node.js の IncomingMessage に変換
      const nodeReq = toNodeRequest(request);

      // ServerResponse をキャプチャ
      const { res: nodeRes, responsePromise } = captureNodeResponse(nodeReq);

      // oidc-provider (Koa) にリクエストを処理させる
      handler(nodeReq, nodeRes);

      // レスポンスが完了するまで待つ
      const response = await responsePromise;

      return response;
    } catch (error) {
      console.error("OIDC Provider error:", error);
      return new Response(
        JSON.stringify({
          error: "server_error",
          error_description: "An internal server error occurred",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
