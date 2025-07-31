'use server'
import { InMemoryDB } from "@/storage/in-memory";
import { cookies } from "next/headers"
import { match } from "ts-pattern";

export const getUserStatus = async () => {
    const cookieList = await cookies()
    const authCode = cookieList.get("auth_cookie")?.value

    if (!authCode) {
        return { status: 'NOT_AUTH' } as const;
    }

    const sessionId = await InMemoryDB.get(authCode);
    if (!sessionId) {
        return { status: 'NOT_SESSION' } as const;
    }
    const token = await InMemoryDB.get(sessionId)

    if (!token) {
        return { status: 'NOT_CONNECTED_SESSION_TOKEN' } as const
    }

    return { token, status: 'AUTHED' } as const
}

export const getUserInfo = async () => {
    const status = await getUserStatus()

    return match(status)
        .with({ status: 'NOT_AUTH' }, () => '認証が必要です')
        .with({ status: 'NOT_SESSION' }, () => 'セッションが見つかりません。')
        .with({ status: 'NOT_CONNECTED_SESSION_TOKEN' }, () => 'セッションがトークンに紐づいていません')
        .with({ status: 'AUTHED' }, (res) => JSON.stringify(res.token, null, 2))
        .exhaustive()
}