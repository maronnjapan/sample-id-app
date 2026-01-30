import { Hono } from 'hono';
import type { Bindings, PaymentRecord } from '../types';
import { startCibaAuth, pollCibaToken } from '../services/ciba';
import {
  getPaymentRecord,
  savePaymentRecord,
  processPayment,
} from '../services/payment';
import { generatePaymentId } from '../utils/id';

const payment = new Hono<{ Bindings: Bindings }>();

// 支払い開始
payment.post('/initiate', async (c) => {
  const body = await c.req.json<{
    user_email: string;
    amount: number;
    description: string;
  }>();

  const { user_email, amount, description } = body;

  // バリデーション
  if (!user_email || !amount) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'user_email and amount are required',
      },
      400
    );
  }

  // binding_message を生成
  const bindingMessage = `¥${amount.toLocaleString()}の支払いを承認`;

  // CIBA認証開始
  const cibaResponse = await startCibaAuth(c.env, user_email, bindingMessage);

  // 支払いレコード作成
  const paymentId = generatePaymentId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + cibaResponse.expires_in * 1000);

  const record: PaymentRecord = {
    payment_id: paymentId,
    user_email,
    amount,
    description,
    status: 'pending_approval',
    auth_req_id: cibaResponse.auth_req_id,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // KVに保存 (TTL: 10分)
  await savePaymentRecord(c.env, record, 600);

  return c.json(
    {
      payment_id: paymentId,
      status: 'pending_approval',
      expires_in: cibaResponse.expires_in,
      message: 'スマートフォンのOkta Verifyで承認してください',
    },
    202
  );
});

// ステータス確認
payment.get('/:paymentId/status', async (c) => {
  const paymentId = c.req.param('paymentId');

  const record = await getPaymentRecord(c.env, paymentId);

  if (!record) {
    return c.json(
      {
        error: 'not_found',
        error_description: 'Payment not found',
      },
      404
    );
  }

  // 承認待ちの場合、Oktaにポーリング
  if (record.status === 'pending_approval') {
    // タイムアウトチェック
    if (new Date() > new Date(record.expires_at)) {
      record.status = 'expired';
      await savePaymentRecord(c.env, record);
    } else {
      const pollResult = await pollCibaToken(c.env, record.auth_req_id);

      switch (pollResult.status) {
        case 'approved':
          record.status = 'completed';
          record.access_token = pollResult.access_token;
          record.id_token = pollResult.id_token;
          record.completed_at = new Date().toISOString();

          // 支払い処理を実行
          processPayment(record);

          await savePaymentRecord(c.env, record);
          break;

        case 'rejected':
          record.status = 'rejected';
          await savePaymentRecord(c.env, record);
          break;

        case 'expired':
          record.status = 'expired';
          await savePaymentRecord(c.env, record);
          break;

        // 'pending' と 'slow_down' は何もしない
      }
    }
  }

  // レスポンス構築
  const response: Record<string, unknown> = {
    payment_id: record.payment_id,
    status: record.status,
  };

  if (record.status === 'pending_approval') {
    const expiresIn = Math.max(
      0,
      Math.floor((new Date(record.expires_at).getTime() - Date.now()) / 1000)
    );
    response.expires_in = expiresIn;
  }

  if (record.status === 'completed') {
    response.amount = record.amount;
    response.description = record.description;
    response.completed_at = record.completed_at;
  }

  if (record.status === 'rejected') {
    response.reason = 'User denied the request';
  }

  if (record.status === 'expired') {
    response.reason = 'Request timed out';
  }

  return c.json(response);
});

export default payment;
