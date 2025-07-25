import { DbscFrontComponent } from "@/components/DbscFrontComponent";
import { getUserStatus } from "./actions";
import { auth0 } from "@/lib/auth0";

export default async function Home() {
  try {
    console.log(await auth0.getAccessToken());
    console.log(await auth0.getSession())
  } catch (_) {
    console.error('トークンない');
  }
  const status = await getUserStatus()

  return <DbscFrontComponent isLogin={status.status === 'AUTHED'} />
}
