import { InMemoryDB } from "@/storage/in-memory";
import { SdkError } from "@auth0/nextjs-auth0/errors";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { OnCallbackContext, SessionData } from "@auth0/nextjs-auth0/types";
import { NextResponse } from "next/server";
import { sortUlid } from "@/util";
import { cookies } from "next/headers";

export const auth0 = new Auth0Client({
    authorizationParameters: {
        /** scopeの設定は任意です。設定がない場合、デフォルトのスコープがアクセストークンに割り当てられます */
        scope: process.env.AUTH0_SCOPE,
        /** audienceは必須です。これがないと、アクセストークンのペイロードが空になります */
        audience: process.env.AUTH0_AUDIENCE,
    },
    onCallback: async (error: SdkError | null, ctx: OnCallbackContext, session: SessionData | null) => {
        if (error || !session || !session.tokenSet) {
            return NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401, statusText: 'Unauthorized' }
            );
        }

        const challenge = crypto.randomUUID()
        const authorization = crypto.randomUUID()

        /** 後続のフローでSec-Session-Responseのpayloadに含まれるjtiと一致するかを確認するためにchallengeを保存する。 */
        await InMemoryDB.set(challenge, challenge, { ex: 60 * 5 });

        /** 後続のフローで、DBSCのauthorizationからトークンを取得するために保存しておく */
        await InMemoryDB.set(authorization, JSON.stringify(session.tokenSet), { ex: 60 * 5 })

        /**
         * DBSCを開始するための値
         * 最初に署名に使用する鍵のアルゴリズム
         * pathに署名したトークンを渡すエンドポイントの設定
         * トークンを識別するためのchallenge
         * challengeはデバイスで署名したJWTのjtiに使用される
         * https://w3c.github.io/webappsec-dbsc/#header-sec-session-registration
         */
        const secSessionRegistration = `(ES256 RS256);path="/api/register-dbsc-cookie";challenge="${challenge}";authorization="${authorization}"`;

        const cookieKey = sortUlid();
        return NextResponse.redirect(
            new URL(ctx.returnTo + `?cookieKey=${cookieKey}` || "/", process.env.APP_BASE_URL),
            {
                headers: {
                    "Sec-Session-Registration": secSessionRegistration,
                    /** このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。 */
                    "Set-Cookie": `${cookieKey}=${encodeURIComponent(`start DBSC Session  Sec-Session-Registration:${secSessionRegistration}${(new Date()).toISOString()}`)}; Path=/; Domain=localhost; `
                },

            }
        );

    }
});