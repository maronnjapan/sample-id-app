import { base64UrlDecode, sortUlid, verifySecSessionResponseToken, getPublicKey } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/prisma";

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
        console.log(challengeValue, 'challengeValue')
        console.log(sessionId, 'sessionId')
        const challenge = `"${challengeValue}";id="${sessionId}"`
        await prisma.challenge.create({
            data: {
                challenge: challengeValue
            }
        })
        // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
        cookieList.set(sortUlid(), `Refresh DBSC Session Start \n\r Sec-Session-Challenge:${challenge}\n\r${(new Date()).toISOString()}`, { path: '/' })

        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
            headers: {
                "Sec-Session-Challenge": challenge,
            }
        })
    }

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
    console.log(payloadJson)
    console.log(token)

    await prisma.challenge.findUniqueOrThrow({
        where: {
            challenge: payloadJson.jti
        }
    })

    // セッションの存在確認
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

    if (!session || publicKeyX !== publicKey.x || publicKeyY !== publicKey.y) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
        })
    }

    cookieList.set('auth_cookie', randomUUID(), {
        maxAge: 10,
        domain: 'localhost',
        sameSite: 'lax',
        path: '/'
    })

    // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
    cookieList.set(sortUlid(), `Refresh DBSC Session Complete\n\r${(new Date()).toISOString()}`, { path: '/' })

    return NextResponse.json({
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
            "attributes": "Domain=localhost; SameSite=Lax; Path=/"
        }]
    },
        {
            headers: {
                "Cache-Control": "no-store"
            }
        }
    )
}