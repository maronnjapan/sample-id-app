// CIBA デバイス登録ページ — FIDO2/WebAuthn 登録フロー
// lib.js の base64UrlToBuffer / bufferToBase64Url に依存

async function startRegistration() {
  const accountId = document.getElementById("account_id").value.trim();
  if (!accountId) {
    alert("ユーザー識別子を入力してください");
    return;
  }

  const btn = document.getElementById("register-btn");
  btn.disabled = true;
  btn.textContent = "登録中...";
  hideMessages();

  try {
    // 1. 登録オプションを取得
    const optRes = await fetch("/ciba/device/register/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    const optData = await optRes.json();
    if (!optRes.ok) throw new Error(optData.error || "オプション取得に失敗");

    const { options, challengeId } = optData;

    // 2. WebAuthn API でクレデンシャル作成
    const credential = await navigator.credentials.create({
      publicKey: {
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
        excludeCredentials: (options.excludeCredentials || []).map((c) => ({
          id: base64UrlToBuffer(c.id),
          type: c.type,
          transports: c.transports,
        })),
      },
    });

    // 3. レスポンスをサーバーに送信
    const attestationResponse = {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
        attestationObject: bufferToBase64Url(
          credential.response.attestationObject,
        ),
        transports: credential.response.getTransports
          ? credential.response.getTransports()
          : [],
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment,
    };

    const verifyRes = await fetch("/ciba/device/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, attestationResponse }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || "登録検証に失敗");

    showSuccess(
      "デバイス登録が完了しました (type: " +
        verifyData.credentialDeviceType +
        ")",
    );
    setTimeout(() => (window.location.href = "/ciba/consent"), 1500);
  } catch (err) {
    if (err.name === "NotAllowedError") {
      showError("認証がキャンセルされました。もう一度お試しください。");
    } else if (err.name === "NotSupportedError") {
      showError(
        "このデバイス/ブラウザはPlatform Authenticatorに対応していません。",
      );
    } else {
      showError(err.message || String(err));
    }
    btn.disabled = false;
    btn.textContent = "FIDO2 でデバイスを登録";
  }
}

function hideMessages() {
  document.getElementById("error-msg").style.display = "none";
  document.getElementById("success-msg").style.display = "none";
}
function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.style.display = "block";
}
function showSuccess(msg) {
  const el = document.getElementById("success-msg");
  el.textContent = msg;
  el.style.display = "block";
}
