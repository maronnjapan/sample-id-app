/**
 * Cloudflare Workers 上で動作する OpenID Provider
 * node-oidc-provider を使用
 *
 * compatibility_date >= 2025-09-01 により node:http サーバーAPIが利用可能
 * Koa アプリを httpServerHandler 経由でそのまま動かせる
 */
import Provider from "oidc-provider";
import { httpServerHandler } from "cloudflare:node";
import { createOidcConfig } from "./oidc-config";
import { addCibaRoutes } from "./ciba-routes";

interface Env {
  OIDC_STORE: KVNamespace;
  ISSUER: string;
}

// Provider インスタンスをキャッシュ
let providerCache: InstanceType<typeof Provider> | null = null;
let cachedIssuer: string | null = null;

function getProvider(env: Env): InstanceType<typeof Provider> {
  const issuer = env.ISSUER || "http://localhost:8787";

  if (providerCache && cachedIssuer === issuer) {
    return providerCache;
  }

  const config = createOidcConfig(env.OIDC_STORE);
  const provider = new Provider(issuer, config);

  // プロキシ設定（Cloudflare の背後で動作するため）
  provider.proxy = true;

  // CIBA コンセントルートを追加
  addCibaRoutes(provider, env.OIDC_STORE);

  // Koa (oidc-provider) を Node.js HTTP サーバーとして起動
  provider.listen(8080);

  // サーバーエラーをログ出力
  provider.on("server_error", (_ctx: unknown, err: unknown) => {
    console.error("[oidc-provider] server_error:", err);
  });

  providerCache = provider;
  cachedIssuer = issuer;

  return provider;
}

const handler = httpServerHandler({ port: 8080 });

export default {
  async fetch(request, env: Env, ctx): Promise<Response> {
    // Provider を初期化（初回のみ）
    getProvider(env);

    // OP（node-oidc-provider）が処理
    return handler.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
