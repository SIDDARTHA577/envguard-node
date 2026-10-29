import { describe, it, expect } from 'vitest';
import { guard } from '../src/guard.js';
import { s } from '../src/schema.js';
import { formatTerminalReport, formatJsonReport } from '../src/cli/reporter.js';
import { EnvGuardValidationError } from '../src/errors.js';

describe('Security and Secret Redaction Guarantees', () => {
  const SENSITIVE_TOKEN = 'sk_live_998877665544332211_SUPER_SECRET';
  const SENSITIVE_PASSWORD = 'super_secret_password_p@ssw0rd!#';
  const SENSITIVE_CONNECTION_STRING =
    'postgres://secret_admin:my_secret_db_pass_123@internal.db:5432/prod_db';

  it('never leaks invalid secret string values in validation errors or reports', () => {
    const schema = {
      API_KEY: s.string({ min: 100 }).sensitive(), // Fails min length (token is shorter than 100)
      DB_PASSWORD: s.port().sensitive(), // Fails: password is not a port number
      SERVICE_URL: s.url({ protocols: ['https:'] }).sensitive(), // Fails: postgres is not https
      ENVIRONMENT: s.enum(['prod', 'stage'] as const),
    };

    const env = {
      API_KEY: SENSITIVE_TOKEN,
      DB_PASSWORD: SENSITIVE_PASSWORD,
      SERVICE_URL: SENSITIVE_CONNECTION_STRING,
      ENVIRONMENT: 'invalid_env_mode_secret_xyz',
    };

    const result = guard(schema, env);
    expect(result.success).toBe(false);

    // 1. Check raw errors array
    const serializedErrors = JSON.stringify(result.errors);
    expect(serializedErrors).not.toContain(SENSITIVE_TOKEN);
    expect(serializedErrors).not.toContain(SENSITIVE_PASSWORD);
    expect(serializedErrors).not.toContain(SENSITIVE_CONNECTION_STRING);
    expect(serializedErrors).not.toContain('invalid_env_mode_secret_xyz');

    // 2. Check terminal report output
    const terminalReport = formatTerminalReport(result);
    expect(terminalReport).not.toContain(SENSITIVE_TOKEN);
    expect(terminalReport).not.toContain(SENSITIVE_PASSWORD);
    expect(terminalReport).not.toContain(SENSITIVE_CONNECTION_STRING);
    expect(terminalReport).not.toContain('invalid_env_mode_secret_xyz');

    // 3. Check JSON report output
    const jsonReport = formatJsonReport(result);
    expect(jsonReport).not.toContain(SENSITIVE_TOKEN);
    expect(jsonReport).not.toContain(SENSITIVE_PASSWORD);
    expect(jsonReport).not.toContain(SENSITIVE_CONNECTION_STRING);
    expect(jsonReport).not.toContain('invalid_env_mode_secret_xyz');

    // 4. Check thrown exception message
    let caughtError: EnvGuardValidationError | null = null;
    try {
      guard(schema, env, { throwOnError: true });
    } catch (err) {
      if (err instanceof EnvGuardValidationError) {
        caughtError = err;
      }
    }

    expect(caughtError).not.toBeNull();
    const exceptionString = String(caughtError?.message);
    expect(exceptionString).not.toContain(SENSITIVE_TOKEN);
    expect(exceptionString).not.toContain(SENSITIVE_PASSWORD);
    expect(exceptionString).not.toContain(SENSITIVE_CONNECTION_STRING);
    expect(exceptionString).not.toContain('invalid_env_mode_secret_xyz');
  });

  it('does not leak secrets when custom validator throws or returns false', () => {
    const schema = {
      TOKEN: s.string().custom((val) => {
        if (val.includes('SECRET')) {
          // Intentional failure
          return false;
        }
        return true;
      }),
      ANOTHER_SECRET: s.string().custom((val) => {
        throw new Error(`Crash with internal sensitive text: ${val}`);
      }),
    };

    const env = {
      TOKEN: SENSITIVE_TOKEN,
      ANOTHER_SECRET: SENSITIVE_PASSWORD,
    };

    const result = guard(schema, env);
    expect(result.success).toBe(false);

    const fullReport = formatTerminalReport(result) + formatJsonReport(result);
    expect(fullReport).not.toContain(SENSITIVE_TOKEN);
    expect(fullReport).not.toContain(SENSITIVE_PASSWORD);
  });
});
