/**
 * CIBA (Client Initiated Backchannel Authentication) のコンセントルート
 *
 * 認証デバイス（AD）側の実装:
 * - FIDO2/WebAuthn によるデバイス登録（Platform Authenticator でデバイス固定）
 * - 保留中リクエスト一覧（自動ポーリング）
 * - FIDO2 認証による承認（秘密鍵はデバイスから出ない → 真のデバイス固定）
 * - 拒否
 */
import type Provider from "oidc-provider";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { CibaPendingRequest } from "./oidc-config";

type ProviderInstance = InstanceType<typeof Provider>;

const RP_NAME = "CIBA Sample OP";
const RP_ID = "localhost";
const ORIGIN = "http://localhost:8787";

/**
 * KV に保存する FIDO デバイスバインディング情報
 */
interface FidoDeviceBinding {
  accountId: string;
  credentialId: string;         // Base64URL
  credentialPublicKey: string;  // Base64URL (Uint8Array をエンコード)
  counter: number;
  transports?: string[];
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  registeredAt: number;
}

// --- ユーティリティ ---

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * CIBA 用のカスタムルートを Provider の Koa ミドルウェアとして追加
 */
export function addCibaRoutes(provider: ProviderInstance, kv: KVNamespace) {
  provider.use(async (ctx, next) => {

    // ============================================================
    // デバイス登録ページ
    // ============================================================
    if (ctx.method === "GET" && ctx.path === "/ciba/device") {
      ctx.type = "text/html";
      ctx.body = renderDeviceRegistrationPage();
      return;
    }

    // ============================================================
    // WebAuthn 登録: オプション生成
    // ============================================================
    if (ctx.method === "POST" && ctx.path === "/ciba/device/register/options") {
      const body = await parseJsonBody(ctx.req);
      const accountId = body.account_id?.trim();

      if (!accountId) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "account_id is required" });
        return;
      }

      // 既存クレデンシャルがあれば除外
      const existingCredId = await kv.get(`ciba:account:${accountId}`);
      const excludeCredentials = existingCredId
        ? [{ id: existingCredId, transports: ["internal" as const] }]
        : [];

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: accountId,
        userDisplayName: accountId,
        attestationType: "none",
        authenticatorSelection: {
          // platform: デバイス内蔵の認証器（Touch ID, Windows Hello 等）に限定
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        excludeCredentials,
      });

      // チャレンジを一時保存
      const challengeId = crypto.randomUUID();
      await kv.put(`ciba:challenge:${challengeId}`, JSON.stringify({
        challenge: options.challenge,
        accountId,
        type: "registration",
      }), { expirationTtl: 300 });

      ctx.type = "application/json";
      ctx.body = JSON.stringify({ options, challengeId });
      return;
    }

    // ============================================================
    // WebAuthn 登録: 検証
    // ============================================================
    if (ctx.method === "POST" && ctx.path === "/ciba/device/register/verify") {
      const body = await parseJsonBody(ctx.req);
      const { challengeId, attestationResponse } = body;

      if (!challengeId || !attestationResponse) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "challengeId and attestationResponse are required" });
        return;
      }

      // チャレンジを取得・削除
      const challengeData = await kv.get<{ challenge: string; accountId: string; type: string }>(
        `ciba:challenge:${challengeId}`, "json",
      );
      await kv.delete(`ciba:challenge:${challengeId}`);

      if (!challengeData || challengeData.type !== "registration") {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "invalid or expired challenge" });
        return;
      }

      try {
        const verification = await verifyRegistrationResponse({
          response: attestationResponse,
          expectedChallenge: challengeData.challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });

        if (!verification.verified || !verification.registrationInfo) {
          ctx.status = 400;
          ctx.type = "application/json";
          ctx.body = JSON.stringify({ error: "verification_failed" });
          return;
        }

        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        // デバイスバインディングを保存
        const binding: FidoDeviceBinding = {
          accountId: challengeData.accountId,
          credentialId: credential.id,
          credentialPublicKey: uint8ArrayToBase64Url(new Uint8Array(credential.publicKey)),
          counter: credential.counter,
          transports: credential.transports,
          credentialDeviceType,
          credentialBackedUp,
          registeredAt: Date.now(),
        };

        // クレデンシャルID → バインディング
        await kv.put(
          `ciba:device:${credential.id}`,
          JSON.stringify(binding),
          { expirationTtl: 86400 * 365 },
        );
        // アカウント → クレデンシャルID
        await kv.put(
          `ciba:account:${challengeData.accountId}`,
          credential.id,
          { expirationTtl: 86400 * 365 },
        );

        // セッション Cookie（コンセントページへのアクセス用）
        const sessionId = crypto.randomUUID();
        await kv.put(`ciba:session:${sessionId}`, JSON.stringify({
          accountId: challengeData.accountId,
          credentialId: credential.id,
        }), { expirationTtl: 86400 * 30 });

        ctx.cookies.set("ciba_session", sessionId, {
          httpOnly: true,
          maxAge: 86400 * 30 * 1000,
          sameSite: "lax",
          path: "/",
        });

        console.log(`[CIBA] FIDO デバイス登録完了: account=${challengeData.accountId}, credId=${credential.id.substring(0, 16)}..., type=${credentialDeviceType}`);

        ctx.type = "application/json";
        ctx.body = JSON.stringify({
          status: "registered",
          credentialDeviceType,
          credentialBackedUp,
        });
      } catch (err) {
        console.error("[CIBA] WebAuthn 登録検証エラー:", err);
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "verification_error", detail: String(err) });
      }
      return;
    }

    // ============================================================
    // コンセントページ
    // ============================================================
    if (ctx.method === "GET" && ctx.path === "/ciba/consent") {
      const session = await getSession(ctx, kv);
      if (!session) {
        ctx.redirect("/ciba/device");
        return;
      }

      const pendingRequests = await getPendingRequests(kv, session.accountId);
      ctx.type = "text/html";
      ctx.body = renderConsentPage(session.accountId, pendingRequests);
      return;
    }

    // ============================================================
    // 保留リクエスト一覧 API（ポーリング用）
    // ============================================================
    if (ctx.method === "GET" && ctx.path === "/ciba/pending") {
      const session = await getSession(ctx, kv);
      if (!session) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "not_authenticated" });
        return;
      }

      const pendingRequests = await getPendingRequests(kv, session.accountId);
      ctx.type = "application/json";
      ctx.body = JSON.stringify({ requests: pendingRequests });
      return;
    }

    // ============================================================
    // WebAuthn 認証: オプション生成（承認用）
    // ============================================================
    if (ctx.method === "POST" && ctx.path === "/ciba/approve/options") {
      const session = await getSession(ctx, kv);
      if (!session) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "not_authenticated" });
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

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: [{
          id: session.credentialId,
          transports: ["internal"],
        }],
        userVerification: "required",
      });

      const challengeId = crypto.randomUUID();
      await kv.put(`ciba:challenge:${challengeId}`, JSON.stringify({
        challenge: options.challenge,
        accountId: session.accountId,
        credentialId: session.credentialId,
        authReqId,
        type: "authentication",
      }), { expirationTtl: 300 });

      ctx.type = "application/json";
      ctx.body = JSON.stringify({ options, challengeId });
      return;
    }

    // ============================================================
    // WebAuthn 認証: 検証 + CIBA 承認
    // ============================================================
    if (ctx.method === "POST" && ctx.path === "/ciba/approve/verify") {
      const session = await getSession(ctx, kv);
      if (!session) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "not_authenticated" });
        return;
      }

      const body = await parseJsonBody(ctx.req);
      const { challengeId, assertionResponse } = body;

      if (!challengeId || !assertionResponse) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "challengeId and assertionResponse are required" });
        return;
      }

      const challengeData = await kv.get<{
        challenge: string;
        accountId: string;
        credentialId: string;
        authReqId: string;
        type: string;
      }>(`ciba:challenge:${challengeId}`, "json");
      await kv.delete(`ciba:challenge:${challengeId}`);

      if (!challengeData || challengeData.type !== "authentication") {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "invalid or expired challenge" });
        return;
      }

      // デバイスバインディングを取得
      const binding = await kv.get<FidoDeviceBinding>(
        `ciba:device:${challengeData.credentialId}`, "json",
      );
      if (!binding) {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "device_not_found" });
        return;
      }

      try {
        const verification = await verifyAuthenticationResponse({
          response: assertionResponse,
          expectedChallenge: challengeData.challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: binding.credentialId,
            publicKey: base64UrlToUint8Array(binding.credentialPublicKey) as Uint8Array<ArrayBuffer>,
            counter: binding.counter,
            transports: binding.transports as ("internal" | "usb" | "ble" | "nfc")[] | undefined,
          },
          requireUserVerification: true,
        });

        if (!verification.verified) {
          ctx.status = 403;
          ctx.type = "application/json";
          ctx.body = JSON.stringify({ error: "authentication_failed" });
          return;
        }

        // カウンター更新
        binding.counter = verification.authenticationInfo.newCounter;
        await kv.put(
          `ciba:device:${binding.credentialId}`,
          JSON.stringify(binding),
          { expirationTtl: 86400 * 365 },
        );

        // CIBA リクエスト承認
        const authReqId = challengeData.authReqId;
        const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
        if (!pendingReq || pendingReq.accountId !== session.accountId) {
          ctx.status = 404;
          ctx.type = "application/json";
          ctx.body = JSON.stringify({ error: "request_not_found" });
          return;
        }

        const grant = new provider.Grant({
          accountId: session.accountId,
          clientId: pendingReq.clientId,
        });
        grant.addOIDCScope(pendingReq.scope);
        await grant.save();

        await provider.backchannelResult(authReqId, grant, {
          acr: "urn:mace:incommon:iap:silver",
          amr: ["fido"],
          authTime: Math.floor(Date.now() / 1000),
        });

        await removePendingRequest(kv, session.accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] FIDO 認証で承認: auth_req_id=${authReqId}, account=${session.accountId}`);

        ctx.type = "application/json";
        ctx.body = JSON.stringify({ status: "approved" });
      } catch (err) {
        console.error("[CIBA] WebAuthn 認証検証エラー:", err);
        ctx.status = 500;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "verification_error", detail: String(err) });
      }
      return;
    }

    // ============================================================
    // リクエスト拒否（FIDO不要 — セッションのみ）
    // ============================================================
    if (ctx.method === "POST" && ctx.path === "/ciba/deny") {
      const session = await getSession(ctx, kv);
      if (!session) {
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "not_authenticated" });
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

      const pendingReq = await kv.get<CibaPendingRequest>(`ciba:request:${authReqId}`, "json");
      if (!pendingReq || pendingReq.accountId !== session.accountId) {
        ctx.status = 404;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ error: "request_not_found" });
        return;
      }

      try {
        await provider.backchannelResult(authReqId, "access_denied");
        await removePendingRequest(kv, session.accountId, authReqId);
        await kv.delete(`ciba:request:${authReqId}`);

        console.log(`[CIBA] 拒否: auth_req_id=${authReqId}, account=${session.accountId}`);
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

    await next();
  });
}

// --- ヘルパー ---

interface SessionData {
  accountId: string;
  credentialId: string;
}

async function getSession(
  ctx: { cookies: { get(name: string): string | undefined } },
  kv: KVNamespace,
): Promise<SessionData | null> {
  const sessionId = ctx.cookies.get("ciba_session");
  if (!sessionId) return null;
  return kv.get<SessionData>(`ciba:session:${sessionId}`, "json");
}

async function getPendingRequests(kv: KVNamespace, accountId: string): Promise<CibaPendingRequest[]> {
  const pendingIds = await kv.get<string[]>(`ciba:pending:${accountId}`, "json") ?? [];
  const requests: CibaPendingRequest[] = [];
  for (const reqId of pendingIds) {
    const req = await kv.get<CibaPendingRequest>(`ciba:request:${reqId}`, "json");
    if (req) requests.push(req);
  }
  return requests;
}

async function removePendingRequest(kv: KVNamespace, accountId: string, authReqId: string) {
  const key = `ciba:pending:${accountId}`;
  const existing = await kv.get<string[]>(key, "json") ?? [];
  const updated = existing.filter((id) => id !== authReqId);
  if (updated.length > 0) {
    await kv.put(key, JSON.stringify(updated), { expirationTtl: 600 });
  } else {
    await kv.delete(key);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonBody(req: import("http").IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- HTML レンダリング ---

const COMMON_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  h1 { color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; font-size: 1.4em; }
  p { color: #666; line-height: 1.6; }
  label { display: block; margin-bottom: 6px; font-weight: bold; color: #555; }
  input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; margin-bottom: 14px; }
  .btn { display: inline-block; color: #fff; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
  .btn:hover { opacity: 0.9; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #1a73e8; }
  .btn-approve { background: #4CAF50; }
  .btn-deny { background: #f44336; }
  .btn-muted { background: #9e9e9e; font-size: 12px; padding: 6px 12px; }
  .error { color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; margin-bottom: 16px; }
  .success { color: #2e7d32; background: #e8f5e9; padding: 10px; border-radius: 4px; margin-bottom: 16px; }
  .info { background: #e3f2fd; padding: 12px; border-radius: 4px; margin-top: 16px; font-size: 14px; color: #1565C0; line-height: 1.5; }
`;

