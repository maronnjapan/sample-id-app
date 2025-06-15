import { auth } from "@/auth";
import { LogoutButton } from "@/components/Logout";
import { TokenExchangeClient } from "@/components/TokenExchangeClient";

export default async function Page() {
    const session = await auth()
    console.log("session", session)

    return (
        <div>
            <TokenExchangeClient 
                session={session}
            />
            <div className="mt-6 text-center">
                <LogoutButton />
            </div>
        </div>
    )
}