import { describe, it, expect } from 'vitest';
import { parseDotenv } from '../src/parser/dotenv.js';

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

  it('handles multi-line values enclosed in double quotes', () => {
    const raw = `
CERTIFICATE="-----BEGIN CERT-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
-----END CERT-----"
OTHER=123
`;
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
    // Values are treated strictly as literal strings
    expect(parsed.COMMAND).toBe('$(echo hacked)');
    expect(parsed.EXPANSION).toBe('`rm -rf /`');
    expect(parsed.VAR).toBe('${USER}');
  });
});
