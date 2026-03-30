import NextAuth from "next-auth";
import Okta from "next-auth/providers/okta";
import { decodeJWTPayload } from "@/lib/token-utils";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Okta({
      clientId: process.env.OKTA_CLIENT_ID || '',
      clientSecret: process.env.OKTA_CLIENT_SECRET || '',
      issuer: process.env.OKTA_DOMAIN || '',
      authorization: {
        params: {
          scope: 'openid profile email',
        },
      },
    }),
  ],
  callbacks: {
    /**
     * JWTコールバック: ID Tokenをサーバー側のJWTに保持する
     * Token ExchangeはAPI routeでauth()経由でサーバー側からのみ読む
     */
    jwt({ token, account }) {
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    /**
     * セッションコールバック
     * - 生ID Tokenはクライアントに露出しない（Token Exchangeはサーバー側で実行）
     * - UI表示用にデコード済みペイロードのみ渡す
     */
    session({ session, token }) {
      if (token.idToken) {
        const payload = decodeJWTPayload(token.idToken as string);
        session.idTokenPayload = payload;
        // トークンの先頭部分のみマスクして表示用に渡す
        session.idTokenPreview = (token.idToken as string).substring(0, 50) + '...';
      }
      return session;
    },
  },
});
