import { Hono } from 'hono';
import type { Bindings, PaymentRecord } from '../types';
import {
  getUserId,
  getPushFactorId,
  sendPushVerification,
  pollTransaction,
  extractTransactionId,
} from '../services/factors';
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

  // Factors API を呼び出してプッシュ承認を開始
  let userId: string;
  let factorId: string;
  let verifyResponse: Awaited<ReturnType<typeof sendPushVerification>>;
  try {
    userId = await getUserId(c.env, user_email);
    factorId = await getPushFactorId(c.env, userId);
    verifyResponse = await sendPushVerification(c.env, userId, factorId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Factors API error:', message);
    return c.json(
      {
        error: 'factors_api_error',
        error_description: message,
      },
      502
    );
  }

  const paymentId = generatePaymentId();
  const expiresAt = new Date(verifyResponse.expiresAt);
  const record: PaymentRecord = {
    payment_id: paymentId,
    user_email,
    amount,
    description,
    status: 'pending_approval',
    user_id: userId,
    factor_id: factorId,
    transaction_id: extractTransactionId(verifyResponse._links.poll.href),
    poll_url: verifyResponse._links.poll.href,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // KVに保存 (TTL: 10分)
  await savePaymentRecord(c.env, record, 600);

  console.log("verifyResponse:", JSON.stringify(verifyResponse));
  const correctAnswer = verifyResponse._embedded?.challenge?.correctAnswer;
  console.log("correctAnswer:", correctAnswer);

  return c.json(
    {
      payment_id: paymentId,
      status: 'pending_approval',
      expires_at: record.expires_at,
      expires_in: Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      ),
      message: correctAnswer != null
        ? `スマートフォンのOkta Verifyで「${correctAnswer}」を選択してください`
        : 'スマートフォンのOkta Verifyで承認してください',
      ...(correctAnswer != null && { correct_answer: correctAnswer }),
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

  // 承認待ちの場合、Factors APIでトランザクションを確認
  if (record.status === 'pending_approval') {
    if (new Date() > new Date(record.expires_at)) {
      record.status = 'expired';
      record.approval_result = 'TIMEOUT';
      await savePaymentRecord(c.env, record);
    } else {
      const pollResult = await pollTransaction(c.env, record.poll_url);

      switch (pollResult.factorResult) {
        case 'SUCCESS':
          record.status = 'completed';
          record.completed_at = new Date().toISOString();
          record.approval_result = 'SUCCESS';
          processPayment(record);
          await savePaymentRecord(c.env, record);
          break;
        case 'REJECTED':
          record.status = 'rejected';
          record.approval_result = 'REJECTED';
          await savePaymentRecord(c.env, record);
          break;
        case 'TIMEOUT':
          record.status = 'expired';
          record.approval_result = 'TIMEOUT';
          await savePaymentRecord(c.env, record);
          break;
        case 'WAITING':
        default:
          // まだ保留中
          break;
      }
    }
  }

  // レスポンス構築
  const response: Record<string, unknown> = {
    payment_id: record.payment_id,
    status: record.status,
  };

  if (record.status === 'completed') {
    response.amount = record.amount;
    response.description = record.description;
    response.completed_at = record.completed_at;
  }

  if (record.status === 'pending_approval') {
    response.expires_at = record.expires_at;
    response.expires_in = Math.max(
      0,
      Math.floor((new Date(record.expires_at).getTime() - Date.now()) / 1000)
    );
  }

  if (record.status === 'rejected') {
    response.reason = 'User denied the request';
  }

  if (record.status === 'expired') {
    response.reason = 'Request timed out';
  }

  if (record.approval_result) {
    response.approval_result = record.approval_result;
  }

  return c.json(response);
});

export default payment;
