import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import payment, { handleOidcCallback } from './routes/payment';
import { renderPaymentPage } from './views/payment';

const app = new Hono<{ Bindings: Bindings }>();

// CORS設定
app.use('/*', cors());

// ヘルスチェック
app.get('/health', (c) => c.json({ status: 'ok' }));

// 支払いUI
app.get('/', (c) => {
  return c.html(renderPaymentPage());
});

// 支払いAPI
app.route('/api/payment', payment);

// OAuth callback
app.get('/callback', handleOidcCallback);

// 404
app.notFound((c) => {
  return c.json({ error: 'not_found', error_description: 'Not found' }, 404);
});

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: 'server_error',
      error_description: err.message,
    },
    500
  );
});

export default app;
