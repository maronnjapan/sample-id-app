import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {

    const cookie = await cookies()
    if (request.nextUrl.pathname === '/') {
        const allCookies = cookie.getAll()
        allCookies.forEach((ck) => {
            if (ck.name === 'auth_cookie') {
                return
            }
            cookie.delete(ck.name)
        });
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/(.*)'
    ],
};