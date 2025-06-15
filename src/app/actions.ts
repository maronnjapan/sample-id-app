'use server';

import { signIn, signOut, singInKeycloak } from "@/auth";

export const logout = async () => {
    await signOut({
        redirect: true,
        redirectTo: '/'
    })
}

export const login = async () => {
    await singInKeycloak()
}