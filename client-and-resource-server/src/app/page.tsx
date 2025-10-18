import Link from "next/link";
import { LoginButton } from "./_components/LoginButton";
import { auth } from "@/auth";
import { redirect } from 'next/navigation';
import { Config } from "@/config";

export default async function Home() {
  const session = await auth()
  if (session) {
    return redirect(`${Config.appUrl}/authed`)
  }
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <LoginButton />
    </div>
  );
}
