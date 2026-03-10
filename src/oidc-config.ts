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
        redirect_uris: ["https://example.com/callback"],
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
          e: "AQAB",
          n: "wAR7gpvDJx2nkFRwVTf0ZBMOuU2L5joNRF9JBJtufkEW1LDrC3GBOthItRkpFfPtX8wEd4GvYVzDpLAjwJoW_tHNC1JeGDj8dGPzCDm1GISLuMB5W4WMV_FzGLjQPhX5mn3F9bJP_YDUMTzJKXG7HfADbtXpVVQ1_jx6kHfFkOkfGnGNxE1sBzfEwq8mP7z_bY4qgFPJGjuVNPMiCz5SZ-EJz6EVuEfUJi7POnLgPwUgSsYOp5oJhnsl8BBEsqjMPIXPdSW0qqMjfHkrI1zSpPW3yLRHSxjdm0fNxGNpQm0OyaKfqBnpJCPGx9RlWFJhYMVoRlnMz5PxbxVPnTh7w",
          d: "DArT0MaWVE5p9JR2kT6BClYzX7OC5gGYBN9iSoKbdDEgSzKQTXPnkHc5q3p5FAlFCrmyoBdeh32jTS3fOS9j1CYCq7bUWAFAjV7lXGPceLX2mq2l1GnXNh5PN7W1rxLmKJU7UuIVnqQCN-mfM6p_FOFma0iiYtV_7jKpPhs7DEZ9Ej0wMKfJx7CL0sX7BeOpaA5YrFUCNg-g2Dh4S_gPevVnhVS8m-ECM0YKPxXO7sXuRSH9dK4GnMXCr7BCKj2qPIJOHTIcHrKi_sYEP1V6GBJOx4d0k7T_NBqe7PvPR_hTnIz2CrNqiYsfU5DqDpJHy3M08RPqAW8DJFWJDuMXAQ",
          p: "7bM0V3_nL3gV5YBb8W1IIoL02JXJPmsfXJr1G_r-iE5bJ3ycPHmHHR_3Ofd8VyoI8f5yW0P3LP2m_TVKrFPa75nXj_a9Tixw8Nv-Z6bH8tOy4j_F6E1oiClLhGTkWJhzD0a-5-pjdv7UKBj-YJhk6RNhtYNrz8MQV1BUjMhEc",
          q: "z6TBuWlSlGHw6oc3PFsnz1ORUE8Dt3dVSU-AHpW8C6Kz1h6U_EPfL1tGMu7DP9Dfee-KRz2Xp0zMfV1CQ7tP3LqHi8gg9PO-k-qG1CAXijb6RrJ9qJ4TP_Hj_PH20SFCxchW5blRDUtLXU9VVy7v1Zp9twFjUVpIr02QjdpkJw",
          dp: "6MGkr8GPayGNV5x_RLmA5cSQr7YJnG1s8EjF3NkxrN2C13FjYwUCJv2F4TX4I5nccWNqH6P_S0lMfN-CLPTzFy5Lv2iB_Cjmwz4fOS_xjSqNYqy1n_mBfJNzqL-5MdQsP35Mi0SUbiph6hSRZxwCfABp63KPGK0kCPJE5d5bh0",
          dq: "E_0hbMwoeC2NPNEBhLP5TxVwi8VbDr40oqC0RXX_3BGQ_A8g-HRz10SRxqF30vz6dR_6hbfH3nGBZtptxMSUPYKvFcxkhR2ohacOxPyhnOBVUyAeZ4JIPaJk0cR6tRVaoy5JLoqe9uV42s0YaXbEEYpEq3FLHC2nTiKGqwA-i4E",
          qi: "LNVP4YJNvyMOM4yyfc6PgU2B-l9H6kIkTbTn04G3YJEsdm1i3V0fXsjC8XjPZQp_NJkER3pJn9K4ykmUUBm9i1f9WCN1UH0o-YYRnk-Xl36TnMf0w0-_2jGJR0cgxm4VRQ_slpCrNTqp3pHK1yzyPWSsgVBH1URZbK1PvOliXc",
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

    // 有効にする機能
    features: {
      devInteractions: { enabled: true },
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
