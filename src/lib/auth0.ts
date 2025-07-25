import { SdkError } from "@auth0/nextjs-auth0/errors";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { OnCallbackContext, SessionData } from "@auth0/nextjs-auth0/types";
import { NextResponse } from "next/server";

export const auth0 = new Auth0Client({
    authorizationParameters: {
        /** scopeの設定は任意です。設定がない場合、デフォルトのスコープがアクセストークンに割り当てられます */
        scope: process.env.AUTH0_SCOPE,
        /** audienceは必須です。これがないと、アクセストークンのペイロードが空になります */
        audience: process.env.AUTH0_AUDIENCE,
    },
    onCallback: async (error: SdkError | null, ctx: OnCallbackContext, session: SessionData | null) => {
        console.log('onCallback', ctx);
        console.log('onCallback error', error);
        console.log('onCallback session', session?.tokenSet);
        const startDbscUrl = new URL('/api/start-dbsc-flow', process.env.APP_BASE_URL)
        /** 
         * TODO: 必要な値を渡すこと
         */
        await fetch(startDbscUrl.toString())
        return NextResponse.redirect(
            new URL(ctx.returnTo || "/", process.env.APP_BASE_URL),
        );
    }
});