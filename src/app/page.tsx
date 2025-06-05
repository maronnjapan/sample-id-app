import { DbscFrontComponent } from "@/components/DbscFrontComponent";
import { getUserStatus } from "./actions";

export default async function Home() {
  const status = await getUserStatus()

  return <DbscFrontComponent isLogin={status.status === 'AUTHED'} />
}
