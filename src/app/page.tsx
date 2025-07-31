import { DbscFrontComponent } from "@/components/DbscFrontComponent";
import { getUserStatus } from "./actions";
import { auth0 } from "@/lib/auth0";

export default async function Home() {

  const token = await auth0.getSession()
  const status = await getUserStatus()

  return <DbscFrontComponent isLogin={status.status === 'AUTHED' || !!token?.tokenSet.idToken} />
}
