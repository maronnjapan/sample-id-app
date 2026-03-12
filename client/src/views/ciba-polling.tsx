import { Layout } from "./layout";

type Props = {
  authReqId: string;
  interval: number;
  expiresIn: number;
  loginHint: string;
  bindingMessage?: string;
};

export function CibaPollingPage({
  authReqId,
  interval,
  expiresIn,
  loginHint,
  bindingMessage,
}: Props) {
  return (
    <Layout title="CIBA 認証待ち">
      <h1>認証デバイスでの承認を待っています...</h1>

      <div
        id="ciba-polling-config"
        data-auth-req-id={authReqId}
        data-interval={String(interval)}
        style="background: #e3f2fd; padding: 16px; border-radius: 8px; margin: 16px 0;"
      >
        <table>
          <tr>
            <th>auth_req_id</th>
            <td>
              <code>{authReqId}</code>
            </td>
          </tr>
          <tr>
            <th>ユーザー</th>
            <td>{loginHint}</td>
          </tr>
          {bindingMessage && (
            <tr>
              <th>確認メッセージ</th>
              <td>
                <strong>{bindingMessage}</strong>
              </td>
            </tr>
          )}
          <tr>
            <th>ポーリング間隔</th>
            <td>{interval}秒</td>
          </tr>
          <tr>
            <th>有効期限</th>
            <td>{expiresIn}秒</td>
          </tr>
        </table>
      </div>

      <div id="status" style="margin: 20px 0;">
        <div
          id="status-message"
          style="padding: 12px; background: #fff3e0; border-radius: 4px; color: #e65100;"
        >
          ポーリング中... 認証デバイスで承認してください
        </div>
        <div
          id="poll-count"
          style="font-size: 12px; color: #999; margin-top: 8px;"
        ></div>
      </div>

      <div id="result" style="display: none;">
        <h2>トークン取得成功</h2>
        <h3>Token Response</h3>
        <pre id="token-data"></pre>
        <h3>ID Token Claims</h3>
        <pre id="id-token-claims"></pre>
        <h3>UserInfo</h3>
        <pre id="user-info"></pre>
      </div>

      <div id="error-result" style="display: none;">
        <h2 style="color: #f44336;">エラー</h2>
        <pre id="error-data"></pre>
      </div>

      <a href="/ciba" class="btn" style="background: #9e9e9e;">
        戻る
      </a>

      <script src="/static/ciba-polling.js"></script>
    </Layout>
  );
}
