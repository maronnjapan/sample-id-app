import { Layout } from "./layout";

type Props = {
  error: string;
  description: string;
};

export function ErrorPage({ error, description }: Props) {
  return (
    <Layout title="エラー">
      <h1>エラー</h1>
      <p>
        <strong>{error}</strong>
      </p>
      <pre>{description}</pre>
      <a href="/" class="btn">
        戻る
      </a>
    </Layout>
  );
}
