import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCli, parseArgs } from '../src/cli/index.js';
import { executeInit } from '../src/cli/init.js';

describe('CLI Commands and Arguments', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  });

  describe('parseArgs()', () => {
    it('parses commands and global flags', () => {
      expect(parseArgs(['check'])).toMatchObject({ command: 'check' });
      expect(parseArgs(['--help'])).toMatchObject({ help: true });
      expect(parseArgs(['-v'])).toMatchObject({ version: true });
    });

    it('parses check options', () => {
      const parsed = parseArgs([
        'check',
        '--schema',
        './custom.config.json',
        '--env-file',
        '.env.test',
        '--format',
        'json',
        '--strict',
      ]);

      expect(parsed).toEqual({
        command: 'check',
        schema: './custom.config.json',
        envFile: '.env.test',
        format: 'json',
        strict: true,
        force: false,
        help: false,
        version: false,
      });
    });

    it('throws configuration error on missing option value', () => {
      expect(() => parseArgs(['check', '--schema'])).toThrow('Missing argument value for --schema');
      expect(() => parseArgs(['check', '--format', 'xml'])).toThrow('Invalid value for --format');
      expect(() => parseArgs(['check', '--unknown-flag'])).toThrow('Unrecognized option');
    });
  });

  describe('executeInit()', () => {
    it('creates starter config and .env.example', () => {
      const { created, skipped } = executeInit({ cwd: tempDir, type: 'json' });
      expect(created).toContain('envguard.config.json');
      expect(created).toContain('.env.example');
      expect(skipped).toHaveLength(0);

      expect(fs.existsSync(path.join(tempDir, 'envguard.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, '.env.example'))).toBe(true);
    });

    it('does not silently overwrite existing files without --force', () => {
      executeInit({ cwd: tempDir, type: 'json' });

      // Second run without force
      const secondRun = executeInit({ cwd: tempDir, type: 'json', force: false });
      expect(secondRun.created).toHaveLength(0);
      expect(secondRun.skipped.length).toBeGreaterThan(0);

      // Third run with force
      const thirdRun = executeInit({ cwd: tempDir, type: 'json', force: true });
      expect(thirdRun.created).toContain('envguard.config.json');
    });
  });

  describe('runCli() execution and exit codes', () => {
    it('returns 0 for --help and --version', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const helpCode = await runCli(['--help']);
      expect(helpCode).toBe(0);

      const versionCode = await runCli(['-v']);
      expect(versionCode).toBe(0);
      logSpy.mockRestore();
    });

    it('returns 0 for check when all variables pass', async () => {
      const configPath = path.join(tempDir, 'envguard.config.json');
      const envPath = path.join(tempDir, '.env');

      fs.writeFileSync(
        configPath,
        JSON.stringify({
          PORT: 'port',
          APP_NAME: 'string',
        })
      );
      fs.writeFileSync(envPath, 'PORT=8080\nAPP_NAME=DemoApp');

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitCode = await runCli([
        'check',
        '--schema',
        configPath,
        '--env-file',
        envPath,
      ]);
      expect(exitCode).toBe(0);
      logSpy.mockRestore();
    });

    it('returns 1 for check when validation fails', async () => {
      const configPath = path.join(tempDir, 'envguard.config.json');
      const envPath = path.join(tempDir, '.env');

      fs.writeFileSync(
        configPath,
        JSON.stringify({
          PORT: 'port',
          REQUIRED_SECRET: { type: 'string', required: true },
        })
      );
      fs.writeFileSync(envPath, 'PORT=not_a_port\n'); // Invalid port and missing REQUIRED_SECRET

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitCode = await runCli([
        'check',
        '--schema',
        configPath,
        '--env-file',
        envPath,
      ]);
      expect(exitCode).toBe(1);
      logSpy.mockRestore();
    });

    it('returns 1 and valid machine-readable JSON when --format json is specified', async () => {
      const configPath = path.join(tempDir, 'envguard.config.json');
      const envPath = path.join(tempDir, '.env');

      fs.writeFileSync(
        configPath,
        JSON.stringify({
          MISSING_VAR: { type: 'string', required: true },
        })
      );
      fs.writeFileSync(envPath, '');

      let capturedOutput = '';
      const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        capturedOutput += msg;
      });

      const exitCode = await runCli([
        'check',
        '--schema',
        configPath,
        '--env-file',
        envPath,
        '--format',
        'json',
      ]);
      expect(exitCode).toBe(1);

      const parsedJson = JSON.parse(capturedOutput);
      expect(parsedJson.success).toBe(false);
      expect(parsedJson.summary.missing).toBe(1);
      expect(parsedJson.errors[0].key).toBe('MISSING_VAR');

      logSpy.mockRestore();
    });

    it('returns 2 when schema or config file is not found', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitCode = await runCli(['check', '--schema', './non_existent_file.json']);
      expect(exitCode).toBe(2);
      errSpy.mockRestore();
    });
  });
});
