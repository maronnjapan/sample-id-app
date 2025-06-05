import { prisma } from "@/prisma";
import { InMemoryDB } from "@/storage/in-memory";
import { sortUlid } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const cookieList = await cookies();

    /**
     * 認証Cookieが存在しない場合は、401エラーを返す。
     */
    const authCookie = cookieList.get('auth_cookie');
    if (!authCookie) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const challenge = randomUUID();

    /** 後続のフローでSec-Session-Responseのpayloadに含まれるjtiと一致するかを確認するためにchallengeを保存する。 */
    await InMemoryDB.set(challenge, challenge, { ex: 60 * 5 });

    /**
     * DBSCを開始するための値
     * 最初に署名に使用する鍵のアルゴリズム
     * pathに署名したトークンを渡すエンドポイントの設定
     * トークンを識別するためのchallenge
     * challengeはデバイスで署名したJWTのjtiに使用される
     * https://w3c.github.io/webappsec-dbsc/#header-sec-session-registration
     */
    const secSessionRegistration = `(ES256 RS256);path="register-dbsc-cookie";challenge="${challenge}"`;

    // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
    cookieList.set(sortUlid(), `start DBSC Session \n\r Sec-Session-Registration:${secSessionRegistration}\n\r${(new Date()).toISOString()}`, { path: '/' });

    return NextResponse.json({}, {
        /** DBSCを開始するために、レスポンスに「Sec-Session-Registration」を含める*/
        headers: {
            "Sec-Session-Registration": secSessionRegistration,
        }
    });
}