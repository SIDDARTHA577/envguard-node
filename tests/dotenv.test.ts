import { describe, it, expect } from 'vitest';
import { parseDotenv, parseDotenvWithMetadata } from '../src/parser/dotenv.js';
import { EnvGuardConfigError } from '../src/errors.js';

describe('parseDotenv safe parser', () => {
  it('parses basic key-value pairs and trims spaces', () => {
    const raw = `
      PORT=8080
      HOST=localhost
      # A comment line
      DEBUG=true
    `;
    const parsed = parseDotenv(raw);
    expect(parsed).toEqual({
      PORT: '8080',
      HOST: 'localhost',
      DEBUG: 'true',
    });
  });

  it('strips UTF-8 Byte Order Mark (BOM) from the beginning of input', () => {
    const withBom = '\uFEFFPORT=3000\nHOST=127.0.0.1';
    const parsed = parseDotenv(withBom);
    expect(parsed.PORT).toBe('3000');
    expect(parsed.HOST).toBe('127.0.0.1');
    expect(Object.keys(parsed)).not.toContain('\uFEFFPORT');
  });

  it('detects duplicate keys via parseDotenvWithMetadata', () => {
    const raw = `
      PORT=3000
      HOST=localhost
      PORT=8080
      PORT=9000
    `;
    const { env, duplicateKeys } = parseDotenvWithMetadata(raw);
    expect(env.PORT).toBe('9000'); // last value wins
    expect(duplicateKeys).toEqual(['PORT']);
  });

  it('rejects oversized inputs exceeding maxBytes limit to prevent DoS', () => {
    const hugeContent = 'A'.repeat(1024);
    expect(() => parseDotenv(hugeContent, { maxBytes: 500 })).toThrow(EnvGuardConfigError);
    expect(() => parseDotenv(hugeContent, { maxBytes: 500 })).toThrow(/exceeds maximum allowed size/);
  });

  it('ignores prototype-pollution keys (__proto__, constructor, prototype)', () => {
    const malicious = `
      __proto__=polluted
      constructor=polluted
      prototype=polluted
      SAFE_KEY=safe_value
    `;
    const parsed = parseDotenv(malicious);
    expect(parsed.SAFE_KEY).toBe('safe_value');
    expect(parsed.__proto__).not.toBe('polluted');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
  });

  it('handles "export" keyword prefix', () => {
    const raw = `
      export DATABASE_URL=postgres://localhost:5432/db
      export API_KEY=abc123xyz
    `;
    const parsed = parseDotenv(raw);
    expect(parsed).toEqual({
      DATABASE_URL: 'postgres://localhost:5432/db',
      API_KEY: 'abc123xyz',
    });
  });

  it('handles single-quoted and double-quoted strings with escapes', () => {
    const raw = `
      SINGLE_VAL='hello world'
      DOUBLE_VAL="line1\\nline2"
      QUOTED_SPECIAL="contains \\"quotes\\" and \\t tab"
    `;
    const parsed = parseDotenv(raw);
    expect(parsed.SINGLE_VAL).toBe('hello world');
    expect(parsed.DOUBLE_VAL).toBe('line1\nline2');
    expect(parsed.QUOTED_SPECIAL).toBe('contains "quotes" and \t tab');
  });

  it('handles multi-line values enclosed in double quotes and CRLF line endings', () => {
    const raw = "CERTIFICATE=\"-----BEGIN CERT-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\r\n-----END CERT-----\"\r\nOTHER=123\r\n";
    const parsed = parseDotenv(raw);
    expect(parsed.CERTIFICATE).toBe(
      '-----BEGIN CERT-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END CERT-----'
    );
    expect(parsed.OTHER).toBe('123');
  });

  it('ignores inline comments on unquoted values preceded by whitespace', () => {
    const raw = `
      SERVER_PORT=3000 # Primary port
      NAME=my_app
    `;
    const parsed = parseDotenv(raw);
    expect(parsed.SERVER_PORT).toBe('3000');
    expect(parsed.NAME).toBe('my_app');
  });

  it('does NOT evaluate bash/shell expansions or execute subcommands', () => {
    const raw = `
      COMMAND=$(echo hacked)
      EXPANSION=\`rm -rf /\`
      VAR=\${USER}
    `;
    const parsed = parseDotenv(raw);
    expect(parsed.COMMAND).toBe('$(echo hacked)');
    expect(parsed.EXPANSION).toBe('`rm -rf /`');
    expect(parsed.VAR).toBe('${USER}');
  });
});
