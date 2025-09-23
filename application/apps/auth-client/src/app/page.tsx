import { auth, signIn } from "@/auth";
import { ShowIdToken } from "./components/ShowIdToken";

export default async function Home() {
  const session = await auth()

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <form
          action={async () => {
            "use server"
            await signIn("my-provider")
          }}
        >
          <button className="styled-button" type="submit">Signin with Auth0</button>

        </form>
        {session?.idToken && <ShowIdToken idToken={session.idToken} />}
      </main>
    </div>
  );
}
