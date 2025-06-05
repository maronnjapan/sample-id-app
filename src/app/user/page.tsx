import { getUserInfo } from "../actions";

export default async function Page() {
    const userInfo = await getUserInfo();
    return <div>{userInfo}</div>
}