import { prisma } from "@/prisma";
import { sortUlid } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

export async function GET() {
    const cookieList = await cookies()
    const challenge = randomUUID()

    /** 後続のフローでSec-Session-Responseのpayloadに含まれるjtiと一致するかを確認するためにchallengeをDBに保存する。 */
    await prisma.challenge.create({
        data: {
            challenge
        }
    })

    /** 
     * DBSCが失敗した場合に使用する長期間保持できるCookie 
     * 参考資料(https://developer.chrome.com/docs/web-platform/device-bound-session-credentials?hl=ja#caveats_and_fallback_behavior)
     * ただし、DBSCを進めるために必須のものではない
     * */
    cookieList.set('auth_cookie', 'cookie', {
        domain: 'localhost',
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000,
    })

    /**
     * DBSCを開始するための値
     * 最初に署名に使用する鍵のアルゴリズム
     * pathに署名したトークンを渡すエンドポイントの設定
     * トークンを識別するためのchallenge
     * challengeはデバイスで署名したJWTのjtiに使用される
     * https://w3c.github.io/webappsec-dbsc/#header-sec-session-registration
     */
    const secSessionRegistration = `(ES256 RS256);path="register-dbsc-cookie";challenge="${challenge}"`
    // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
    cookieList.set(sortUlid(), `start DBSC Session \n\r Sec-Session-Registration:${secSessionRegistration}\n\r${(new Date()).toISOString()}`, { path: '/' })


    return NextResponse.json({}, {
        /** DBSCを開始するために、レスポンスに「Sec-Session-Registration」を含める*/
        headers: {
            "Sec-Session-Registration": secSessionRegistration,
        }
    })
}