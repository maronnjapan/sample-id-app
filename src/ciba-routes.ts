/**
 * CIBA (Client Initiated Backchannel Authentication) のコンセントルート
 *
 * 認証デバイス（AD）側のUI：
 * - デバイス登録（Cookie ベースのデバイスバインディング）
 * - 保留中リクエスト一覧・承認・拒否
 */
import type Provider from "oidc-provider";
import type { CibaPendingRequest } from "./oidc-config";

type ProviderInstance = InstanceType<typeof Provider>;

/**
 * CIBA 用のカスタムルートを Provider の Koa ミドルウェアとして追加
 */
export function addCibaRoutes(provider: ProviderInstance, kv: KVNamespace) {
  provider.use(async (ctx, next) => {
    // --- デバイス登録ページ ---
    if (ctx.method === "GET" && ctx.path === "/ciba/device") {
      ctx.type = "text/html";
      ctx.body = renderDeviceRegistrationPage();
      return;
    }

    // --- デバイス登録処理 ---
    if (ctx.method === "POST" && ctx.path === "/ciba/device") {
      const body = await parseFormBody(ctx.req);
      const loginHint = body.login_hint;

      if (!loginHint) {
        ctx.status = 400;
        ctx.type = "text/html";
        ctx.body = renderDeviceRegistrationPage("ユーザー識別子を入力してください");
        return;
      }

      const deviceId = crypto.randomUUID();

      // デバイスバインディング: device_id → accountId のマッピングを保存
      await kv.put(`ciba:device:${deviceId}`, loginHint, {
        expirationTtl: 86400 * 30, // 30日間有効
      });

      // Cookie にデバイスIDをセット
      ctx.cookies.set("ciba_device_id", deviceId, {
        httpOnly: true,
        maxAge: 86400 * 30 * 1000,
        sameSite: "lax",
        path: "/",
      });

      console.log(`[CIBA] デバイス登録: device=${deviceId}, account=${loginHint}`);
      ctx.redirect("/ciba/consent");
      return;
    }

    // --- コンセントページ（保留リクエスト一覧） ---
    if (ctx.method === "GET" && ctx.path === "/ciba/consent") {
      const deviceId = ctx.cookies.get("ciba_device_id");
      if (!deviceId) {
        ctx.redirect("/ciba/device");
        return;
      }

      const accountId = await kv.get(`ciba:device:${deviceId}`);
      if (!accountId) {
        // デバイスバインディングが期限切れ → 再登録
        ctx.cookies.set("ciba_device_id", "", { maxAge: 0, path: "/" });
        ctx.redirect("/ciba/device");
        return;
      }

      // 保留中リクエストを取得
      const pendingIds = await kv.get<string[]>(`ciba:pending:${accountId}`, "json") ?? [];
      const pendingRequests: CibaPendingRequest[] = [];
      for (const reqId of pendingIds) {
        const req = await kv.get<CibaPendingRequest>(`ciba:request:${reqId}`, "json");
        if (req) {
          pendingRequests.push(req);
        }
      }

      ctx.type = "text/html";
      ctx.body = renderConsentPage(accountId, deviceId, pendingRequests);
      return;
    }

    // --- 保留リクエストの一覧 API（ポーリング用） ---
    if (ctx.method === "GET" && ctx.path === "/ciba/pending") {
      const deviceId = ctx.cookies.get("ciba_device_id");
      if (!deviceId) {
        ctx.status = 401;
        ctx.body = { error: "device_not_registered" };
        return;
      }

      const accountId = await kv.get(`ciba:device:${deviceId}`);
      if (!accountId) {
        ctx.status = 401;
        ctx.body = { error: "device_binding_expired" };
        return;
      }

      const pendingIds = await kv.get<string[]>(`ciba:pending:${accountId}`, "json") ?? [];
      const pendingRequests: CibaPendingRequest[] = [];
      for (const reqId of pendingIds) {
        const req = await kv.get<CibaPendingRequest>(`ciba:request:${reqId}`, "json");
        if (req) {
          pendingRequests.push(req);
        }
      }

      ctx.type = "application/json";
      ctx.body = JSON.stringify({ requests: pendingRequests });
      return;
    }

    // --- リクエスト承認 ---
    if (ctx.method === "POST" && ctx.path === "/ciba/approve") {
      const deviceId = ctx.cookies.get("ciba_device_id");
      if (!deviceId) {
        ctx.status = 401;
        ctx.body = { error: "device_not_registered" };
        return;
      }

      const accountId = await kv.get(`ciba:device:${deviceId}`);
      if (!accountId) {
        ctx.status = 401;
        ctx.body = { error: "device_binding_expired" };
        return;
      }

      const body = await parseJsonBody(ctx.req);
      const authReqId = body.auth_req_id;
      if (!authReqId) {
        ctx.status = 400;
        ctx.body = { error: "auth_req_id is required" };
        return;
      }

      // 保留リクエストの検証
      const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
      if (!pendingReq || pendingReq.accountId !== accountId) {
        ctx.status = 404;
        ctx.body = { error: "request_not_found" };
        return;
      }

      try {
        // Grant を作成して CIBA リクエストを承認
        const grant = new provider.Grant({
          accountId,
          clientId: pendingReq.clientId,
        });
        grant.addOIDCScope(pendingReq.scope);
        await grant.save();

        // provider.backchannelResult で承認を通知
        await provider.backchannelResult(authReqId, grant, {
          acr: "urn:mace:incommon:iap:bronze",
          amr: ["ciba"],
          authTime: Math.floor(Date.now() / 1000),
        });

        // 保留リクエストを削除
        await removePendingRequest(kv, accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] リクエスト承認: auth_req_id=${authReqId}, account=${accountId}`);

        ctx.type = "application/json";
        ctx.body = JSON.stringify({ status: "approved" });
      } catch (err) {
        console.error("[CIBA] 承認エラー:", err);
        ctx.status = 500;
        ctx.body = { error: "approval_failed", detail: String(err) };
      }
      return;
    }

    // --- リクエスト拒否 ---
    if (ctx.method === "POST" && ctx.path === "/ciba/deny") {
      const deviceId = ctx.cookies.get("ciba_device_id");
      if (!deviceId) {
        ctx.status = 401;
        ctx.body = { error: "device_not_registered" };
        return;
      }

      const accountId = await kv.get(`ciba:device:${deviceId}`);
      if (!accountId) {
        ctx.status = 401;
        ctx.body = { error: "device_binding_expired" };
        return;
      }

      const body = await parseJsonBody(ctx.req);
      const authReqId = body.auth_req_id;
      if (!authReqId) {
        ctx.status = 400;
        ctx.body = { error: "auth_req_id is required" };
        return;
      }

      const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
      if (!pendingReq || pendingReq.accountId !== accountId) {
        ctx.status = 404;
        ctx.body = { error: "request_not_found" };
        return;
      }

      try {
        // access_denied エラーで拒否
        await provider.backchannelResult(authReqId, "access_denied");

        await removePendingRequest(kv, accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] リクエスト拒否: auth_req_id=${authReqId}, account=${accountId}`);

        ctx.type = "application/json";
        ctx.body = JSON.stringify({ status: "denied" });
      } catch (err) {
        console.error("[CIBA] 拒否エラー:", err);
        ctx.status = 500;
        ctx.body = { error: "denial_failed", detail: String(err) };
      }
      return;
    }

    await next();
  });
}

