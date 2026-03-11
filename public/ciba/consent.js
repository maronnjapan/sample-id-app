// CIBA コンセントページ — ポーリング・FIDO2 承認・Web Push 購読
// lib.js の base64UrlToBuffer / bufferToBase64Url / escapeHtml に依存

// --- FIDO2 承認 ---

async function handleApprove(authReqId) {
  const card = document.getElementById("req-" + authReqId);
  if (!card) return;

  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));

  try {
    // 1. 認証オプション取得
    const optRes = await fetch("/ciba/approve/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_req_id: authReqId }),
    });
    const optData = await optRes.json();
    if (!optRes.ok) throw new Error(optData.error || "オプション取得に失敗");

    const { options, challengeId } = optData;

    // 2. WebAuthn 認証
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentials: (options.allowCredentials || []).map((c) => ({
          id: base64UrlToBuffer(c.id),
          type: c.type,
          transports: c.transports,
        })),
      },
    });

    // 3. 検証 + 承認
    const assertionResponse = {
      id: assertion.id,
      rawId: bufferToBase64Url(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
        authenticatorData: bufferToBase64Url(
          assertion.response.authenticatorData,
        ),
        signature: bufferToBase64Url(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? bufferToBase64Url(assertion.response.userHandle)
          : null,
      },
      clientExtensionResults: assertion.getClientExtensionResults(),
      authenticatorAttachment: assertion.authenticatorAttachment,
    };

    const verifyRes = await fetch("/ciba/approve/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, assertionResponse }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || "承認に失敗");

    showResult(card, "承認しました（FIDO2 認証済み）", true);
  } catch (err) {
    if (err.name === "NotAllowedError") {
      alert("認証がキャンセルされました");
    } else {
      alert("エラー: " + (err.message || String(err)));
    }
    buttons.forEach((b) => (b.disabled = false));
  }
}

// --- 拒否 ---

async function handleDeny(authReqId) {
  const card = document.getElementById("req-" + authReqId);
  if (!card) return;
  if (!confirm("このリクエストを拒否しますか？")) return;

  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));

  try {
    const res = await fetch("/ciba/deny", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_req_id: authReqId }),
    });
    if (res.ok) {
      showResult(card, "拒否しました", false);
    } else {
      const data = await res.json();
      alert("エラー: " + (data.error || "unknown"));
      buttons.forEach((b) => (b.disabled = false));
    }
  } catch (err) {
    alert("通信エラー: " + err.message);
    buttons.forEach((b) => (b.disabled = false));
  }
}

// --- UI ヘルパー ---

function showResult(card, message, isSuccess) {
  card.innerHTML =
    '<div class="result-msg ' +
    (isSuccess ? "result-ok" : "result-err") +
    '">' +
    message +
    "</div>";
  setTimeout(() => {
    card.remove();
    checkEmpty();
  }, 2000);
}

function checkEmpty() {
  const container = document.getElementById("requests-container");
  if (!container.querySelector(".request-card")) {
    container.innerHTML =
      '<div class="no-requests">保留中の認証リクエストはありません</div>';
  }
}

function buildRequestCard(req) {
  const card = document.createElement("div");
  card.className = "request-card";
  card.id = "req-" + req.authReqId;

  let info =
    '<div class="request-info">' +
    "<strong>クライアント:</strong> " +
    escapeHtml(req.clientId) +
    "<br>" +
    "<strong>スコープ:</strong> " +
    escapeHtml(req.scope) +
    "<br>";
  if (req.bindingMessage) {
    info +=
      "<strong>確認メッセージ:</strong> <code>" +
      escapeHtml(req.bindingMessage) +
      "</code><br>";
  }
  info +=
    "<strong>リクエスト時刻:</strong> " +
    new Date(req.createdAt).toLocaleString("ja-JP") +
    "</div>";

  const actions =
    '<div class="request-actions">' +
    `<button class="btn btn-approve" onclick="handleApprove('${req.authReqId}')">FIDO2 で承認</button>` +
    `<button class="btn btn-deny" onclick="handleDeny('${req.authReqId}')">拒否</button>` +
    "</div>";

  card.innerHTML = info + actions;
  return card;
}

// --- ポーリング ---

async function pollPendingRequests() {
  try {
    const res = await fetch("/ciba/pending");
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById("requests-container");
    const existingIds = new Set(
      Array.from(container.querySelectorAll(".request-card")).map((el) =>
        el.id.replace("req-", ""),
      ),
    );
    for (const req of data.requests) {
      if (existingIds.has(req.authReqId)) continue;
      container.prepend(buildRequestCard(req));
      const noReq = container.querySelector(".no-requests");
      if (noReq) noReq.remove();
    }
  } catch (_) {
    /* ignore */
  }
}

setInterval(pollPendingRequests, 5000);

// --- Web Push 購読 ---

async function setupPush() {
  const statusEl = document.getElementById("push-status");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    statusEl.textContent = "Push通知: 非対応ブラウザ";
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("/ciba/sw.js", {
      scope: "/ciba/",
    });
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      statusEl.textContent = "Push通知: 有効";
      statusEl.style.color = "#2e7d32";
      return;
    }

    if (Notification.permission === "denied") {
      statusEl.textContent =
        "Push通知: ブロック済み（ブラウザ設定で許可してください）";
      statusEl.style.color = "#f44336";
      return;
    }

    // VAPID 公開鍵を取得
    const keyRes = await fetch("/ciba/push/vapid-key");
    const keyData = await keyRes.json();
    const vapidKey = base64UrlToBuffer(keyData.publicKey);

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    // サーバーに購読情報を送信
    await fetch("/ciba/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });

    statusEl.textContent = "Push通知: 有効";
    statusEl.style.color = "#2e7d32";
  } catch (err) {
    console.warn("Push setup failed:", err);
    statusEl.textContent = "Push通知: 設定失敗（ポーリングで代替）";
    statusEl.style.color = "#ff9800";
  }
}

setupPush();
