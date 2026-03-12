// CIBA ポーリングページ — トークンエンドポイントへの自動ポーリング
// data-auth-req-id, data-interval 属性から設定値を取得

(function () {
  const container = document.getElementById("ciba-polling-config");
  if (!container) return;

  const authReqId = container.dataset.authReqId;
  let interval = (Number(container.dataset.interval) || 5) * 1000;
  let pollCount = 0;

  function poll() {
    pollCount++;
    document.getElementById("poll-count").textContent =
      "ポーリング回数: " + pollCount;

    fetch("/ciba/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_req_id: authReqId }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.status === "pending") {
          if (data.slow_down) {
            interval = Math.min(interval + 5000, 30000);
          }
          setTimeout(poll, interval);
        } else if (data.status === "completed") {
          document.getElementById("status").style.display = "none";
          document.getElementById("result").style.display = "block";
          document.getElementById("token-data").textContent = JSON.stringify(
            data.tokenData,
            null,
            2,
          );
          document.getElementById("id-token-claims").textContent =
            data.idTokenClaims
              ? JSON.stringify(data.idTokenClaims, null, 2)
              : "N/A";
          document.getElementById("user-info").textContent = data.userInfo
            ? JSON.stringify(data.userInfo, null, 2)
            : "N/A";
        } else {
          document.getElementById("status").style.display = "none";
          document.getElementById("error-result").style.display = "block";
          document.getElementById("error-data").textContent = JSON.stringify(
            data,
            null,
            2,
          );
        }
      })
      .catch(function (err) {
        document.getElementById("status-message").textContent =
          "通信エラー: " + err.message + " (リトライ中...)";
        setTimeout(poll, interval);
      });
  }

  setTimeout(poll, interval);
})();
