import type { Bindings, PaymentRecord } from '../types';

export async function getPaymentRecord(
  env: Bindings,
  paymentId: string
): Promise<PaymentRecord | null> {
  const recordStr = await env.PAYMENT_STORE.get(`payment:${paymentId}`);
  if (!recordStr) {
    return null;
  }
  return JSON.parse(recordStr) as PaymentRecord;
}

export async function savePaymentRecord(
  env: Bindings,
  record: PaymentRecord,
  ttl: number = 600
): Promise<void> {
  await env.PAYMENT_STORE.put(
    `payment:${record.payment_id}`,
    JSON.stringify(record),
    { expirationTtl: ttl }
  );
}

export function processPayment(record: PaymentRecord): void {
  // TODO: 実際の支払い処理をここで実行
  // 例: 外部決済APIの呼び出し、データベースへの記録など
  console.log(`Processing payment: ${record.payment_id}`);
  console.log(`Amount: ${record.amount}`);
  console.log(`Description: ${record.description}`);
  console.log(`User: ${record.user_email}`);
}
