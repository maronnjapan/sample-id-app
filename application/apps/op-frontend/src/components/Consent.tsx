export function Consent() {
    const fragment = window.location.hash
    const loginPostInfo = JSON.parse(atob(fragment.slice(1)));
    return (
        <div>
            <h1>Consent</h1>
            <form method={loginPostInfo.method} action={loginPostInfo.path}>
                <p>The application is requesting access to your account.</p>
                <button type="submit">Allow</button>
            </form>
        </div>
    );
}