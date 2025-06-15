
import { auth } from "@/auth";
import { LoginForm } from "@/components/LoginForm";
import { pagesPath } from "@/lib/$path";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth()

  if (session) {
    return redirect(pagesPath.token_exchange.$url().pathname)
  }
  return <LoginForm />
}
