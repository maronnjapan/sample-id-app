/**
 * CIBA (Client Initiated Backchannel Authentication) のコンセントルート
 *
 * 認証デバイス（AD）側の実装:
 * - デバイス登録（PIN設定 + User-Agent フィンガープリント + Cookie バインディング）
 * - 保留中リクエスト一覧（自動ポーリング）
 * - 承認（PIN 再入力による本人確認）
 * - 拒否
 *
 * デバイス固定の仕組み:
 * 1. Cookie (HttpOnly) でデバイスを識別
 * 2. User-Agent をフィンガープリントとして保存・照合
 * 3. 承認操作には PIN の再入力が必要（所持＋知識の2要素）
 */
import type Provider from "oidc-provider";
import type { CibaPendingRequest } from "./oidc-config";

type ProviderInstance = InstanceType<typeof Provider>;

/**
 * KV に保存するデバイスバインディング情報
 */
interface DeviceBinding {
  accountId: string;
  pinHash: string; // SHA-256(salt + pin)
  salt: string;
  userAgent: string; // 登録時の User-Agent
  registeredAt: number;
}

// --- 暗号ユーティリティ ---

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- ミドルウェア内のデバイス検証共通処理 ---

interface VerifiedDevice {
  deviceId: string;
  binding: DeviceBinding;
}

