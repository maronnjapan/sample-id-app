/**
 * oidc-provider の設定
 */
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Configuration } from "oidc-provider";
import { KvAdapter } from "./kv-adapter";

/**
 * OIDC Provider の設定を生成
 */
export function createOidcConfig(kv: KVNamespace): Configuration {
  return {
    // KVアダプター
    adapter: (name: string) => new KvAdapter(name, kv),

    // クライアント定義（サンプル）
    clients: [
      {
        client_id: "sample-client",
        client_secret: "sample-client-secret",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["http://localhost:3000/callback"],
        response_types: ["code" as const],
        scope: "openid profile email",
        token_endpoint_auth_method:
          "client_secret_basic" as const,
      },
    ],

    // Cookie のセキュリティキー
    cookies: {
      keys: ["secret-key-1", "secret-key-2"],
    },

    // JWKS（署名用の鍵ペア）
    // 本番環境では適切な鍵を生成して使用してください
    jwks: {
      keys: [
        {
          kty: "RSA",
          kid: "signing-key-1",
          use: "sig",
          alg: "RS256",
          // 以下は開発用のサンプル鍵です。本番では適切な鍵を使用してください。
          n: "oBGicO6mJIUjM79KxXd3wM6NBcip_9hVVceLAYfB4Rb-QRxa4H4mdRl2jCQGcMhOwNjs7Kgiknt1pNawQMy2FpUWSIn4IsFINtG07zDK1lHPnfBZoS4oQ5-7X7uN1CuGVxYD8kjBPzK0kqL_X-jqWg2Z8bK_k3TsXW1mS-gZ0rVYXLb4UY8mutKAcm0bGJ_bgawQNQTp8oeht82gYAcNRXX9ujmFAGOvJhJazNENqTPicmbpAc2VvDYJk1qeuVWZzaRoQQiwMuNDz0Lv1yf6G7jDR8VbCbaxf5cMzrEPDd5qD4u4WUS6EPYLyYSDg_0Gy98UVMsEXAI9IEzNaRoU8Q",
          e: "AQAB",
          d: "FOJiy1FCeWlVhR7kO-IGdzAmfiaxkiFA9lwpQB3c_JKUwcdX-V-m14hm9d84EpGlP3a4vXfXwDzoxdpXogdo39wRIuMSw5YW50VyfJ1lGZQQU-RUDWTe-VO8jWpZwDZIOicz2fIGz0lnqJTTtPPH_8_efLEnBa-FAfuQE-nzKeaCMcapadgUmUE9bNiiqlOwHDGemKNOZvGLP0A3AVqMljYrvZWCb3kbcbQuKj1PI3d1RDCZRfxpZ68mzagn7AzM17d38gIHGhk1X-ROOPM1tgp9a7sPX_9Dz24MqxKRmQAhrkaaa-3msaH_-2h-UY7xwyCFHX7edshhYfTO93lUcQ",
          p: "3M2lTUZroxpBeshSQBb5gdyHHRsd-Mank4PNYIldTppUWLfGKqzUlD2F8lVe034-CiySOmB8LWoYUs2dNKZJp6ar4nIqViwj96Md6ajX7FN4pubYtvlYL6rIBS1V3h-aMEKewziUuIqSyAJQZ7D-YHOacGCevByjcGD3v5GXbwc",
          q: "uZWXD75o5mL02-MB67k_DAGf5WvWrxQBXLMoqNuvrK6kPaB9-H7ifPwetv6WZHVpRLP9twP8rYmL-bE2eydNyQ9oyOhRUygR_EMB_euGgN71UaTP4tg-dUGINfFL9kNILWS6jxlVMRUTvOPPqTILNGTk3iKZYb8GkvRmEmJW5kc",
          dp: "Tqw7RMBdo7y8LfpoTAujlSC1R6qc0EI__TCOIeJvy4zzlrTMN_Jiv_r32fOPGP43LrrY01IDjM7rob0_UT4aqlCZl9KjwRZzLk4BX3rYjIzlRVqlRvSq9jj8kdOob7-E2cMy_E4Rt3swd3FTos6OpGEsWvQiOtZdabIzNB-0_Es",
          dq: "goBLormNwHxTnRBLuHwidonp64ViiOjzcEFX1S3uoeqI-gEStBxdnfAYlSv_i5L4vGQphHncRBfWA3Z3TjC8RSd90tFy5pvl0dM44lqt0Y93SLsxqF3RxdiYNP6CISD871bGzXvN6V7d61TzIRJcyLIuMnp4C0EuGUadRE48t18",
          qi: "hAoC6ASFx0-9dEBAIhr2Z2vbXxZwO6xoCjC3_x8aq0CjC06mHrDnaSBN8l9AwcOcT08CQQ-s5S8u9zFbk4GWtIfDPys87yaNGsWosOOmAH1eYlFkxT6Ys_VJ1o8e2Z01VEJG4rkvCsAnqTcfVaQ-oYUuHncr_JWP3vZMO6_Nbjk",
        },
      ],
    },

    // 対話（ログイン画面等）の設定
    interactions: {
      url: (_ctx: unknown, interaction: { uid: string }) => {
        return `/interaction/${interaction.uid}`;
      },
    },

    // クレーム設定
    claims: {
      openid: ["sub"],
      profile: ["name", "family_name", "given_name", "nickname", "preferred_username", "updated_at"],
      email: ["email", "email_verified"],
    },

    // スコープ設定
    scopes: ["openid", "profile", "email", "offline_access"],

    // エラー発生時にJSON形式で返す（デバッグ用）
    renderError: async (ctx, out, error) => {
      console.error("oidc-provider error:", error);
      ctx.type = "application/json";
      ctx.body = JSON.stringify({
        error: out.error,
        error_description: out.error_description,
      });
    },

    // 有効にする機能
    features: {
      devInteractions: { enabled: true },

      // リソースインジケーターの設定（RFC 8707） - クライアントがトークン発行時にリソースサーバーを指定できるようにする
      // resourceIndicators: {
      //   enabled: true,
      //   useGrantedResource: () => true,
      //   getResourceServerInfo: (ctx, resourceIndicator, client) => {
      //     console.log("Resource Indicator requested:", resourceIndicator);
      //     return {
      //       audience: resourceIndicator,
      //       scope: "openid profile email",
      //       accessTokenFormat: "jwt" as const,
      //     }
      //   },
      // },
    },

    // トークンの有効期限
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 600,
      IdToken: 3600,
      RefreshToken: 1209600,
      Session: 1209600,
      Interaction: 600,
      Grant: 1209600,
    },

    // ユーザー情報取得のコールバック
    findAccount: async (_ctx: unknown, id: string) => {
      return {
        accountId: id,
        claims: async () => ({
          sub: id,
          name: "Sample User",
          email: "user@example.com",
          email_verified: true,
        }),
      };
    },
  };
}
