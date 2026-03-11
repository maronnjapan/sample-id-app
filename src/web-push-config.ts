/**
 * Web Push 通知の設定とヘルパー
 *
 * VAPID 鍵ペアはサンプル用にハードコード。
 * 本番では環境変数で管理すること。
 */
import webpush from "web-push";

// サンプル用 VAPID 鍵ペア（npx web-push generate-vapid-keys で生成）
export const VAPID_PUBLIC_KEY =
  "BEJolYBkAilna1qIxIqOtHjOAUtHMyRoYAyZTmvmgAFrJcT_XiRz2R_VKu7HRh00p_Sr4f1ogyxH4PNmfSHDuCw";
const VAPID_PRIVATE_KEY = "ovzIZnohISa_FkHRoo6Uc3ErnEYnwEJ83OgB_zKKo_g";
const VAPID_SUBJECT = "mailto:admin@example.com";

/**
 * Push 通知を送信する（Cloudflare Workers 対応: generateRequestDetails + fetch）
 */
export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const details = webpush.generateRequestDetails(
    subscription,
    payload,
    {
      vapidDetails: {
        subject: VAPID_SUBJECT,
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
      },
      TTL: 300,
      urgency: "high",
    },
  );

  const res = await fetch(details.endpoint, {
    method: details.method,
    headers: details.headers as unknown as HeadersInit,
    body: details.body,
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
