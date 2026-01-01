/**
 * トークンエンドポイントのロジック
 *
 * RFC 6749に準拠したCache-Controlヘッダの有無による
 * 2つのトークンエンドポイントを提供する。
 */

import { generateJWT } from './jwt';

/**
 * トークンリクエストの型定義
 */
export interface TokenRequest {
  scope: string;
  expires_in: number;
}

/**
 * トークンレスポンスの型定義
 */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

/**
 * リクエストボディまたはクエリパラメータをパースしてバリデーション
 * GETリクエストの場合はクエリパラメータから、POSTの場合はボディから取得
 */
async function parseTokenRequest(request: Request): Promise<TokenRequest> {
  let scope: string;
  let expires_in: number;

  if (request.method === 'GET') {
    // GETリクエスト: クエリパラメータから取得
    const url = new URL(request.url);
    scope = url.searchParams.get('scope') || 'read';
    expires_in = parseInt(url.searchParams.get('expires_in') || '60', 10);
  } else {
    // POSTリクエスト: ボディから取得
    const body = await request.json() as Partial<TokenRequest>;
    scope = body.scope || 'read';
    expires_in = body.expires_in || 60;
  }

  if (typeof scope !== 'string') {
    throw new Error('scope must be a string');
  }

  if (typeof expires_in !== 'number' || isNaN(expires_in) || expires_in <= 0) {
    throw new Error('expires_in must be a positive number');
  }

  return { scope, expires_in };
}

/**
 * Cache-Control: no-store ありのトークンエンドポイント
 *
 * RFC 6749 Section 5.1に準拠した実装。
 * トークンを含むレスポンスには必ずCache-Control: no-storeを付与すべきである。
 *
 * > The authorization server MUST include the HTTP "Cache-Control" response
 * > header field with a value of "no-store" in any response containing tokens,
 * > credentials, or other sensitive information.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-5.1
 */
export async function handleTokenWithCacheControl(
  request: Request
): Promise<Response> {
  try {
    const { scope, expires_in } = await parseTokenRequest(request);
    const accessToken = await generateJWT(scope, expires_in);

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expires_in,
      scope: scope,
    };

    // RFC 6749準拠: トークンを含むレスポンスにはno-storeを付与
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // RFC 6749 Section 5.1: トークンレスポンスには必須
        'Cache-Control': 'no-store',
        // 古いHTTP/1.0プロキシ向けの互換性ヘッダ
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'invalid_request', error_description: String(error) }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}

/**
 * Cache-Control: no-store なしのトークンエンドポイント（問題を再現するための意図的な実装）
 *
 * ■ 重要な注意事項（ブログ執筆用メモ）
 *
 * このエンドポイントは、Cache-Control: no-storeが省略された場合の問題を
 * 検証するために意図的に実装されている。
 *
 * ■ なぜGETリクエストに対応しているのか
 *
 * POSTリクエストのレスポンスは、Cache-Control: public, max-age=60を設定しても
 * ブラウザのデフォルト動作ではキャッシュされない。
 * （HTTP仕様上、POSTは副作用を持つメソッドとして扱われるため）
 *
 * この検証アプリでは、キャッシュ問題を確実に再現するために
 * GETリクエストを使用している。GETリクエストはCache-Controlヘッダに従って
 * ブラウザキャッシュが有効になる。
 *
 * ■ なぜ明示的にmax-age=60を付けているのか
 *
 * GETリクエストでも、明示的なCache-Controlヘッダがない場合は
 * ブラウザによってキャッシュ動作が異なる。
 * 問題を確実に再現するために`Cache-Control: public, max-age=60`を付与している。
 *
 * ■ 現実世界でno-storeが必要な理由
 *
 * 「POSTはキャッシュされないから大丈夫」という考えは危険である。
 *
 * 1. ブラウザ依存: キャッシュ動作はブラウザの実装に依存しており、
 *    将来的に変わる可能性がある
 *
 * 2. 中間プロキシ/CDN: 企業のプロキシサーバーやCDNが独自の
 *    キャッシュポリシーを適用する可能性がある
 *
 * 3. 設定ミス: リバースプロキシやロードバランサーの設定で
 *    誤ってキャッシュが有効になるケースがある
 *
 * 4. 仕様の明確性: RFC 6749で明示的に要求されている
 *
 * ■ 結論
 *
 * 「たまたま動いている」状態に依存せず、明示的にno-storeを付けることで
 * 環境に依存しない安全なトークンエンドポイントを実装すべきである。
 */
export async function handleTokenWithoutCacheControl(
  request: Request
): Promise<Response> {
  try {
    const { scope, expires_in } = await parseTokenRequest(request);
    const accessToken = await generateJWT(scope, expires_in);

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expires_in,
      scope: scope,
    };

    // ⚠️ 意図的にno-storeを省略し、代わりにキャッシュを許可するヘッダを設定
    // これはRFC 6749違反であり、問題を再現するためのデモ用コード
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // 問題再現用: POSTレスポンスをキャッシュ可能にする
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'invalid_request', error_description: String(error) }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * Cache-Control ヘッダなしのトークンエンドポイント（ブラウザのデフォルト動作を検証）
 *
 * ■ このエンドポイントの目的
 *
 * Cache-Controlヘッダを一切設定しない場合のブラウザの挙動を検証する。
 *
 * ■ 期待される動作
 *
 * - GETリクエスト: ブラウザによって動作が異なる可能性がある
 *   - 一部のブラウザはヒューリスティックキャッシュを適用する場合がある
 *   - Last-ModifiedやETagがなければキャッシュされないことが多い
 *
 * - POSTリクエスト: HTTP仕様上、デフォルトではキャッシュされない
 *
 * ■ 検証のポイント
 *
 * 「Cache-Controlを省略しても問題ない」という誤解を検証するためのエンドポイント。
 * 明示的にno-storeを設定することの重要性を理解するための比較用。
 */
export async function handleTokenNoCacheHeader(
  request: Request
): Promise<Response> {
  try {
    const { scope, expires_in } = await parseTokenRequest(request);
    const accessToken = await generateJWT(scope, expires_in);

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expires_in,
      scope: scope,
    };

    // Cache-Controlヘッダを一切設定しない
    // ブラウザのデフォルト動作に依存する
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'invalid_request', error_description: String(error) }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
