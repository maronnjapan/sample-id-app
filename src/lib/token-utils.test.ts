import { describe, it, expect } from 'vitest';
import { decodeJWTPayload, buildTokenExchangeBody } from './token-utils';

/**
 * テスト用のJWTを生成するヘルパー
 * 署名部分はダミー
 */
function createTestJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'dummy-signature';
  return `${header}.${body}.${signature}`;
}

describe('decodeJWTPayload', () => {
  it('有効なJWTからペイロードをデコードできる', () => {
    const payload = {
      iss: 'https://example.okta.com',
      sub: 'user123',
      aud: 'client-id',
      exp: 1700000000,
      iat: 1699999000,
    };
    const token = createTestJWT(payload);
    const result = decodeJWTPayload(token);

    expect(result).toEqual(payload);
  });

  it('scopeクレームを含むJWTをデコードできる', () => {
    const payload = {
      iss: 'https://example.okta.com',
      scope: 'openid profile email',
    };
    const token = createTestJWT(payload);
    const result = decodeJWTPayload(token);

    expect(result?.scope).toBe('openid profile email');
  });

  it('audが配列のJWTをデコードできる', () => {
    const payload = {
      aud: ['client1', 'client2'],
    };
    const token = createTestJWT(payload);
    const result = decodeJWTPayload(token);

    expect(result?.aud).toEqual(['client1', 'client2']);
  });

  it('不正な形式のトークンでnullを返す', () => {
    expect(decodeJWTPayload('invalid-token')).toBeNull();
    expect(decodeJWTPayload('')).toBeNull();
    expect(decodeJWTPayload('a.b')).toBeNull();
  });

  it('Base64デコード不可能なペイロードでnullを返す', () => {
    expect(decodeJWTPayload('header.!!!invalid!!!.signature')).toBeNull();
  });
});

describe('buildTokenExchangeBody', () => {
  it('必須パラメータのみでリクエストボディを構築する', () => {
    const body = buildTokenExchangeBody({ idToken: 'test-id-token' });

    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(body.get('subject_token')).toBe('test-id-token');
    expect(body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:id_token');
    expect(body.get('requested_token_type')).toBe('urn:ietf:params:oauth:token-type:id-jag');
    expect(body.get('audience')).toBeNull();
    expect(body.get('scope')).toBeNull();
  });

  it('audienceを含むリクエストボディを構築する', () => {
    const body = buildTokenExchangeBody({
      idToken: 'test-id-token',
      audience: 'https://example.okta.com/oauth2/default',
    });

    expect(body.get('audience')).toBe('https://example.okta.com/oauth2/default');
  });

  it('scopeを含むリクエストボディを構築する', () => {
    const body = buildTokenExchangeBody({
      idToken: 'test-id-token',
      scope: 'chat.read chat.history',
    });

    expect(body.get('scope')).toBe('chat.read chat.history');
  });

  it('全パラメータを含むリクエストボディを構築する', () => {
    const body = buildTokenExchangeBody({
      idToken: 'test-id-token',
      audience: 'https://resource.okta.com/oauth2/default',
      scope: 'todos.read todos.write',
    });

    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(body.get('subject_token')).toBe('test-id-token');
    expect(body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:id_token');
    expect(body.get('requested_token_type')).toBe('urn:ietf:params:oauth:token-type:id-jag');
    expect(body.get('audience')).toBe('https://resource.okta.com/oauth2/default');
    expect(body.get('scope')).toBe('todos.read todos.write');
  });
});

