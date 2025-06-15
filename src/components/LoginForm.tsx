'use client';

import { login } from "@/app/actions";

export function LoginForm() {
    return (
        <form action={() => {
            login()
        }} >
            <input type="hidden" name="csrfToken" value={''} />
            <button type="submit">Login</button>
        </form>
    );
}