import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, PaymentRecord } from '../types';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  verifyIdToken,
  validateApproval,
  getAppBaseUrl,
} from '../services/auth';
import {
  getPaymentRecord,
  savePaymentRecord,
  processPayment,
} from '../services/payment';
import { generatePaymentId } from '../utils/id';

const payment = new Hono<{ Bindings: Bindings }>();

payment.post('/initiate', async (c) => {
  const body = await c.req.json<{
    user_email: string;
    amount: number;
    description: string;
  }>();
  const { user_email, amount, description } = body;

  if (!user_email || !amount) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const paymentId = generatePaymentId();
  const nonce = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  const record: PaymentRecord = {
    payment_id: paymentId,
    user_email,
    amount,
    description,
    status: 'pending_approval',
    nonce,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await savePaymentRecord(c.env, record, 600);

  return c.json(
    {
      payment_id: paymentId,
      status: 'pending_approval',
      authorize_url: buildAuthorizeUrl(c.env, paymentId, nonce),
    },
    202
  );
});

payment.get('/callback', (c) => handleOidcCallback(c));

payment.get('/:paymentId/status', async (c) => {
  const paymentId = c.req.param('paymentId');
  const record = await getPaymentRecord(c.env, paymentId);

  if (!record) {
    return c.json({ error: 'not_found' }, 404);
  }

  const response: Record<string, unknown> = {
    payment_id: record.payment_id,
    status: record.status,
    amount: record.amount,
    description: record.description,
  };

  if (record.status === 'completed') {
    response.completed_at = record.completed_at;
    response.auth_time = record.auth_time;
    response.acr = record.acr;
    response.amr = record.amr;
  }

  if (record.status === 'pending_approval') {
    response.expires_at = record.expires_at;
  }

  if (record.failure_reason) {
    response.reason = record.failure_reason;
  }

  return c.json(response);
});

export async function handleOidcCallback(
  c: Context<{ Bindings: Bindings }>
): Promise<Response> {
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!state) {
    return c.html('<h1>Invalid callback: missing state</h1>', 400);
  }

  const paymentId = state;
  if (!paymentId) {
    return c.html('<h1>Invalid state parameter</h1>', 400);
  }

  const record = await getPaymentRecord(c.env, paymentId);
  if (!record) {
    return c.redirect(buildResultUrl(c.env, 'error', 'payment_not_found'));
  }

  if (new Date() > new Date(record.expires_at)) {
    record.status = 'expired';
    record.failure_reason = 'payment_expired';
    await savePaymentRecord(c.env, record);
    return c.redirect(buildResultUrl(c.env, 'expired', undefined, paymentId));
  }

  if (error) {
    record.status = 'rejected';
    record.failure_reason = errorDescription || error;
    await savePaymentRecord(c.env, record);
    return c.redirect(
      buildResultUrl(c.env, 'rejected', errorDescription || error, paymentId)
    );
  }

  if (!code) {
    return c.html('<h1>Missing authorization code</h1>', 400);
  }

  try {
    const tokens = await exchangeCodeForTokens(c.env, code);
    const payload = await verifyIdToken(c.env, tokens.id_token);
    const validation = validateApproval(
      payload,
      new Date(record.created_at).getTime(),
      record.nonce
    );

    if (!validation.valid) {
      record.status = 'rejected';
      record.id_token = tokens.id_token;
      record.failure_reason = validation.reason || 'approval_validation_failed';
      await savePaymentRecord(c.env, record);
      return c.redirect(
        buildResultUrl(c.env, 'rejected', validation.reason, paymentId)
      );
    }

    record.status = 'completed';
    record.completed_at = new Date().toISOString();
    record.id_token = tokens.id_token;
    record.auth_time = payload.auth_time;
    record.acr = payload.acr;
    record.amr = payload.amr;
    record.failure_reason = undefined;
    processPayment(record);
    await savePaymentRecord(c.env, record);

    return c.redirect(buildResultUrl(c.env, 'completed', undefined, paymentId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token_exchange_failed';
    record.status = 'rejected';
    record.failure_reason = message;
    await savePaymentRecord(c.env, record);
    return c.redirect(buildResultUrl(c.env, 'rejected', message, paymentId));
  }
}

function buildResultUrl(
  env: Bindings,
  status: string,
  reason?: string,
  paymentId?: string
): string {
  const url = new URL(`${getAppBaseUrl(env)}/`);
  url.searchParams.set('status', status);
  if (paymentId) {
    url.searchParams.set('payment', paymentId);
  }
  if (reason) {
    url.searchParams.set('reason', reason);
  }
  return url.toString();
}

export default payment;
