
import type { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";
import { cookies } from "next/headers";

export async function middleware(request: NextRequest) {

    /** 
     * 初回アクセス時に、DBSC動作確認用のCookieを削除している
     * そのため、このCookie操作はAuth0関係ない
     * */
    const cookie = await cookies()
    if (request.nextUrl.pathname === '/') {
        const allCookies = cookie.getAll()
        allCookies.forEach((ck) => {
            if (ck.name === 'auth_cookie') {
                return
            }
            if (process.env.AUTH0_CLIENT_ID && ck.name.includes(process.env.AUTH0_CLIENT_ID)) {
                return
            }
            if (request.nextUrl.searchParams.get('cookieKey') === ck.name) {
                return
            }
            cookie.delete(ck.name)
        });
    }

    return await auth0.middleware(request);
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ],
};