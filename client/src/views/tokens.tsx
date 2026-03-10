import { Layout } from "./layout";

type Props = {
  tokenData: Record<string, unknown>;
  idTokenClaims: Record<string, unknown> | null;
  userInfo: Record<string, unknown> | null;
};

export function TokensPage({ tokenData, idTokenClaims, userInfo }: Props) {
  return (
    <Layout title="トークン取得結果">
      <h1>トークン取得成功</h1>

      <h2>Token Response</h2>
      <pre>{JSON.stringify(tokenData, null, 2)}</pre>

      {idTokenClaims && (
        <>
          <h2>ID Token Claims (デコード済み)</h2>
          <pre>{JSON.stringify(idTokenClaims, null, 2)}</pre>
        </>
      )}

      {userInfo && (
        <>
          <h2>UserInfo</h2>
          <pre>{JSON.stringify(userInfo, null, 2)}</pre>
        </>
      )}

      <a href="/" class="btn">
        戻る
      </a>
    </Layout>
  );
}
