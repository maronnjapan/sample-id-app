import { prisma } from "@/prisma";
import { sortUlid } from "@/util";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

export async function GET() {
    const cookieList = await cookies()
    const challenge = randomUUID()

    await prisma.challenge.create({
        data: {
            challenge
        }
    })
    cookieList.set('auth_cookie', 'cookie', {
        domain: 'localhost',
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000,
    })

    const secSessionRegistration = `(ES256 RS256);path="register-dbsc-cookie";challenge="${challenge}"`
    // このCookieセットはフロントで表示させるための実装なので、DBSCには何も関係がない。
    cookieList.set(sortUlid(), `start DBSC Session \n\r Sec-Session-Registration:${secSessionRegistration}\n\r${(new Date()).toISOString()}`, { path: '/' })


    return NextResponse.json({}, {
        headers: {
            "Sec-Session-Registration": secSessionRegistration,
        }
    })
}