/**
 * 保留リクエスト一覧から特定のリクエストを削除
 */
async function removePendingRequest(kv: KVNamespace, accountId: string, authReqId: string) {
  const pendingListKey = `ciba:pending:${accountId}`;
  const existing = await kv.get<string[]>(pendingListKey, "json") ?? [];
  const updated = existing.filter((id) => id !== authReqId);
  if (updated.length > 0) {
    await kv.put(pendingListKey, JSON.stringify(updated), { expirationTtl: 600 });
  } else {
    await kv.delete(pendingListKey);
  }
}

/**
 * Node.js IncomingMessage からフォームボディをパース
 */
function parseFormBody(req: import("http").IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      const params = new URLSearchParams(body);
      const result: Record<string, string> = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      resolve(result);
    });
    req.on("error", reject);
  });
}

/**
 * Node.js IncomingMessage から JSON ボディをパース
 */
function parseJsonBody(req: import("http").IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// --- HTML レンダリング関数 ---

function renderDeviceRegistrationPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CIBA デバイス登録</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #2196F3; padding-bottom: 10px; font-size: 1.4em; }
    p { color: #666; line-height: 1.6; }
    label { display: block; margin-bottom: 6px; font-weight: bold; color: #555; }
    input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; box-sizing: border-box; }
    .btn { display: inline-block; background: #2196F3; color: #fff; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 16px; }
    .btn:hover { background: #1976D2; }
    .error { color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; margin-bottom: 16px; }
    .info { background: #e3f2fd; padding: 12px; border-radius: 4px; margin-top: 16px; font-size: 14px; color: #1565C0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CIBA 認証デバイス登録</h1>
    <p>このブラウザを認証デバイス（AD）として登録します。<br>
    CIBA フローで認証リクエストが来ると、このデバイスで承認・拒否できます。</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/ciba/device">
      <label for="login_hint">ユーザー識別子（メールアドレス等）</label>
      <input type="text" id="login_hint" name="login_hint" placeholder="user@example.com" required>
      <button type="submit" class="btn">このデバイスを登録</button>
    </form>
    <div class="info">
      登録すると、このブラウザに Cookie が設定され、認証デバイスとして固定されます。
      他のブラウザ・デバイスでは承認操作ができません。
    </div>
  </div>
</body>
</html>`;
}

function renderConsentPage(
  accountId: string,
  deviceId: string,
  pendingRequests: CibaPendingRequest[],
): string {
  const requestsHtml = pendingRequests.length > 0
    ? pendingRequests.map((req) => `
      <div class="request-card" id="req-${req.authReqId}">
        <div class="request-info">
          <strong>クライアント:</strong> ${escapeHtml(req.clientId)}<br>
          <strong>スコープ:</strong> ${escapeHtml(req.scope)}<br>
          ${req.bindingMessage ? `<strong>確認メッセージ:</strong> ${escapeHtml(req.bindingMessage)}<br>` : ""}
          <strong>リクエスト時刻:</strong> ${new Date(req.createdAt).toLocaleString("ja-JP")}
        </div>
        <div class="request-actions">
          <button class="btn btn-approve" onclick="handleAction('approve', '${req.authReqId}')">承認</button>
          <button class="btn btn-deny" onclick="handleAction('deny', '${req.authReqId}')">拒否</button>
        </div>
      </div>
    `).join("")
    : `<div class="no-requests">保留中の認証リクエストはありません</div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CIBA 認証承認</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #2196F3; padding-bottom: 10px; font-size: 1.4em; }
    .device-info { background: #e8f5e9; padding: 10px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; color: #2e7d32; }
    .request-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .request-info { margin-bottom: 12px; line-height: 1.6; }
    .request-actions { display: flex; gap: 8px; }
    .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; color: #fff; }
    .btn-approve { background: #4CAF50; }
    .btn-approve:hover { background: #43A047; }
    .btn-deny { background: #f44336; }
    .btn-deny:hover { background: #e53935; }
    .btn-unregister { background: #9e9e9e; font-size: 12px; padding: 6px 12px; margin-top: 20px; }
    .no-requests { text-align: center; padding: 40px; color: #999; }
    .status { padding: 8px 16px; border-radius: 4px; margin-top: 8px; display: none; }
    .status-success { background: #e8f5e9; color: #2e7d32; }
    .status-error { background: #ffebee; color: #f44336; }
    #polling-indicator { font-size: 12px; color: #999; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CIBA 認証リクエスト</h1>
    <div class="device-info">
      登録ユーザー: <strong>${escapeHtml(accountId)}</strong><br>
      デバイスID: <code>${escapeHtml(deviceId.substring(0, 8))}...</code>
    </div>

    <div id="requests-container">
      ${requestsHtml}
    </div>

    <div id="polling-indicator">自動更新中（5秒間隔）</div>

    <form method="POST" action="/ciba/device/unregister" style="margin-top: 20px;">
      <button type="button" class="btn btn-unregister" onclick="unregisterDevice()">デバイス登録解除</button>
    </form>
  </div>

  <script>
    async function handleAction(action, authReqId) {
      const card = document.getElementById('req-' + authReqId);
      if (!card) return;

      const buttons = card.querySelectorAll('button');
      buttons.forEach(b => b.disabled = true);

      try {
        const res = await fetch('/ciba/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_req_id: authReqId }),
        });
        const data = await res.json();

        if (res.ok) {
          card.style.opacity = '0.5';
          card.innerHTML = '<div class="status status-success" style="display:block">' +
            (action === 'approve' ? '承認しました' : '拒否しました') + '</div>';
          setTimeout(() => card.remove(), 2000);
        } else {
          alert('エラー: ' + (data.error || 'unknown'));
          buttons.forEach(b => b.disabled = false);
        }
      } catch (err) {
        alert('通信エラー: ' + err.message);
        buttons.forEach(b => b.disabled = false);
      }
    }

    async function pollPendingRequests() {
      try {
        const res = await fetch('/ciba/pending');
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById('requests-container');
        const existing = new Set(
          Array.from(container.querySelectorAll('.request-card')).map(el => el.id.replace('req-', ''))
        );

        for (const req of data.requests) {
          if (existing.has(req.authReqId)) continue;
          const card = document.createElement('div');
          card.className = 'request-card';
          card.id = 'req-' + req.authReqId;
          card.innerHTML = '<div class="request-info">' +
            '<strong>クライアント:</strong> ' + req.clientId + '<br>' +
            '<strong>スコープ:</strong> ' + req.scope + '<br>' +
            (req.bindingMessage ? '<strong>確認メッセージ:</strong> ' + req.bindingMessage + '<br>' : '') +
            '<strong>リクエスト時刻:</strong> ' + new Date(req.createdAt).toLocaleString('ja-JP') +
            '</div>' +
            '<div class="request-actions">' +
            '<button class="btn btn-approve" onclick="handleAction(\\'approve\\', \\'' + req.authReqId + '\\')">承認</button>' +
            '<button class="btn btn-deny" onclick="handleAction(\\'deny\\', \\'' + req.authReqId + '\\')">拒否</button>' +
            '</div>';
          container.prepend(card);
          // no-requests メッセージを削除
          const noReq = container.querySelector('.no-requests');
          if (noReq) noReq.remove();
        }
      } catch { /* ignore polling errors */ }
    }

    function unregisterDevice() {
      if (confirm('デバイス登録を解除しますか？')) {
        document.cookie = 'ciba_device_id=; Max-Age=0; Path=/';
        window.location.href = '/ciba/device';
      }
    }

    // 5秒間隔でポーリング
    setInterval(pollPendingRequests, 5000);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
