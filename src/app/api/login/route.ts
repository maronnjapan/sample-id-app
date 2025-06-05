import { prisma } from "@/prisma";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sortUlid } from "@/util";
import { randomUUID } from "crypto";
import { InMemoryDB } from "@/storage/in-memory";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { username, password } = await req.json();

    if (!username || typeof username !== 'string') {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string') {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: {
            username
        }
    });

    if (!user || user.password !== password) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }


    const cookieStore = await cookies();
    const authValue = randomUUID()
    /** Device Bound Session Credentialsが失敗したとき用に生存期間の長いCookieを設定 */
    cookieStore.set('auth_cookie', authValue, {
        domain: 'localhost',
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000,
    });
    /** 
     * Cookieの値をInMemoryDBに保存
     * Device Bound Session Credentialsのために、user IDと紐づけて保存
     * 後で、Device Bound Session Credentialsのフローで発行したCookieやsession identifierと差し替える
     */
    await InMemoryDB.set(authValue, user.id, { ex: 60 * 60 * 24 * 30 });

    cookieStore.set(sortUlid(), `User Login Successful\\n\\r${(new Date()).toISOString()}`, { path: '/' });

    return NextResponse.json({ success: true });
}
