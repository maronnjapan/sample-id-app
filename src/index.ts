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

  // Koa (oidc-provider) を Node.js HTTP サーバーとして起動
  provider.listen(8080);

  providerCache = provider;
  cachedIssuer = issuer;

  return provider;
}

const handler = httpServerHandler({ port: 8080 });

export default {
  async fetch(request, env: Env, ctx): Promise<Response> {
    // Provider を初期化（初回のみ）
    getProvider(env);

    // cloudflare:node の httpServerHandler が
    // Workers の fetch リクエストを node:http サーバーに転送する
    return handler.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
