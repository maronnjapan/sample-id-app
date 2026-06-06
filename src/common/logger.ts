// 構造化 JSON ログ。token 値などの機微情報は決して出力しない。
import { createHash } from 'node:crypto';
import type { AuditFields } from '../types';

const SENSITIVE_KEYS = [
  'access_token',
  'refresh_token',
  'subject_token',
  'client_secret',
  'code',
  'connect_code',
  'authorization_code',
  'ticket',
  'auth_session',
  'password',
];

/** 機微な値を再帰的にマスクする（オブジェクトをログに渡してしまっても漏れない保険） */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.includes(k) ? '[REDACTED]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** ID 系はハッシュ化すれば相関調査に使える（仕様：ID のハッシュは可） */
export function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function emit(level: 'INFO' | 'WARN' | 'ERROR', message: string, fields: Record<string, unknown>): void {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(scrub(fields) as Record<string, unknown>),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const log = {
  info: (message: string, fields: Record<string, unknown> = {}) => emit('INFO', message, fields),
  warn: (message: string, fields: Record<string, unknown> = {}) => emit('WARN', message, fields),
  error: (message: string, fields: Record<string, unknown> = {}) => emit('ERROR', message, fields),
  /** 仕様で定めた監査ログフォーマットで1行出力する */
  audit: (fields: AuditFields & Record<string, unknown>) => emit('INFO', 'audit', fields),
};
