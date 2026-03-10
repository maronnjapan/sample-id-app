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

      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            var authReqId = ${JSON.stringify(authReqId)};
            var interval = ${interval} * 1000;
            var pollCount = 0;
            var timerId = null;

            function poll() {
              pollCount++;
              document.getElementById('poll-count').textContent =
                'ポーリング回数: ' + pollCount;

              fetch('/ciba/poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_req_id: authReqId }),
              })
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data.status === 'pending') {
                  if (data.slow_down) {
                    interval = Math.min(interval + 5000, 30000);
                  }
                  timerId = setTimeout(poll, interval);
                } else if (data.status === 'completed') {
                  document.getElementById('status').style.display = 'none';
                  document.getElementById('result').style.display = 'block';
                  document.getElementById('token-data').textContent =
                    JSON.stringify(data.tokenData, null, 2);
                  document.getElementById('id-token-claims').textContent =
                    data.idTokenClaims ? JSON.stringify(data.idTokenClaims, null, 2) : 'N/A';
                  document.getElementById('user-info').textContent =
                    data.userInfo ? JSON.stringify(data.userInfo, null, 2) : 'N/A';
                } else {
                  document.getElementById('status').style.display = 'none';
                  document.getElementById('error-result').style.display = 'block';
                  document.getElementById('error-data').textContent =
                    JSON.stringify(data, null, 2);
                }
              })
              .catch(function(err) {
                document.getElementById('status-message').textContent =
                  '通信エラー: ' + err.message + ' (リトライ中...)';
                timerId = setTimeout(poll, interval);
              });
            }

            timerId = setTimeout(poll, interval);
          })();
        `,
        }}
      />
    </Layout>
  );
}
