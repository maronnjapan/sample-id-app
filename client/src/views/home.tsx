import { Layout } from "./layout";

const CLIENT_ID = "sample-client";
const SCOPES = "openid profile email";

export function HomePage() {
  return (
    <Layout title="OIDC Client">
      <h1>OIDC Client (Relying Party)</h1>
      <p>認可コードフローでOpenID Providerからトークンを取得します。</p>
      <a href="/login" class="btn">
        ログイン
      </a>
      <hr />
      <h2>設定</h2>
      <table>
        <tr>
          <th>Client ID</th>
          <td>{CLIENT_ID}</td>
        </tr>
        <tr>
          <th>Scopes</th>
          <td>{SCOPES}</td>
        </tr>
        <tr>
          <th>Grant Type</th>
          <td>authorization_code</td>
        </tr>
        <tr>
          <th>Response Type</th>
          <td>code</td>
        </tr>
      </table>
    </Layout>
  );
}
