import { auth } from "@/auth";
import { buildTokenExchangeBody } from "@/lib/token-utils";
import { NextRequest, NextResponse } from "next/server";

/**
 * Token Exchange API エンドポイント
 *
 * Okta Org認可サーバーに対してToken Exchange (RFC 8693) を実行し、
 * ID-JAG (Identity Assertion JWT) を取得する。
 *
 * フロー:
 * 1. セッションからID Tokenを取得（Login Appで取得したもの）
 * 2. Org認可サーバーの /oauth2/v1/token にToken Exchangeリクエスト
 *    - クライアント認証は client_secret_basic（RFC 6749 Section 2.3.1）
 * 3. ID-JAGを含むレスポンスを返却
 *
 * RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693
 *
 * Okta固有の仕様:
 * - Org認可サーバー（/oauth2/v1/token）を使用する必要がある（Custom認可サーバーではない）
 * - requested_token_type に urn:ietf:params:oauth:token-type:id-jag を指定（Okta独自拡張）
 * - subject_token には ID Token を使用
 * - audience には ID-JAG の送り先を指定（Client ID または Issuer URL）
 *   サードパーティアプリに渡す場合はリクエスト時に audience を指定する
 *   省略時は OKTA_RESOURCE_AUDIENCE 環境変数にフォールバック
 * - Cross App Access (XAA) / Managed Connections の設定が管理画面で必要
 */
export async function POST(request: NextRequest) {
  const oktaDomain = process.env.OKTA_DOMAIN;
  const agentClientId = process.env.OKTA_CLIENT_ID;
  const agentClientSecret = process.env.OKTA_CLIENT_SECRET;

  if (!oktaDomain || !agentClientId || !agentClientSecret) {
    return NextResponse.json(
      {
        error: 'Server configuration error',
        hint: 'OKTA_DOMAIN, OKTA_CLIENT_ID, OKTA_CLIENT_SECRET が設定されているか確認してください。',
      },
      { status: 500 }
    );
  }

  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated', hint: 'ログインしてください。' },
        { status: 401 }
      );
    }

    // ID TokenはNextAuthのJWTから取得（Login Appで取得したもの）
    const { getToken } = await import("next-auth/jwt");
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

    if (!token?.idToken) {
      return NextResponse.json(
        { error: 'No ID token found', hint: 'セッションにID Tokenがありません。再ログインしてください。' },
        { status: 401 }
      );
    }

    // リクエストボディの解析
    let scope: string | undefined;
    let audience: string | undefined;
    try {
      const body = await request.json();
      if (body.scope && typeof body.scope === 'string') {
        scope = body.scope;
      }
      if (body.audience && typeof body.audience === 'string') {
        audience = body.audience;
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', hint: 'リクエストボディのJSON形式が不正です。' },
        { status: 400 }
      );
    }

    const resolvedAudience = audience || process.env.OKTA_RESOURCE_AUDIENCE;
    if (!resolvedAudience) {
      return NextResponse.json(
        {
          error: 'audience is required',
          hint: 'audience を指定してください。現在 Okta 側の制約により http://localhost:5001 のみ受け付けられます。',
        },
        { status: 400 }
      );
    }

    const tokenEndpoint = `${oktaDomain}/oauth2/v1/token`;

    // Token Exchangeリクエストボディ（subject_token等）
    const exchangeBody = buildTokenExchangeBody({
      idToken: token.idToken as string,
      audience: resolvedAudience,
      scope,
    });

    console.log('Token Exchange request body:', exchangeBody.toString());

    // client_secret_basic: RFC 6749 Section 2.3.1 に準拠した標準的なクライアント認証
    const credentials = Buffer.from(`${agentClientId}:${agentClientSecret}`).toString('base64');

    const tokenExchange = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: exchangeBody.toString(),
    });

    if (tokenExchange.ok) {
      const result = await tokenExchange.json();
      return NextResponse.json(result);
    } else {
      const errorText = await tokenExchange.text();
      console.error('Token exchange failed:', {
        status: tokenExchange.status,
        statusText: tokenExchange.statusText,
        details: errorText,
      });
      return NextResponse.json(
        {
          error: `Token Exchange failed (HTTP ${tokenExchange.status})`,
          hint: getErrorHint(tokenExchange.status, errorText),
        },
        { status: tokenExchange.status }
      );
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error', hint: 'サーバーでエラーが発生しました。ログを確認してください。' },
      { status: 500 }
    );
  }
}

/**
 * エラーコードに応じたヒントメッセージを返す
 */
function getErrorHint(status: number, errorText: string): string {
  if (status === 400 && errorText.includes('unsupported_grant_type')) {
    return 'Token Exchange grant typeがサポートされていません。Okta管理画面でCross App Access (XAA)が有効化されているか確認してください。';
  }
  if (status === 400 && errorText.includes('invalid_grant')) {
    return 'ID Tokenが無効です。セッションの有効期限が切れている可能性があります。再ログインしてください。またはManaged Connectionsの設定を確認してください。';
  }
  if (status === 400 && errorText.includes('invalid_target')) {
    return 'audienceが無効です。ID-JAG の送り先アプリの Client ID または Issuer URL（例: https://your-org.okta.com/oauth2/default）を指定してください。';
  }
  if (status === 400 && errorText.includes('invalid_scope')) {
    return 'scopeが無効です。リソースアプリ側で許可されたスコープを確認してください。';
  }
  if (status === 401) {
    return 'クライアント認証に失敗しました。OKTA_CLIENT_IDとOKTA_CLIENT_SECRETが正しいか確認してください。';
  }
  if (status === 403) {
    return 'Managed Connectionsの設定が必要です。Okta管理画面でLogin Appの Managed Connections（App granted consent）を設定してください。';
  }
  return 'Token Exchangeが失敗しました。Okta管理画面の設定（XAA有効化・Managed Connections）を確認してください。';
}
