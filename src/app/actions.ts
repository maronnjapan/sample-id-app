'use server'
import { prisma } from "@/prisma";
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
    const userId = await InMemoryDB.get(sessionId)

    if (!userId) {
        return { status: 'NOT_CONNECTED_SESSION_USER' } as const
    }

    const user = await prisma.user.findUnique({
        where: {
            id: userId
        }
    })
    if (!user) {
        return { status: 'NOT_EXIST_USER' } as const;
    }

    return { user: user, status: 'AUTHED' } as const
}

export const getUserInfo = async () => {
    const status = await getUserStatus()

    return match(status)
        .with({ status: 'NOT_AUTH' }, () => '認証が必要です')
        .with({ status: 'NOT_SESSION' }, () => 'セッションが見つかりません。')
        .with({ status: 'NOT_CONNECTED_SESSION_USER' }, () => 'セッションがユーザーに紐づいていません')
        .with({ status: 'NOT_EXIST_USER' }, () => 'ユーザーが存在しません')
        .with({ status: 'AUTHED' }, (res) => JSON.stringify(res.user))
        .exhaustive()
}