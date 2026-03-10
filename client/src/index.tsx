import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { HomePage } from "./views/home";
import { TokensPage } from "./views/tokens";
import { ErrorPage } from "./views/error";
import { CibaStartPage } from "./views/ciba-start";
import { CibaPollingPage } from "./views/ciba-polling";

const CLIENT_ID = "sample-client";
const CLIENT_SECRET = "sample-client-secret";
const SCOPES = "openid profile email";
const ISSUER = process.env.ISSUER ?? "http://localhost:8787";
const PORT = Number(process.env.PORT ?? 3000);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const app = new Hono();

// トップページ
app.get("/", (c) => {
  return c.html(<HomePage />);
});

// ログイン → OPの認可エンドポイントへリダイレクト
app.get("/login", (c) => {
  const state = crypto.randomUUID();

  const authUrl = new URL(`${ISSUER}/auth`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  // トークンのaudをクライアント側で設定するためのパラメータ
  // authUrl.searchParams.set('resource', "http://localhost:8787/me");

  return c.redirect(authUrl.toString());
});

// コールバック → 認可コードをトークンに交換
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    const description = c.req.query("error_description") ?? "";
    return c.html(<ErrorPage error={error} description={description} />, 400);
  }

  if (!code) {
    return c.html(
      <ErrorPage error="missing_code" description="認可コードがありません" />,
      400,
    );
  }

  // トークンエンドポイントへ認可コードを送信
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64",
  );

  const tokenRes = await fetch(`${ISSUER}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const responseText = await tokenRes.text();
  let tokenData: Record<string, unknown>;
  try {
    tokenData = JSON.parse(responseText);
  } catch {
    return c.html(
      <ErrorPage
        error="invalid_response"
        description={`OPからの応答がJSONではありません (HTTP ${tokenRes.status}):\n\n${responseText}`}
      />,
      502,
    );
  }

  if (!tokenRes.ok) {
    return c.html(
      <ErrorPage
        error="token_error"
        description={JSON.stringify(tokenData, null, 2)}
      />,
      400,
    );
  }

  // IDトークンをデコード（表示用、検証は省略）
  let idTokenClaims: Record<string, unknown> | null = null;
  const idToken = tokenData.id_token as string | undefined;
  if (idToken) {
    try {
      const payload = idToken.split(".")[1];
      idTokenClaims = JSON.parse(
        Buffer.from(payload, "base64url").toString(),
      );
    } catch {
      idTokenClaims = { error: "IDトークンのデコードに失敗" };
    }
  }

  // UserInfoエンドポイント呼び出し
  let userInfo: Record<string, unknown> | null = null;
  const accessToken = tokenData.access_token as string | undefined;
  if (accessToken) {
    try {
      const userInfoResponse = await fetch(`${ISSUER}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoResponse.ok) {
        userInfo = (await userInfoResponse.json()) as Record<string, unknown>;
      } else {
        console.log("UserInfo取得に失敗");
        console.log("UserInfo response:", userInfoResponse);
      }
    } catch {
      // UserInfo取得失敗は無視
    }
  }

  return c.html(
    <TokensPage
      tokenData={tokenData}
      idTokenClaims={idTokenClaims}
      userInfo={userInfo}
    />,
  );
});

// --- CIBA フロー ---

// CIBA ログイン開始ページ
app.get("/ciba", (c) => {
  return c.html(<CibaStartPage />);
});

// CIBA バックチャネル認証リクエスト送信
app.post("/ciba/start", async (c) => {
  const body = await c.req.parseBody();
  const loginHint = body.login_hint as string;
  const bindingMessage = body.binding_message as string | undefined;

  if (!loginHint) {
    return c.html(
      <ErrorPage error="missing_login_hint" description="ユーザー識別子を入力してください" />,
      400,
    );
  }

  // OP の backchannel authentication endpoint へリクエスト
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const params = new URLSearchParams({
    scope: SCOPES,
    login_hint: loginHint,
  });
  if (bindingMessage) {
    params.set("binding_message", bindingMessage);
  }

  const bcAuthorizeRes = await fetch(`${ISSUER}/bc-authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: params,
  });

  const responseText = await bcAuthorizeRes.text();
  let bcData: Record<string, unknown>;
  try {
    bcData = JSON.parse(responseText);
  } catch {
    return c.html(
      <ErrorPage
        error="invalid_response"
        description={`OPからの応答がJSONではありません (HTTP ${bcAuthorizeRes.status}):\n\n${responseText}`}
      />,
      502,
    );
  }

  if (!bcAuthorizeRes.ok) {
    return c.html(
      <ErrorPage
        error="bc_authorize_error"
        description={JSON.stringify(bcData, null, 2)}
      />,
      400,
    );
  }

  const authReqId = bcData.auth_req_id as string;
  const interval = (bcData.interval as number) ?? 5;
  const expiresIn = bcData.expires_in as number;

  // ポーリングページへリダイレクト
  return c.html(
    <CibaPollingPage
      authReqId={authReqId}
      interval={interval}
      expiresIn={expiresIn}
      loginHint={loginHint}
      bindingMessage={bindingMessage}
    />,
  );
});

// CIBA トークンポーリング API（クライアント側JSから呼び出し）
app.post("/ciba/poll", async (c) => {
  const body = await c.req.json<{ auth_req_id: string }>();
  const authReqId = body.auth_req_id;

  if (!authReqId) {
    return c.json({ error: "missing_auth_req_id" }, 400);
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const tokenRes = await fetch(`${ISSUER}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "urn:openid:params:grant-type:ciba",
      auth_req_id: authReqId,
    }),
  });

  const tokenData = await tokenRes.json() as Record<string, unknown>;

  if (!tokenRes.ok) {
    // authorization_pending や slow_down はポーリング継続
    const error = tokenData.error as string;
    if (error === "authorization_pending" || error === "slow_down") {
      return c.json({
        status: "pending",
        error,
        slow_down: error === "slow_down",
      });
    }
    // その他のエラーは最終結果
    return c.json({ status: "error", ...tokenData }, 400);
  }

  // トークン取得成功
  // IDトークンをデコード
  let idTokenClaims: Record<string, unknown> | null = null;
  const idToken = tokenData.id_token as string | undefined;
  if (idToken) {
    try {
      const payload = idToken.split(".")[1];
      idTokenClaims = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      idTokenClaims = { error: "IDトークンのデコードに失敗" };
    }
  }

  // UserInfo 取得
  let userInfo: Record<string, unknown> | null = null;
  const accessToken = tokenData.access_token as string | undefined;
  if (accessToken) {
    try {
      const userInfoRes = await fetch(`${ISSUER}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        userInfo = await userInfoRes.json() as Record<string, unknown>;
      }
    } catch { /* ignore */ }
  }

  return c.json({
    status: "completed",
    tokenData,
    idTokenClaims,
    userInfo,
  });
});

console.log(`OIDC Client running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