async function verifyDevice(
  ctx: { cookies: { get(name: string): string | undefined }; req: { headers: Record<string, string | string[] | undefined> } },
  kv: KVNamespace,
): Promise<VerifiedDevice | null> {
  const deviceId = ctx.cookies.get("ciba_device_id");
  if (!deviceId) return null;

  const binding = await kv.get<DeviceBinding>(`ciba:device:${deviceId}`, "json");
  if (!binding) return null;

  // User-Agent フィンガープリント照合
  const currentUA = String(ctx.req.headers["user-agent"] ?? "");
  if (currentUA !== binding.userAgent) {
    console.warn(`[CIBA] User-Agent不一致: device=${deviceId}, expected=${binding.userAgent}, got=${currentUA}`);
    return null;
  }

  return { deviceId, binding };
}

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
      const loginHint = body.login_hint?.trim();
      const pin = body.pin?.trim();

      if (!loginHint) {
        ctx.type = "text/html";
        ctx.body = renderDeviceRegistrationPage("ユーザー識別子を入力してください");
        return;
      }
      if (!pin || pin.length < 4) {
        ctx.type = "text/html";
        ctx.body = renderDeviceRegistrationPage("PINは4文字以上で入力してください");
        return;
      }

      const deviceId = crypto.randomUUID();
      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);
      const userAgent = String(ctx.req.headers["user-agent"] ?? "");

      const binding: DeviceBinding = {
        accountId: loginHint,
        pinHash,
        salt,
        userAgent,
        registeredAt: Date.now(),
      };

      await kv.put(`ciba:device:${deviceId}`, JSON.stringify(binding), {
        expirationTtl: 86400 * 30, // 30日
      });

      ctx.cookies.set("ciba_device_id", deviceId, {
        httpOnly: true,
        maxAge: 86400 * 30 * 1000,
        sameSite: "lax",
        path: "/",
      });

      console.log(`[CIBA] デバイス登録: device=${deviceId}, account=${loginHint}, ua=${userAgent.substring(0, 50)}`);
      ctx.redirect("/ciba/consent");
      return;
    }

    // --- コンセントページ ---
    if (ctx.method === "GET" && ctx.path === "/ciba/consent") {
      const device = await verifyDevice(ctx, kv);
      if (!device) {
        ctx.cookies.set("ciba_device_id", "", { maxAge: 0, path: "/" });
        ctx.redirect("/ciba/device");
        return;
      }

      const pendingRequests = await getPendingRequests(kv, device.binding.accountId);

      ctx.type = "text/html";
      ctx.body = renderConsentPage(device.binding.accountId, device.deviceId, pendingRequests);
      return;
    }

    // --- 保留リクエスト一覧 API ---
    if (ctx.method === "GET" && ctx.path === "/ciba/pending") {
      const device = await verifyDevice(ctx, kv);
      if (!device) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "device_not_verified" });
        return;
      }

      const pendingRequests = await getPendingRequests(kv, device.binding.accountId);
      ctx.type = "application/json";
      ctx.body = JSON.stringify({ requests: pendingRequests });
      return;
    }

    // --- リクエスト承認（PIN必須） ---
    if (ctx.method === "POST" && ctx.path === "/ciba/approve") {
      const device = await verifyDevice(ctx, kv);
      if (!device) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "device_not_verified" });
        return;
      }

      const body = await parseJsonBody(ctx.req);
      const authReqId = body.auth_req_id;
      const pin = body.pin;

      if (!authReqId) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "auth_req_id is required" });
        return;
      }

      if (!pin) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "pin_required", message: "承認にはPINの入力が必要です" });
        return;
      }

      // PIN 検証
      const inputHash = await hashPin(pin, device.binding.salt);
      if (inputHash !== device.binding.pinHash) {
        ctx.status = 403;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "invalid_pin", message: "PINが正しくありません" });
        return;
      }

      // 保留リクエスト検証
      const accountId = device.binding.accountId;
      const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
      if (!pendingReq || pendingReq.accountId !== accountId) {
        ctx.status = 404;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "request_not_found" });
        return;
      }

      try {
        const grant = new provider.Grant({
          accountId,
          clientId: pendingReq.clientId,
        });
        grant.addOIDCScope(pendingReq.scope);
        await grant.save();

        await provider.backchannelResult(authReqId, grant, {
          acr: "urn:mace:incommon:iap:bronze",
          amr: ["pin"],
          authTime: Math.floor(Date.now() / 1000),
        });

        await removePendingRequest(kv, accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] 承認: auth_req_id=${authReqId}, account=${accountId}`);
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ status: "approved" });
      } catch (err) {
        console.error("[CIBA] 承認エラー:", err);
        ctx.status = 500;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "approval_failed", detail: String(err) });
      }
      return;
    }

    // --- リクエスト拒否 ---
    if (ctx.method === "POST" && ctx.path === "/ciba/deny") {
      const device = await verifyDevice(ctx, kv);
      if (!device) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "device_not_verified" });
        return;
      }

      const body = await parseJsonBody(ctx.req);
      const authReqId = body.auth_req_id;
      if (!authReqId) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "auth_req_id is required" });
        return;
      }

      const accountId = device.binding.accountId;
      const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
      if (!pendingReq || pendingReq.accountId !== accountId) {
        ctx.status = 404;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "request_not_found" });
        return;
      }

      try {
        await provider.backchannelResult(authReqId, "access_denied");
        await removePendingRequest(kv, accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] 拒否: auth_req_id=${authReqId}, account=${accountId}`);
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ status: "denied" });
      } catch (err) {
        console.error("[CIBA] 拒否エラー:", err);
        ctx.status = 500;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "denial_failed", detail: String(err) });
      }
      return;
    }

    // --- デバイス情報 API（デバッグ用） ---
    if (ctx.method === "GET" && ctx.path === "/ciba/device/info") {
      const device = await verifyDevice(ctx, kv);
      if (!device) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "device_not_verified" });
        return;
      }

      ctx.type = "application/json";
      ctx.body = JSON.stringify({
        deviceId: device.deviceId,
        accountId: device.binding.accountId,
        registeredAt: new Date(device.binding.registeredAt).toISOString(),
        userAgentMatch: true,
      });
      return;
    }

    await next();
  });
}

// --- ヘルパー関数 ---

async function getPendingRequests(kv: KVNamespace, accountId: string): Promise<CibaPendingRequest[]> {
  const pendingIds = await kv.get<string[]>(`ciba:pending:${accountId}`, "json") ?? [];
  const requests: CibaPendingRequest[] = [];
  for (const reqId of pendingIds) {
    const req = await kv.get<CibaPendingRequest>(`ciba:request:${reqId}`, "json");
    if (req) {
      requests.push(req);
    }
  }
  return requests;
}

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

// --- HTML レンダリング ---

