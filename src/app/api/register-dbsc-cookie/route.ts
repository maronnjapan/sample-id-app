import { prisma } from "@/prisma";
import { InMemoryDB } from "@/storage/in-memory";
import { base64UrlDecode, getPublicKey, sortUlid, verifySecSessionResponseToken } from "@/util";
import { SessionData } from "@auth0/nextjs-auth0/types";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
    /** 公開鍵やチャレンジの値を含むJWSが設定されているヘッダーから値を取得 */
    const token = req.headers.get("Sec-Session-Response")
    if (!token) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    /** トークン内の公開鍵を使用して、署名を検証する */
    const isValidPublicKey = await verifySecSessionResponseToken(token)
    if (!isValidPublicKey) {
        /** 署名が無効な場合は401エラーとする */
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    const [_, payload] = token.split('.')
    const payloadJson = JSON.parse(base64UrlDecode(payload))
    const publicKey = getPublicKey(payload)

    /** インメモリDBに保存されているchallengeと一致するかを確認する */
    /** challengeはデバイスで署名したJWTのjtiに使用される */
    const isSameChallenge = await InMemoryDB.exists(payloadJson.jti)
    if (!isSameChallenge) {
        /** challengeが一致しない場合は401エラーとする */
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    const cookieList = await cookies()

    /**
     * 認証した時に設定されたIDトークンが存在するかを確認
     * 存在しない場合は401エラーを返す
     */
    const authorization = payloadJson.authorization;
    const authorizationValue = await InMemoryDB.get(authorization)
    if (!authorization || !authorizationValue) {
        return NextResponse.json(JSON.stringify({ message: 'No ID token' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    const authorizationObj = JSON.parse(JSON.stringify(authorizationValue)) as SessionData['tokenSet']


    const sessionId = randomUUID()

    /** 
     * DBにセッションIDとそれに紐づく公開鍵を保存する
     * 更新エンドポイントが実行された時、公開鍵が同じものかを検証するために使用
     */
    await prisma.dbscSession.upsert({
        where: {
            sessionId
        },
        update: {
            publicKey
        },
        create: {
            sessionId,
            publicKey
        }
    })

    /** 
  * 有効期限が短いCookieをセットし直す 
  * 今回は検証しやすいように10秒で設定しているが、仕様に明確な秒数は指定されていない
  * ただし、長すぎるとセキュリティ上の問題があるため、短い時間で設定することが推奨されている
  * */
    const newCookieValue = randomUUID();
    cookieList.set('auth_cookie', newCookieValue, {
        maxAge: 10,
        sameSite: 'lax',
        path: '/'
    })

    /** 
     * 新しいCookieの値をInMemoryDBに保存
     * Device Bound Session Credentialsで発行したsession IDとユーザーIDを紐づけて保存
     * ただ、session identifierが更新のタイミングでしか取得できない。
     * そのため、Cookieの値をキーにして、session identifierを取り出せるようにする
     * 以上より、Cookie→ session identifier → user ID の順で紐づける
     * また、本来はCookieとSession Identifierの紐づけは更新のタイミングで明示的に削除を行うべきである。
     * しかし、今回はそこまでの実装は行わないので、15秒で有効期限を設定していて無効化の対応をしている
     */
    await InMemoryDB.set(newCookieValue, sessionId, { ex: 15 });
    await InMemoryDB.set(sessionId, JSON.stringify(
        { accessToken: authorizationObj.accessToken, refreshToken: authorizationObj.refreshToken }
    ), { ex: 60 * 60 * 24 * 30 });

    /** このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。 */
    cookieList.set(sortUlid(), `Register DBSC Session \n\r Sec-Session-Response:${token}\n\r${(new Date()).toISOString()}`, { path: '/' })

    return NextResponse.json({
        "session_identifier": sessionId,
        /** セッションを更新する際にブラウザが実行するエンドポイントを設定 */
        "refresh_url": "/api/refresh-dbsc-cookie",
        "scope": {
            "origin": "http://localhost:3000",
            "include_site": true,
            "scope_specification": [
            ]
        },
        "credentials": [{
            "type": "cookie",
            "name": "auth_cookie",
            "attributes": "SameSite=Lax; Path=/"
        }]
    }
    )
}