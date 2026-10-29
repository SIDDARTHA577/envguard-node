import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { guard, defineSchema } from '../src/guard.js';
import { s } from '../src/schema.js';
import { EnvGuardValidationError, EnvGuardSchemaError } from '../src/errors.js';

describe('guard() programmatic API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validates required and optional variables successfully', () => {
    const schema = {
      APP_NAME: s.string(),
      PORT: s.port(),
      DEBUG: s.boolean().optional(),
    };

    const env = {
      APP_NAME: 'MyApp',
      PORT: '8080',
    };

    const res = guard(schema, env);
    expect(res.success).toBe(true);
    expect(res.data.APP_NAME).toBe('MyApp');
    expect(res.data.PORT).toBe(8080);
    expect(res.data.DEBUG).toBeUndefined();
    expect(res.summary).toEqual({
      total: 3,
      valid: 3,
      invalid: 0,
      missing: 0,
    });
  });

  it('fails when a required variable is missing', () => {
    const schema = {
      REQUIRED_KEY: s.string(),
    };

    const res = guard(schema, {});
    expect(res.success).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].key).toBe('REQUIRED_KEY');
    expect(res.errors[0].issue).toBe('missing');
    expect(res.summary.missing).toBe(1);
  });

  it('respects default values when variable is missing or empty string', () => {
    const schema = {
      PORT: s.port().default(3000),
      TIMEOUT: s.number().default(5000),
    };

    const res = guard(schema, { PORT: '', TIMEOUT: undefined });
    expect(res.success).toBe(true);
    expect(res.data.PORT).toBe(3000);
    expect(res.data.TIMEOUT).toBe(5000);
  });

  it('prefers explicit env parameter over process.env', () => {
    process.env.APP_MODE = 'process_val';
    const schema = {
      APP_MODE: s.string(),
    };

    const res = guard(schema, { APP_MODE: 'explicit_val' });
    expect(res.success).toBe(true);
    expect(res.data.APP_MODE).toBe('explicit_val');
  });

  it('falls back to process.env only when env argument is omitted', () => {
    process.env.FALLBACK_VAR = 'from_process_env';
    const schema = {
      FALLBACK_VAR: s.string(),
    };

    const res = guard(schema);
    expect(res.success).toBe(true);
    expect(res.data.FALLBACK_VAR).toBe('from_process_env');
  });

  it('throws EnvGuardValidationError when throwOnError is true', () => {
    const schema = {
      MISSING_VAL: s.string(),
    };

    expect(() => guard(schema, {}, { throwOnError: true })).toThrow(EnvGuardValidationError);
  });

  it('detects unexpected variables in strict mode', () => {
    const schema = {
      ALLOWED: s.string(),
    };

    const env = {
      ALLOWED: 'ok',
      UNEXPECTED_ONE: 'surprise',
    };

    const res = guard(schema, env, { strict: true });
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.key === 'UNEXPECTED_ONE')).toBe(true);
  });

  it('rejects invalid schema structures via defineSchema', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => defineSchema(null as unknown as Record<string, any>)).toThrow(
      EnvGuardSchemaError
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => defineSchema({ INVALID_FIELD: 'not-a-validator' } as any)).toThrow(
      EnvGuardSchemaError
    );
  });
});
