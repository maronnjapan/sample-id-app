import { base64UrlDecode, sortUlid, verifySecSessionResponseToken, getPublicKey } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/prisma";
import { InMemoryDB } from "@/storage/in-memory";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const token = req.headers.get("Sec-Session-Response")
    const sessionId = req.headers.get("Sec-Session-Id")
    const cookieList = await cookies()

    if (!sessionId) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    if (!token) {
        const challengeValue = randomUUID()
        const challenge = `"${challengeValue}";id="${sessionId}"`
        /**
         * 更新エンドポイントはリトライされるのが前提
         * リトライされたタイミングで、チャレンジの一致を検証するために保存
         */
        await InMemoryDB.set(challengeValue, challengeValue, { ex: 60 * 5 });
        // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
        cookieList.set(sortUlid(), `Refresh DBSC Session Start \n\r Sec-Session-Challenge:${challenge}\n\r${(new Date()).toISOString()}`, { path: '/' })

        /**
         * 2025/05/05時点では、401エラーがリトライのトリガーになる
         * が、リトライのトリガーが401エラーから403エラーに変更となるプルリクエストがマージされている
         * https://github.com/w3c/webappsec-dbsc/pull/141
         * なので、将来的には403エラーを返すようにしないと動かなくなる可能性がある
         */
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
            headers: {
                "Sec-Session-Challenge": challenge,
            }
        })
    }

    /** トークン内の公開鍵を使用して、署名を検証する */
    const isValidPublicKey = await verifySecSessionResponseToken(token)
    if (!isValidPublicKey) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    const [_, payload] = token.split('.')
    const publicKey = getPublicKey(payload)
    const payloadJson = JSON.parse(base64UrlDecode(payload))

    const isSameChallenge = await InMemoryDB.exists(payloadJson.jti)
    if (!isSameChallenge) {
        /** challengeが一致しない場合は401エラーとする */
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    /** セッションの存在確認 */
    const session = await prisma.dbscSession.findUnique({
        where: {
            sessionId: sessionId
        }
    })

    const publicKeyX = (session?.publicKey as {
        x: string,
        y: string
    })?.x
    const publicKeyY = (session?.publicKey as {
        x: string,
        y: string
    })?.y

    /**
     * 登録時に受け取った公開鍵と一致するかを確認する
     * 一致しない場合、異なるデバイスからのリクエストとなるはずなので、エラーとする
     */
    if (!session || publicKeyX !== publicKey.x || publicKeyY !== publicKey.y) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }


    const newCookieValue = randomUUID();

    /** 
     * 有効期限が短いCookieをセットし直す 
     * 今回は検証しやすいように10秒で設定しているが、更新の場合も仕様に明確な秒数は指定されていない
     * ただし、長すぎるとセキュリティ上の問題があるため、短い時間で設定することが推奨されている
     * */
    cookieList.set('auth_cookie', newCookieValue, {
        maxAge: 10,
        sameSite: 'lax',
        path: '/'
    })

    /**
     * 新しく発行されたCookieの値を使用して、Session Identifierの紐づけを更新する
     */
    await InMemoryDB.set(newCookieValue, sessionId, { ex: 15 });

    // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
    cookieList.set(sortUlid(), `Refresh DBSC Session Complete\n\r${(new Date()).toISOString()}`, { path: '/' })

    return NextResponse.json({
        /** 
         * session_identifierは登録時と同じにすること
         * 同じにしないと登録したセッションと異なるようになってしまい、繰り返し更新してくれなくなる。
         * */
        "session_identifier": sessionId,
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
            /** 
             * このattributesはかならずセットしたCookieと同じ設定にする 
             * 同じにしないと、更新エンドポイントをブラウザが無限に叩き続ける
             * */
            "attributes": "SameSite=Lax; Path=/"
        }]
    })
}