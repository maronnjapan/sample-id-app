import { prisma } from "@/prisma";
import { base64UrlDecode, getPublicKey, sortUlid, verifySecSessionResponseToken } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
    const token = req.headers.get("Sec-Session-Response")
    console.log("register session id", req.headers.get("Sec-Session-Id"))
    if (!token) {
        return NextResponse.json(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            statusText: 'Unauthorized',
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
    const payloadJson = JSON.parse(base64UrlDecode(payload))
    const sessionId = randomUUID()
    const publicKey = getPublicKey(payload)

    console.log(token, 'register-dbsc-cookie token')
    console.log(payloadJson, 'register-dbsc-cookie payloadJson')

    await prisma.challenge.findUniqueOrThrow({
        where: {
            challenge: payloadJson.jti
        }
    })

    await prisma.dbscSession.create({
        data: {
            sessionId,
            publicKey
        }
    })

    const cookieList = await cookies()
    cookieList.set('auth_cookie', randomUUID(), {
        maxAge: 10,
        domain: 'localhost',
        sameSite: 'lax',
        path: '/'
    })
    cookieList.set(sortUlid(), `Register DBSC Session \n\r Sec-Session-Response:${token}\n\r${(new Date()).toISOString()}`, { path: '/' })

    console.log(sessionId, 'sessionId')
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