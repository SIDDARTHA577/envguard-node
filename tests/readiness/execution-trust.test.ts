import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runProjectCommand,
  previewExecutionCommands,
  detectContainerEnvironment,
  isEnvironmentIsolated,
  validateWorkingDirectory,
  buildSanitizedEnv,
  TRUST_MODELS,
} from '../../tools/readiness-auditor.mjs';

describe('9.3: Execution Trust Boundaries & Host Containment Verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-exec-trust-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          test: 'node -e "console.log(\'testing\')"',
          build: 'node -e "console.log(\'building\')"',
        },
      })
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Trust Model & Authorization Boundaries', () => {
    it('defines explicit TRUST_MODELS enum and isEnvironmentIsolated helper', () => {
      expect(TRUST_MODELS.TRUSTED_LOCAL_PROJECT).toBe('TRUSTED_LOCAL_PROJECT');
      expect(TRUST_MODELS.ISOLATED_UNTRUSTED_PROJECT).toBe('ISOLATED_UNTRUSTED_PROJECT');
      expect(TRUST_MODELS.STATIC_ONLY).toBe('STATIC_ONLY');
      expect(typeof isEnvironmentIsolated()).toBe('boolean');
    });

    it('blocks execution when allowExec is false (read-only mode)', () => {
      const res = runProjectCommand('node', ['--version'], tempDir, {
        allowExec: false,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.notRun).toBe(true);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('unauthorized');
      expect(res.trustMode).toBe(TRUST_MODELS.STATIC_ONLY);
    });

    it('blocks execution on uncontained host without --trust-project', () => {
      const res = runProjectCommand('node', ['--version'], tempDir, {
        allowExec: true,
        trustProject: false,
        isIsolated: false,
      });

      expect(res.success).toBe(false);
      expect(res.notRun).toBe(true);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('host_isolation_unavailable');
      expect(res.trustMode).toBe(TRUST_MODELS.STATIC_ONLY);
      expect(res.stderr).toContain('Process isolation unavailable');
    });

    it('allows execution when trustProject is true (TRUSTED_LOCAL_PROJECT)', () => {
      const res = runProjectCommand('node', ['--version'], tempDir, {
        allowExec: true,
        trustProject: true,
        isIsolated: false,
      });

      expect(res.success).toBe(true);
      expect(res.notRun).toBeUndefined();
      expect(res.trustMode).toBe(TRUST_MODELS.TRUSTED_LOCAL_PROJECT);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('v');
    });

    it('allows execution when verified isolated container is provided (ISOLATED_UNTRUSTED_PROJECT)', () => {
      const res = runProjectCommand('node', ['--version'], tempDir, {
        allowExec: true,
        trustProject: false,
        isIsolated: true,
      });

      expect(res.success).toBe(true);
      expect(res.trustMode).toBe(TRUST_MODELS.ISOLATED_UNTRUSTED_PROJECT);
      expect(res.isolated).toBe(true);
    });
  });

  describe('Working Directory Validation & Path Security', () => {
    it('rejects invalid or non-existent working directory', () => {
      const fakeDir = path.join(tempDir, 'does-not-exist');
      const res = runProjectCommand('node', ['--version'], fakeDir, {
        allowExec: true,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('invalid_project_dir');
      expect(res.stderr).toContain('Working directory does not exist');
    });

    it('rejects working directory paths containing null bytes', () => {
      const nullDir = `${tempDir}\0evil`;
      const res = runProjectCommand('node', ['--version'], nullDir, {
        allowExec: true,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe('invalid_project_dir');
      expect(res.stderr).toContain('null bytes');
    });

    it('validates working directory helper function', () => {
      expect(validateWorkingDirectory(tempDir).valid).toBe(true);
      expect(validateWorkingDirectory('').valid).toBe(false);
      expect(validateWorkingDirectory(null as unknown as string).valid).toBe(false);
    });
  });

  describe('Binary & Argument Allowlisting', () => {
    it('refuses to execute unwhitelisted binaries (curl, bash, rm, python)', () => {
      const res = runProjectCommand('curl', ['https://example.com'], tempDir, {
        allowExec: true,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('unsupported_binary');
      expect(res.stderr).toContain('Refusing to execute unwhitelisted binary "curl"');
    });

    it('rejects arguments with shell metacharacters (;, &, |, `, $)', () => {
      const res = runProjectCommand('node', ['-e', 'console.log(1); rm -rf /'], tempDir, {
        allowExec: true,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('unsafe_arguments');
      expect(res.stderr).toContain('contains disallowed characters');
    });

    it('rejects directory traversal arguments (..)', () => {
      const res = runProjectCommand('node', ['../../etc/passwd'], tempDir, {
        allowExec: true,
        trustProject: true,
      });

      expect(res.success).toBe(false);
      expect(res.blockedByPolicy).toBe(true);
      expect(res.reason).toBe('unsafe_arguments');
      expect(res.stderr).toContain('directory traversal sequence');
    });

    it('enforces allowedCommands list when specified', () => {
      const resBlocked = runProjectCommand('npm', ['run', 'build'], tempDir, {
        allowExec: true,
        trustProject: true,
        allowedCommands: ['test'],
      });

      expect(resBlocked.success).toBe(false);
      expect(resBlocked.blockedByPolicy).toBe(true);
      expect(resBlocked.reason).toBe('command_not_whitelisted');
      expect(resBlocked.stderr).toContain('not in the authorized command list');
    });
  });

  describe('Sanitized Environment & Previews', () => {
    it('strips sensitive environment variables from child processes', () => {
      const dirtyEnv = {
        PATH: process.env.PATH,
        GITHUB_TOKEN: 'ghp_secret_token_123',
        AWS_SECRET_ACCESS_KEY: 'aws_secret_key_456',
        DATABASE_URL: 'postgres://root:secret@db.prod.com/db',
        ENVGUARD_KEY: 'test-key',
      };

      const safeEnv = buildSanitizedEnv(dirtyEnv as unknown as NodeJS.ProcessEnv);

      expect(safeEnv.PATH).toBeDefined();
      expect(safeEnv.GITHUB_TOKEN).toBeUndefined();
      expect(safeEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(safeEnv.DATABASE_URL).toBeUndefined();
      expect(safeEnv.ENVGUARD_KEY).toBeUndefined();
      expect(safeEnv.CI).toBe('true');
      expect(safeEnv.NODE_ENV).toBe('test');
    });

    it('provides clear execution disclosures in previewExecutionCommands', () => {
      const pkg = {
        scripts: {
          test: 'vitest run',
          build: 'vite build',
          lint: 'eslint .',
        },
      };

      const preview = previewExecutionCommands(tempDir, pkg, 5000, {
        allowExec: false,
        trustProject: false,
      });

      expect(preview.trustMode).toBe(TRUST_MODELS.STATIC_ONLY);
      expect(preview.commands.length).toBe(3);
      expect(preview.disclosures.network).toContain('Network isolation is not enforced by host OS');
      expect(preview.disclosures.filesystem).toContain('modify files in working directory');
    });

    it('detectContainerEnvironment returns structure with indicator', () => {
      const info = detectContainerEnvironment();
      expect(info).toBeDefined();
      expect(typeof info.detected).toBe('boolean');
    });
  });
});
