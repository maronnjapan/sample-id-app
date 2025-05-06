import { prisma } from "@/prisma";
import { base64UrlDecode, getPublicKey, sortUlid, verifySecSessionResponseToken } from "@/util";
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
    const sessionId = randomUUID()
    const publicKey = getPublicKey(payload)

    /** DBに保存されているchallengeと一致するかを確認する */
    /** challengeはデバイスで署名したJWTのjtiに使用される */
    await prisma.challenge.findUniqueOrThrow({
        where: {
            challenge: payloadJson.jti
        }
    })

    /** 
     * DBにセッションIDとそれに紐づく公開鍵を保存する
     * 更新エンドポイントが実行された時、公開鍵が同じものかを検証するために使用
     */
    await prisma.dbscSession.create({
        data: {
            sessionId,
            publicKey
        }
    })

    const cookieList = await cookies()
    /** 
     * 有効期限が短いCookieをセットし直す 
     * 今回は検証しやすいように10秒で設定しているが、仕様に明確な秒数は指定されていない
     * ただし、長すぎるとセキュリティ上の問題があるため、短い時間で設定することが推奨されている
     * */
    cookieList.set('auth_cookie', randomUUID(), {
        maxAge: 10,
        domain: 'localhost',
        sameSite: 'lax',
        path: '/'
    })
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
            "attributes": "Domain=localhost; SameSite=Lax; Path=/"
        }]
    }
    )
}