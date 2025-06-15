'use client'

import { logout } from "@/app/actions"

export function LogoutButton() {
    return <button onClick={() => { logout() }}>
        Logout
    </button>
}