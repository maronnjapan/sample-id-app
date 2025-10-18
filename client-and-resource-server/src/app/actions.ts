'use server';

import { auth, signIn, signOut } from "@/auth";
import { Config } from "@/config";

export const logout = async () => {
    await signOut({
        redirect: true,
        redirectTo: '/'
    })
}

export const login = async () => {
    await signIn('auth0')
}

export const fetchSampleApi = async () => {
    const session = await auth()
    if (!session) {
        return { message: 'ログインしてください' }
    }
    const res = await fetch(`${Config.appApiAudience}/sample`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
        }
    });
    if (!res.ok) {
        const data = await res.json() as { message: string };
        return { message: data.message || '認証情報の取得に失敗しました' }
    }
    return await res.json() as { message: string }
}