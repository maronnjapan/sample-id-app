'use client'

import { login } from "../actions"

export const LoginButton = () => (<button className="bg-blue-500 text-white py-2 px-4 rounded" onClick={() => {
    login()
}}>ログイン</button>)