// CIBA 認証デバイス用 Service Worker — Web Push 受信

self.addEventListener("push", function (event) {
  let data = {
    title: "CIBA 認証リクエスト",
    body: "認証リクエストが届いています",
  };
  try {
    data = event.data.json();
  } catch (_) {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: "ciba-auth-" + (data.authReqId || "default"),
      requireInteraction: true,
      data: { url: "/ciba/consent", authReqId: data.authReqId },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/ciba/consent";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const c of clientList) {
          if (c.url.includes("/ciba/consent") && "focus" in c) {
            return c.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
