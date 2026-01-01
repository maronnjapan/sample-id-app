/**
 * Cloudflare Workers エントリポイント
 *
 * OAuth Token Endpoint Cache-Control検証アプリのルーティング。
 */

import { getFrontendHTML } from './frontend';
import {
  handleTokenWithCacheControl,
  handleTokenWithoutCacheControl,
  handleTokenNoCacheHeader,
} from './token';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS対応（必要に応じて）
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ルーティング
    switch (path) {
      // フロントエンドHTML
      case '/':
        if (method === 'GET') {
          return new Response(getFrontendHTML(), {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          });
        }
        break;

      // Cache-Control: no-store ありのトークンエンドポイント
      case '/token-with-cache-control':
        if (method === 'GET' || method === 'POST') {
          return handleTokenWithCacheControl(request);
        }
        break;

      // Cache-Control: no-store なしのトークンエンドポイント（max-age=60を設定）
      // GETリクエストに対応することでブラウザキャッシュを有効にする
      // （POSTレスポンスはCache-Controlヘッダに関わらずキャッシュされないため）
      case '/token-without-cache-control':
        if (method === 'GET' || method === 'POST') {
          return handleTokenWithoutCacheControl(request);
        }
        break;

      // Cache-Controlヘッダなしのトークンエンドポイント
      // ブラウザのデフォルト動作を検証する
      case '/token-no-cache-header':
        if (method === 'GET' || method === 'POST') {
          return handleTokenNoCacheHeader(request);
        }
        break;
    }

    // 404 Not Found
    return new Response(
      JSON.stringify({ error: 'not_found', error_description: 'Endpoint not found' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  },
};
