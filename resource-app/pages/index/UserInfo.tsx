import { client } from "../../ts-rest/client";
import type { UserResponse } from "../../ts-rest/contract";
import { useEffect, useState } from "react";

type UserState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "blocked"; user: UserResponse }
  | { status: "ok"; user: UserResponse };

export function UserInfo() {
  const [userState, setUserState] = useState<UserState>({ status: "loading" });

  useEffect(() => {
    const fetchUser = async () => {
      const response = await client.getUser();

      if (response.status === 401) {
        setUserState({ status: "unauthorized" });
      } else if (response.status === 404) {
        setUserState({ status: "not_found" });
      } else if (response.status === 403) {
        setUserState({ status: "blocked", user: response.body.user });
      } else if (response.status === 200) {
        setUserState({ status: "ok", user: response.body.user });
      }
    };

    fetchUser();
  }, []);

  if (userState.status === "loading") {
    return <p>Loading...</p>;
  }

  if (userState.status === "unauthorized") {
    return (
      <div>
        <p>ログインしていません。</p>
        <a href="/api/auth/signin">ログイン</a>
      </div>
    );
  }

  if (userState.status === "not_found") {
    return <p>ユーザー情報が見つかりません。</p>;
  }

  if (userState.status === "blocked") {
    return (
      <div style={{ color: "red" }}>
        <p>このアカウントはブロックされています。</p>
        <p>Email: {userState.user.email}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>ユーザー情報</h2>
      <p>Email: {userState.user.email}</p>
      <p>Auth0 ID: {userState.user.auth0Id}</p>
      <a href="/api/auth/signout">ログアウト</a>
    </div>
  );
}
