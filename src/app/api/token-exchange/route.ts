import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Token Exchange API エンドポイント
 * OAuth 2.0 Token Exchange (RFC 8693) を実装
 * 既存のアクセストークンを新しいスコープ・オーディエンスで交換する
 * 
 * RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693
 * 
 * Keycloak固有の制約:
 * - 交換可能なトークンはアクセストークンのみ（リフレッシュトークンは交換不可）
 * - https://www.keycloak.org/securing-apps/token-exchange#:~:text=This%20must%20be%20urn%3Aietf%3Aparams%3Aoauth%3Atoken%2Dtype%3Aaccess_token%20when%20the%20standard%20token%20exchange%20is%20being%20used%20because%20Keycloak%20does%20not%20support%20other%20types%20for%20the%20standard%20token%20exchange.
 * - act（actor）系パラメータは使用できない
 * - may_act（代理実行）機能は利用不可
 * - resource パラメータは未サポート
 * - audience 指定時は scope ダウングレードが制限される場合がある(audience先のクライアントのデフォルトスコープに依存する動きを見せた)
 * 
 * Keycloak Token Exchange: https://www.keycloak.org/docs/latest/securing_apps/#_token-exchange
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    const { scope, audience } = await request.json();

    /** 
     * Token Exchange用のリクエストパラメータを構築
     * RFC 8693 Section 2.1: https://datatracker.ietf.org/doc/html/rfc8693#section-2.1
     */
    const body = new URLSearchParams({
      /** RFC 8693で定義されたToken Exchangeのグラントタイプ */
      'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
      'subject_token': session.accessToken,
      /** 
       * 要求するトークンタイプ（アクセストークン）- Keycloakではアクセストークンのみ対応
       * RFC 8693 Section 3: https://datatracker.ietf.org/doc/html/rfc8693#section-3
       */
      'requested_token_type': 'urn:ietf:params:oauth:token-type:access_token',
      /** 
       * 交換元のトークンタイプ（アクセストークン）- Keycloakではアクセストークンのみ対応
       * RFC 8693 Section 3: https://datatracker.ietf.org/doc/html/rfc8693#section-3
       */
      'subject_token_type': 'urn:ietf:params:oauth:token-type:access_token',
    });

    if (scope) {
      body.append('scope', scope);
    }

    /** 
     * オーディエンスが指定されている場合はパラメータに追加
     * RFC 8693 Section 2.1: https://datatracker.ietf.org/doc/html/rfc8693#section-2.1
     * 注意: Keycloakではaudience指定時にscopeダウングレードが制限される場合がある
     */
    if (audience) {
      body.append('audience', audience);
    }

    /** 
     * KeycloakのToken Exchangeエンドポイントにリクエストを送信
     * 
     * Keycloak固有の仕様:
     * - /protocol/openid-connect/token エンドポイントを使用
     * - クライアント認証はBasic認証またはclient_assertion（JWT）で行う
     * - Keycloak管理画面でToken Exchange機能を有効にする必要がある
     * 
     * Keycloak Token Exchange: https://www.keycloak.org/docs/latest/securing_apps/#_token-exchange
     * Keycloak Admin Configuration: https://www.keycloak.org/docs/latest/server_admin/#_token-exchange
     * OAuth 2.0 Client Authentication (RFC 7523): https://datatracker.ietf.org/doc/html/rfc7523
     */
    const tokenExchange = await fetch(process.env.KEYCLOAK_URL + '/protocol/openid-connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.KEYCLOAK_CLIENT_ID}:${process.env.KEYCLOAK_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: body.toString()
    });

    if (tokenExchange.ok) {
      const result = await tokenExchange.json();
      return NextResponse.json(result);
    } else {
      const errorText = await tokenExchange.text();
      return NextResponse.json({
        error: `HTTP ${tokenExchange.status}: ${tokenExchange.statusText}`,
        details: errorText
      }, { status: tokenExchange.status });
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}