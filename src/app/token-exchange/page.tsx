import { auth } from "@/auth";
import { TokenExchangeClient } from "@/components/TokenExchangeClient";
import { LoginForm } from "@/components/LoginForm";
import { Logout } from "@/components/Logout";

export default async function TokenExchangePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6 text-black">
          Okta Token Exchange Demo
        </h1>
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-black">Oktaアカウントでログインしてください</p>
          </div>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex justify-end mb-4">
          <Logout />
        </div>
      </div>
      <TokenExchangeClient session={session} />
    </div>
  );
}
