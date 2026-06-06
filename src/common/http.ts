// API Gateway HTTP API (payload v2) 向けのレスポンスヘルパ。
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

/** OAuth 形式のエラー（{ error, error_description }） */
export function oauthError(
  statusCode: number,
  error: string,
  description: string,
): APIGatewayProxyStructuredResultV2 {
  return json(statusCode, { error, error_description: description });
}

export function redirect(location: string): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 302, headers: { location } };
}

export function html(statusCode: number, body: string): APIGatewayProxyStructuredResultV2 {
  return { statusCode, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
}

/** JSON / x-www-form-urlencoded どちらのボディも受け付ける */
export function parseBody(event: APIGatewayProxyEventV2): Record<string, string> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const ct = (event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = Array.isArray(v) ? JSON.stringify(v) : String(v);
    }
    return out;
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

/** リクエストから API のベース URL を組み立てる（CDK 循環依存を避けるため event から導出） */
export function baseUrl(event: APIGatewayProxyEventV2): string {
  const rc = event.requestContext;
  const proto = (event.headers?.['x-forwarded-proto'] ?? 'https').split(',')[0];
  // HTTP API のデフォルトステージは $default なのでパスに含めない。
  return `${proto}://${rc.domainName}`;
}