function renderDeviceRegistrationPage(): string {
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
    <p>このデバイスを FIDO2/WebAuthn で認証デバイスとして登録します。<br>
    生体認証（指紋・顔）やデバイスPINで本人確認を行い、デバイスに固定されます。</p>

    <div id="error-msg" class="error" style="display:none"></div>
    <div id="success-msg" class="success" style="display:none"></div>

    <div id="register-form">
      <label for="account_id">ユーザー識別子</label>
      <input type="text" id="account_id" placeholder="例: user01, user@example.com, 090XXXXXXXX" required>

      <button class="btn btn-primary" onclick="startRegistration()" id="register-btn">
        FIDO2 でデバイスを登録
      </button>
    </div>

    <div class="info">
      <strong>FIDO2 デバイス固定:</strong><br>
      ・秘密鍵はこのデバイスのセキュアエレメントに保存されます<br>
      ・生体認証またはデバイスPINで本人確認を行います<br>
      ・秘密鍵はデバイス外に出ないため、他のデバイスでは承認不可能です
    </div>
  </div>

  <script>
    async function startRegistration() {
      var accountId = document.getElementById('account_id').value.trim();
      if (!accountId) { alert('ユーザー識別子を入力してください'); return; }

      var btn = document.getElementById('register-btn');
      btn.disabled = true;
      btn.textContent = '登録中...';
      hideMessages();

      try {
        // 1. 登録オプションを取得
        var optRes = await fetch('/ciba/device/register/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId }),
        });
        var optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || 'オプション取得に失敗');

        var options = optData.options;
        var challengeId = optData.challengeId;

        // 2. WebAuthn API でクレデンシャル作成
        var publicKey = {
          challenge: base64UrlToBuffer(options.challenge),
          rp: options.rp,
          user: {
            id: base64UrlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          attestation: options.attestation,
          authenticatorSelection: options.authenticatorSelection,
          excludeCredentials: (options.excludeCredentials || []).map(function(c) {
            return { id: base64UrlToBuffer(c.id), type: c.type, transports: c.transports };
          }),
        };

        var credential = await navigator.credentials.create({ publicKey: publicKey });

        // 3. レスポンスをサーバーに送信
        var attestationResponse = {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
            attestationObject: bufferToBase64Url(credential.response.attestationObject),
            transports: credential.response.getTransports ? credential.response.getTransports() : [],
          },
          clientExtensionResults: credential.getClientExtensionResults(),
          authenticatorAttachment: credential.authenticatorAttachment,
        };

        var verifyRes = await fetch('/ciba/device/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: challengeId, attestationResponse: attestationResponse }),
        });
        var verifyData = await verifyRes.json();

        if (!verifyRes.ok) throw new Error(verifyData.error || '登録検証に失敗');

        showSuccess('デバイス登録が完了しました (type: ' + verifyData.credentialDeviceType + ')');
        setTimeout(function() { window.location.href = '/ciba/consent'; }, 1500);

      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showError('認証がキャンセルされました。もう一度お試しください。');
        } else if (err.name === 'NotSupportedError') {
          showError('このデバイス/ブラウザはPlatform Authenticatorに対応していません。');
        } else {
          showError(err.message || String(err));
        }
        btn.disabled = false;
        btn.textContent = 'FIDO2 でデバイスを登録';
      }
    }

    // --- Base64URL ユーティリティ ---
    function base64UrlToBuffer(b64url) {
      var base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      var padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      var binary = atob(padded);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function bufferToBase64Url(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    }

    function hideMessages() {
      document.getElementById('error-msg').style.display = 'none';
      document.getElementById('success-msg').style.display = 'none';
    }
    function showError(msg) {
      var el = document.getElementById('error-msg');
      el.textContent = msg;
      el.style.display = 'block';
    }
    function showSuccess(msg) {
      var el = document.getElementById('success-msg');
      el.textContent = msg;
      el.style.display = 'block';
    }
  </script>
</body>
</html>`;
}

function renderConsentPage(
  accountId: string,
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
    .request-actions { display: flex; gap: 8px; align-items: center; }
    .no-requests { text-align: center; padding: 40px; color: #999; }
    .result-msg { padding: 8px 16px; border-radius: 4px; }
    .result-ok { background: #e8f5e9; color: #2e7d32; }
    .result-err { background: #ffebee; color: #f44336; }
    #polling-indicator { font-size: 12px; color: #999; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CIBA 認証リクエスト</h1>
    <div class="device-info">
      登録ユーザー: <strong>${escapeHtml(accountId)}</strong>
      （FIDO2 デバイス固定済み）
    </div>

    <div id="requests-container">
      ${requestsHtml}
    </div>

    <div id="polling-indicator">自動更新中（5秒間隔）</div>

    <button type="button" class="btn btn-muted" style="margin-top: 20px;"
      onclick="if(confirm('デバイス登録を解除しますか？')) { document.cookie='ciba_session=;Max-Age=0;Path=/'; location.href='/ciba/device'; }">
      デバイス登録解除
    </button>
  </div>

  <script>
    async function handleApprove(authReqId) {
      var card = document.getElementById('req-' + authReqId);
      if (!card) return;

      var buttons = card.querySelectorAll('button');
      buttons.forEach(function(b) { b.disabled = true; });

      try {
        // 1. 認証オプション取得
        var optRes = await fetch('/ciba/approve/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_req_id: authReqId }),
        });
        var optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || 'オプション取得に失敗');

        var options = optData.options;
        var challengeId = optData.challengeId;

        // 2. WebAuthn 認証
        var publicKey = {
          challenge: base64UrlToBuffer(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification,
          allowCredentials: (options.allowCredentials || []).map(function(c) {
            return { id: base64UrlToBuffer(c.id), type: c.type, transports: c.transports };
          }),
        };

        var assertion = await navigator.credentials.get({ publicKey: publicKey });

        // 3. 検証 + 承認
        var assertionResponse = {
          id: assertion.id,
          rawId: bufferToBase64Url(assertion.rawId),
          type: assertion.type,
          response: {
            clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
            authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
            signature: bufferToBase64Url(assertion.response.signature),
            userHandle: assertion.response.userHandle ? bufferToBase64Url(assertion.response.userHandle) : null,
          },
          clientExtensionResults: assertion.getClientExtensionResults(),
          authenticatorAttachment: assertion.authenticatorAttachment,
        };

        var verifyRes = await fetch('/ciba/approve/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: challengeId, assertionResponse: assertionResponse }),
        });
        var verifyData = await verifyRes.json();

        if (!verifyRes.ok) throw new Error(verifyData.error || '承認に失敗');

        showResult(card, '承認しました（FIDO2 認証済み）', true);

      } catch (err) {
        if (err.name === 'NotAllowedError') {
          alert('認証がキャンセルされました');
        } else {
          alert('エラー: ' + (err.message || String(err)));
        }
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
        '<strong>クライアント:</strong> ' + esc(req.clientId) + '<br>' +
        '<strong>スコープ:</strong> ' + esc(req.scope) + '<br>';
      if (req.bindingMessage) {
        info += '<strong>確認メッセージ:</strong> <code>' + esc(req.bindingMessage) + '</code><br>';
      }
      info += '<strong>リクエスト時刻:</strong> ' + new Date(req.createdAt).toLocaleString('ja-JP') + '</div>';

      var actions = '<div class="request-actions">' +
        '<button class="btn btn-approve" onclick="handleApprove(\\'' + req.authReqId + '\\')">FIDO2 で承認</button>' +
        '<button class="btn btn-deny" onclick="handleDeny(\\'' + req.authReqId + '\\')">拒否</button>' +
        '</div>';

      card.innerHTML = info + actions;
      return card;
    }

    function esc(str) {
      var d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    // --- Base64URL ---
    function base64UrlToBuffer(b64url) {
      var base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      var padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      var binary = atob(padded);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function bufferToBase64Url(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
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
          container.prepend(buildRequestCard(req));
          var noReq = container.querySelector('.no-requests');
          if (noReq) noReq.remove();
        }
      } catch (e) { /* ignore */ }
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
        <button class="btn btn-approve" onclick="handleApprove('${escapeHtml(req.authReqId)}')">FIDO2 で承認</button>
        <button class="btn btn-deny" onclick="handleDeny('${escapeHtml(req.authReqId)}')">拒否</button>
      </div>
    </div>`;
}
