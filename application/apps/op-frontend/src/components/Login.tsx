export function Login() {
    const fragment = window.location.hash
    const loginPostInfo = JSON.parse(atob(fragment.slice(1)));
    return (
        <div>
            <h1>Login</h1>
            <form method={loginPostInfo.method} action={loginPostInfo.path}>
                <label>
                    メールアドレス:
                    <input type="email" name="email" />
                </label>
                <label>
                    パスワード:
                    <input type="password" name="password" />
                </label>
                <button type="submit">Submit</button>
            </form>
        </div>
    );
}