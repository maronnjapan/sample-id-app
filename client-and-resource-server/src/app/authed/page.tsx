import { Config } from "@/config";
import { LogoutButton } from "../_components/LogoutButton";
import { ErrorComponent } from "../_components/ErrorComponent";
import { auth } from "@/auth";
import { InfoComponent } from "../_components/InfoComponent";

export default async function Home() {
    const session = await auth()
    if (!session) {
        return <ErrorComponent message="ログインしてください" />
    }
    const getAuthedInfoRes = await fetch(`${Config.appUrl}/api/sample`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
        }
    });
    if (!getAuthedInfoRes.ok) {
        const data = await getAuthedInfoRes.json() as { message: string };
        return <ErrorComponent message={data.message || '認証情報の取得に失敗しました'} />
    }

    return (
        <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-4 sm:p-20">
            <h1 className="text-2xl font-bold">認証済みページ</h1>
            <InfoComponent message={JSON.stringify(await getAuthedInfoRes.json(), null, 2)} />
            <LogoutButton />
        </div>
    );
}