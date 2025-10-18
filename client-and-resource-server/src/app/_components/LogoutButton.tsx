'use client'

import { logout } from "../actions"

export const LogoutButton = () => (<button className="bg-red-500 text-white py-2 px-4 rounded" onClick={() => logout()}>ログアウト</button>)