const COMMON_STYLES = `
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  h1 { color: #333; border-bottom: 2px solid #2196F3; padding-bottom: 10px; font-size: 1.4em; }
  p { color: #666; line-height: 1.6; }
  label { display: block; margin-bottom: 6px; font-weight: bold; color: #555; }
  input[type="text"], input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; box-sizing: border-box; margin-bottom: 14px; }
  .btn { display: inline-block; background: #4CAF50; color: #fff; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
  .btn:hover { opacity: 0.9; }
  .error { color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; margin-bottom: 16px; }
  .info { background: #e3f2fd; padding: 12px; border-radius: 4px; margin-top: 16px; font-size: 14px; color: #1565C0; line-height: 1.5; }
`;

function renderDeviceRegistrationPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CIBA 認証デバイス登録</title>
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>CIBA 認証デバイス（AD）登録</h1>
    <p>このブラウザを認証デバイスとして登録します。<br>
    CIBAフローで認証リクエストが来ると、このデバイスで承認・拒否できます。</p>

    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}

    <form method="POST" action="/ciba/device">
      <label for="login_hint">ユーザー識別子</label>
      <input type="text" id="login_hint" name="login_hint"
        placeholder="例: user01, user@example.com, 090XXXXXXXX" required>

      <label for="pin">認証PIN（4文字以上）</label>
      <input type="password" id="pin" name="pin"
        placeholder="承認時に入力するPIN" minlength="4" required>

      <button type="submit" class="btn">このデバイスを登録</button>
    </form>

    <div class="info">
      <strong>デバイス固定について:</strong><br>
      ・Cookie + User-Agentでこのブラウザに固定されます<br>
      ・承認時にはPINの再入力が必要です（所持＋知識の2要素）<br>
      ・別のブラウザ・デバイスからは承認操作ができません
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
    ? pendingRequests.map((req) => renderRequestCard(req)).join("")
    : `<div class="no-requests">保留中の認証リクエストはありません</div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CIBA 認証承認</title>
  <style>
    ${COMMON_STYLES}
    .device-info { background: #e8f5e9; padding: 10px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; color: #2e7d32; }
    .request-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .request-info { margin-bottom: 12px; line-height: 1.6; }
    .request-actions { display: flex; gap: 8px; align-items: flex-end; }
    .btn { padding: 10px 20px; font-size: 14px; }
    .btn-approve { background: #4CAF50; }
    .btn-deny { background: #f44336; }
    .btn-unregister { background: #9e9e9e; font-size: 12px; padding: 6px 12px; margin-top: 20px; }
    .no-requests { text-align: center; padding: 40px; color: #999; }
    .pin-input { width: 120px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-bottom: 0; }
    .pin-label { font-size: 12px; color: #666; margin-bottom: 4px; display: block; }
    .result-msg { padding: 8px 16px; border-radius: 4px; margin-top: 8px; }
    .result-ok { background: #e8f5e9; color: #2e7d32; }
    .result-err { background: #ffebee; color: #f44336; }
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

    <button type="button" class="btn btn-unregister" onclick="unregisterDevice()">デバイス登録解除</button>
  </div>

  <script>
    async function handleApprove(authReqId) {
      var card = document.getElementById('req-' + authReqId);
      if (!card) return;

      var pinInput = card.querySelector('.pin-input');
      var pin = pinInput ? pinInput.value : '';
      if (!pin) {
        alert('PINを入力してください');
        pinInput.focus();
        return;
      }

      var buttons = card.querySelectorAll('button');
      buttons.forEach(function(b) { b.disabled = true; });

      try {
        var res = await fetch('/ciba/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_req_id: authReqId, pin: pin }),
        });
        var data = await res.json();

        if (res.ok) {
          showResult(card, '承認しました', true);
        } else if (data.error === 'invalid_pin') {
          alert('PINが正しくありません');
          pinInput.value = '';
          pinInput.focus();
          buttons.forEach(function(b) { b.disabled = false; });
        } else {
          alert('エラー: ' + (data.message || data.error));
          buttons.forEach(function(b) { b.disabled = false; });
        }
      } catch (err) {
        alert('通信エラー: ' + err.message);
        buttons.forEach(function(b) { b.disabled = false; });
      }
    }

    async function handleDeny(authReqId) {
      var card = document.getElementById('req-' + authReqId);
      if (!card) return;
      if (!confirm('このリクエストを拒否しますか？')) return;

      var buttons = card.querySelectorAll('button');
      buttons.forEach(function(b) { b.disabled = true; });

      try {
        var res = await fetch('/ciba/deny', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_req_id: authReqId }),
        });
        if (res.ok) {
          showResult(card, '拒否しました', false);
        } else {
          var data = await res.json();
          alert('エラー: ' + (data.error || 'unknown'));
          buttons.forEach(function(b) { b.disabled = false; });
        }
      } catch (err) {
        alert('通信エラー: ' + err.message);
        buttons.forEach(function(b) { b.disabled = false; });
      }
    }

    function showResult(card, message, isSuccess) {
      card.innerHTML = '<div class="result-msg ' + (isSuccess ? 'result-ok' : 'result-err') + '">' + message + '</div>';
      setTimeout(function() { card.remove(); checkEmpty(); }, 2000);
    }

    function checkEmpty() {
      var container = document.getElementById('requests-container');
      if (!container.querySelector('.request-card')) {
        container.innerHTML = '<div class="no-requests">保留中の認証リクエストはありません</div>';
      }
    }

    function buildRequestCard(req) {
      var card = document.createElement('div');
      card.className = 'request-card';
      card.id = 'req-' + req.authReqId;

      var info = '<div class="request-info">' +
        '<strong>クライアント:</strong> ' + escapeHtml(req.clientId) + '<br>' +
        '<strong>スコープ:</strong> ' + escapeHtml(req.scope) + '<br>';
      if (req.bindingMessage) {
        info += '<strong>確認メッセージ:</strong> <code>' + escapeHtml(req.bindingMessage) + '</code><br>';
      }
      info += '<strong>リクエスト時刻:</strong> ' + new Date(req.createdAt).toLocaleString('ja-JP') + '</div>';

      var actions = '<div class="request-actions">' +
        '<div><span class="pin-label">認証PIN:</span>' +
        '<input type="password" class="pin-input" placeholder="PIN"></div>' +
        '<button class="btn btn-approve" onclick="handleApprove(\\'' + req.authReqId + '\\')">承認</button>' +
        '<button class="btn btn-deny" onclick="handleDeny(\\'' + req.authReqId + '\\')">拒否</button>' +
        '</div>';

      card.innerHTML = info + actions;
      return card;
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    async function pollPendingRequests() {
      try {
        var res = await fetch('/ciba/pending');
        if (!res.ok) return;
        var data = await res.json();
        var container = document.getElementById('requests-container');
        var existingIds = new Set(
          Array.from(container.querySelectorAll('.request-card')).map(function(el) {
            return el.id.replace('req-', '');
          })
        );

        for (var i = 0; i < data.requests.length; i++) {
          var req = data.requests[i];
          if (existingIds.has(req.authReqId)) continue;
          var card = buildRequestCard(req);
          container.prepend(card);
          var noReq = container.querySelector('.no-requests');
          if (noReq) noReq.remove();
        }
      } catch (e) { /* ポーリングエラーは無視 */ }
    }

    function unregisterDevice() {
      if (confirm('デバイス登録を解除しますか？\\nこのデバイスでは承認操作ができなくなります。')) {
        document.cookie = 'ciba_device_id=; Max-Age=0; Path=/';
        window.location.href = '/ciba/device';
      }
    }

    setInterval(pollPendingRequests, 5000);
  </script>
</body>
</html>`;
}

function renderRequestCard(req: CibaPendingRequest): string {
  return `
    <div class="request-card" id="req-${escapeHtml(req.authReqId)}">
      <div class="request-info">
        <strong>クライアント:</strong> ${escapeHtml(req.clientId)}<br>
        <strong>スコープ:</strong> ${escapeHtml(req.scope)}<br>
        ${req.bindingMessage ? `<strong>確認メッセージ:</strong> <code>${escapeHtml(req.bindingMessage)}</code><br>` : ""}
        <strong>リクエスト時刻:</strong> ${new Date(req.createdAt).toLocaleString("ja-JP")}
      </div>
      <div class="request-actions">
        <div>
          <span class="pin-label">認証PIN:</span>
          <input type="password" class="pin-input" placeholder="PIN">
        </div>
        <button class="btn btn-approve" onclick="handleApprove('${escapeHtml(req.authReqId)}')">承認</button>
        <button class="btn btn-deny" onclick="handleDeny('${escapeHtml(req.authReqId)}')">拒否</button>
      </div>
    </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
