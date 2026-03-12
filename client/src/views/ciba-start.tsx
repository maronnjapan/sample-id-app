import { Layout } from "./layout";

export function CibaStartPage() {
  return (
    <Layout title="CIBA ログイン">
      <h1>CIBA ログイン</h1>
      <p>
        バックチャネル認証（CIBA）でログインします。
        <br />
        認証デバイス（AD）側で承認すると、トークンが発行されます。
      </p>

      <form method="post" action="/ciba/start">
        <table>
          <tr>
            <th>
              <label for="login_hint">ユーザー識別子</label>
            </th>
            <td>
              <input
                type="text"
                id="login_hint"
                name="login_hint"
                placeholder="user@example.com"
                required
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
              />
            </td>
          </tr>
          <tr>
            <th>
              <label for="binding_message">確認メッセージ</label>
            </th>
            <td>
              <input
                type="text"
                id="binding_message"
                name="binding_message"
                placeholder="例: AB12"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
              />
              <small style="color: #999;">
                認証デバイス側に表示される確認用メッセージ（任意）
              </small>
            </td>
          </tr>
        </table>
        <button
          type="submit"
          class="btn"
          style="border: none; cursor: pointer; font-size: 16px;"
        >
          CIBA 認証リクエスト送信
        </button>
      </form>

      <hr />
      <a href="/" style="color: #666;">
        トップに戻る
      </a>
    </Layout>
  );
}
