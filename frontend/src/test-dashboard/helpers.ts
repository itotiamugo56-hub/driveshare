import { testRequest, RawResult } from '../api/client';
import { useTestRunStore, LogLevel } from '../store/testRunStore';

let currentDomain = 'general';

export function setDomain(domain: string) {
  currentDomain = domain;
}

function log(level: LogLevel, message: string, details?: string) {
  useTestRunStore.getState().addEntry({ level, domain: currentDomain, message, details });
}

export function skip(description: string, reason: string) {
  log('skip', description, reason);
}

export function info(message: string) {
  log('info', message);
}

/** Direct analogue of Assert in the PS script. */
export function assert(condition: boolean, description: string, details?: string) {
  log(condition ? 'pass' : 'fail', description, details);
  return condition;
}

/** Direct analogue of Assert-Status. */
export function assertStatus(res: RawResult, expected: number[], context: string) {
  const ok = expected.includes(res.status);
  assert(ok, context, `status=${res.status}; body=${safeJson(res.body)}`);
  return ok;
}

function getField(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function assertField(obj: any, fieldPath: string, expected: unknown, context: string) {
  const actual = getField(obj, fieldPath);
  // eslint-disable-next-line eqeqeq
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, context, `expected ${fieldPath}=${safeJson(expected)}, got ${safeJson(actual)}`);
  return ok;
}

export function assertFieldNotNull(obj: any, fieldPath: string, context: string) {
  const actual = getField(obj, fieldPath);
  const ok = actual !== null && actual !== undefined;
  assert(ok, context, `${fieldPath}=${safeJson(actual)}`);
  return ok;
}

export function assertFieldNull(obj: any, fieldPath: string, context: string) {
  const actual = getField(obj, fieldPath);
  const ok = actual === null || actual === undefined;
  assert(ok, context, `${fieldPath}=${safeJson(actual)}`);
  return ok;
}

export function assertIsArray(obj: unknown, context: string, minLength = 0) {
  const ok = Array.isArray(obj) && obj.length >= minLength;
  assert(ok, context, `isArray=${Array.isArray(obj)}, length=${Array.isArray(obj) ? obj.length : 'n/a'}`);
  return ok;
}

export function assertNumberGreaterThan(obj: any, fieldPath: string, threshold: number, context: string) {
  const actual = getField(obj, fieldPath);
  const ok = typeof actual === 'number' && actual > threshold;
  assert(ok, context, `${fieldPath}=${safeJson(actual)}`);
  return ok;
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Thin re-export so runners import everything from one place. */
export { testRequest };
export type { RawResult };

export function newTestEmail(prefix: string) {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 100000)}@driveshare.dev`;
}

export function toBase64(s: string) {
  return btoa(s);
}
