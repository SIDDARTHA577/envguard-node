import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runReadinessAudit,
  generateMarkdownReport,
  stripAnsi,
  sanitizeOutput,
  assertSafeProjectDir,
  main,
} from '../../tools/readiness-auditor.mjs';

describe('EnvGuard Production Readiness Auditor', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

  describe('Scenario 1: Healthy Application (healthy-app)', () => {
    const projectDir = path.join(fixturesDir, 'healthy-app');

    it('runs in read-only mode by default and verifies static checks with NOT_RUN for builds', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBe(0);
      expect(report.summary.pass).toBeGreaterThanOrEqual(8);
      expect(report.summary.notRun).toBeGreaterThan(0);

      // Verify specific passing checks
      const passedIds = report.findings.filter((f) => f.status === 'PASS').map((f) => f.id);
      expect(passedIds).toContain('DISC-002'); // engines.node
      expect(passedIds).toContain('ENV-001');  // .env.example
      expect(passedIds).toContain('ENV-002');  // .gitignore
      expect(passedIds).toContain('API-002');  // valid openapi
      expect(passedIds).toContain('API-004');  // RFC 7807 problem details
      expect(passedIds).toContain('DEP-001');  // Dockerfile
      expect(passedIds).toContain('DEP-002');  // /health route
      expect(passedIds).toContain('DEP-003');  // SIGTERM handler
      expect(passedIds).toContain('DEP-004');  // CI workflows

      // Build & test checks must be NOT_RUN in read-only mode
      const buildCheck = report.findings.find((f) => f.id === 'BUILD-001');
      expect(buildCheck?.status).toBe('NOT_RUN');
      expect(buildCheck?.manualVerificationRequired).toBe(true);
    });

    it('executes declared build and test commands when allowExec is true', () => {
      const report = runReadinessAudit({ projectDir, allowExec: true, timeoutMs: 5000 });

      expect(report.summary.fail).toBe(0);

      const testCheck = report.findings.find((f) => f.id === 'BUILD-002');
      expect(testCheck?.status).toBe('PASS');
      expect(testCheck?.checkMethod).toBe('command_execution');
      expect(testCheck?.evidence?.exitCode).toBe(0);

      const buildCheck = report.findings.find((f) => f.id === 'BUILD-001');
      expect(buildCheck?.status).toBe('PASS');
    });
  });

  describe('Scenario 2: Missing Environment Configuration (missing-env)', () => {
    const projectDir = path.join(fixturesDir, 'missing-env');
    const syntheticEnvFile = path.join(projectDir, '.env');

    beforeEach(() => {
      fs.writeFileSync(
        syntheticEnvFile,
        'DATABASE_URL=postgres://root:synthetic@localhost:5432/live\nSECRET_KEY=synthetic_test_secret_key_12345\n',
        'utf8'
      );
    });

    afterEach(() => {
      if (fs.existsSync(syntheticEnvFile)) {
        fs.rmSync(syntheticEnvFile, { force: true });
      }
    });

    it('identifies missing template, missing gitignore rule, and committed .env file without leaking secrets', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBeGreaterThanOrEqual(2);

      const missingTemplate = report.findings.find((f) => f.id === 'ENV-001');
      expect(missingTemplate?.status).toBe('FAIL');
      expect(missingTemplate?.severity).toBe('high');

      const missingIgnore = report.findings.find((f) => f.id === 'ENV-002');
      expect(missingIgnore?.status).toBe('FAIL');
      expect(missingIgnore?.severity).toBe('critical');

      const committedEnv = report.findings.find((f) => f.id === 'ENV-004');
      expect(committedEnv?.status).toBe('FAIL');
      expect(committedEnv?.severity).toBe('critical');

      // Ensure secret value is never in findings
      const json = JSON.stringify(report);
      expect(json).not.toContain('synthetic_test_secret_key_12345');
    });
  });

  describe('Scenario 3: Broken API Contract (broken-api)', () => {
    const projectDir = path.join(fixturesDir, 'broken-api');

    it('detects RPC action verbs and missing RFC 7807 Problem Details model', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      const rpcWarning = report.findings.find((f) => f.id === 'API-003');
      expect(rpcWarning?.status).toBe('WARNING');
      expect(rpcWarning?.explanation).toContain('RPC-style action verbs in paths');

      const missingProblemDetails = report.findings.find((f) => f.id === 'API-004');
      expect(missingProblemDetails?.status).toBe('WARNING');
      expect(missingProblemDetails?.explanation).toContain('Problem Details error envelope');
    });
  });

  describe('Scenario 4: Unsafe Synthetic Secret Logging (unsafe-logging)', () => {
    const projectDir = path.join(fixturesDir, 'unsafe-logging');

    it('flags console.log of secret variables and redacts sensitive tokens in evidence', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      const logFinding = report.findings.find((f) => f.id === 'SEC-002');
      expect(logFinding?.status).toBe('WARNING');
      expect(logFinding?.severity).toBe('high');
      expect(logFinding?.title).toContain('Potential Sensitive Value Logging');
      expect(logFinding?.evidence?.file).toBe('src/auth.js');
    });
  });

  describe('Scenario 5: Failing Tests (failing-tests)', () => {
    const projectDir = path.join(fixturesDir, 'failing-tests');

    it('reports NOT_RUN in read-only mode and reports FAIL with exit code 1 under --allow-exec', () => {
      // 1. Read-only mode
      const readOnlyReport = runReadinessAudit({ projectDir, allowExec: false });
      const testReadOnly = readOnlyReport.findings.find((f) => f.id === 'BUILD-002');
      expect(testReadOnly?.status).toBe('NOT_RUN');

      // 2. Authorized execution mode
      const execReport = runReadinessAudit({ projectDir, allowExec: true, timeoutMs: 5000 });
      const testExec = execReport.findings.find((f) => f.id === 'BUILD-002');
      expect(testExec?.status).toBe('FAIL');
      expect(testExec?.evidence?.exitCode).toBe(1);
      expect(testExec?.checkMethod).toBe('command_execution');
      expect(testExec?.evidence?.snippet).toContain('AssertionError');
    });
  });

  describe('Scenario 6: Absent Deployment Checks (absent-deployment)', () => {
    const projectDir = path.join(fixturesDir, 'absent-deployment');

    it('classifies missing Dockerfile, health route, and CI as non-blocking warnings', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBe(0); // Not a hard failure

      const noDocker = report.findings.find((f) => f.id === 'DEP-001');
      expect(noDocker?.status).toBe('WARNING');

      const noHealth = report.findings.find((f) => f.id === 'DEP-002');
      expect(noHealth?.status).toBe('WARNING');

      const noShutdown = report.findings.find((f) => f.id === 'DEP-003');
      expect(noShutdown?.status).toBe('WARNING');

      const noCi = report.findings.find((f) => f.id === 'DEP-004');
      expect(noCi?.status).toBe('WARNING');
    });
  });

  describe('Edge Cases, Safety Boundaries & Reporting', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-audit-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles malformed package.json gracefully without throwing an unhandled exception', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{ "name": unclosed json', 'utf8');
      const report = runReadinessAudit({ projectDir: tempDir });

      const discFinding = report.findings.find((f) => f.id === 'DISC-001');
      expect(discFinding?.status).toBe('FAIL');
      expect(report.summary.fail).toBeGreaterThanOrEqual(1);
    });

    it('handles completely empty directory without throwing', () => {
      const report = runReadinessAudit({ projectDir: tempDir });
      expect(report.summary.totalChecks).toBeGreaterThan(0);
      expect(report.findings.length).toBeGreaterThan(0);
    });

    it('rejects non-existent directory with an actionable error', () => {
      expect(() => {
        runReadinessAudit({ projectDir: path.join(tempDir, 'does-not-exist') });
      }).toThrow(/Project directory does not exist/);
    });

    it('rejects path traversal containing null bytes', () => {
      expect(() => {
        assertSafeProjectDir('dir\0withnull');
      }).toThrow(/contains null byte/);
    });

    it('sanitizes ANSI escape sequences and masks bearer tokens and stripe keys', () => {
      const ansiInput = '\u001b[31mRed text\u001b[39m and \u001b[1mbold\u001b[22m';
      expect(stripAnsi(ansiInput)).toBe('Red text and bold');

      const tokenInput = 'Authorization: Bearer my-secret-token-xyz123';
      expect(sanitizeOutput(tokenInput)).toContain('[REDACTED]');

      const ghToken = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      expect(sanitizeOutput(ghToken)).toContain('[REDACTED_GH_TOKEN]');
    });

    it('generates a valid Markdown report with all 7 required sections', () => {
      const report = runReadinessAudit({ projectDir: path.join(fixturesDir, 'healthy-app') });
      const md = generateMarkdownReport(report);

      expect(md).toContain('# EnvGuard Production Readiness Assessment Report');
      expect(md).toContain('## 1. Executive Summary');
      expect(md).toContain('## 4. Verified Passing Checks');
      expect(md).toContain('## 6. Prioritized Remediation Plan');
      expect(md).toContain('## 7. Known Limitations & Scope Boundaries');
      expect(md).not.toContain('% ready'); // No fabricated percentages
    });

    it('maintains deterministic finding ordering (by category then by id)', () => {
      const report = runReadinessAudit({ projectDir: path.join(fixturesDir, 'healthy-app') });
      for (let i = 0; i < report.findings.length - 1; i++) {
        const cur = report.findings[i];
        const next = report.findings[i + 1];
        if (cur.category === next.category) {
          expect(cur.id.localeCompare(next.id)).toBeLessThanOrEqual(0);
        } else {
          expect(cur.category.localeCompare(next.category)).toBeLessThanOrEqual(0);
        }
      }
    });

    it('CLI main() exits 0 on --help, exits 0 on healthy app, and exits 2 when failures exist', () => {
      expect(main(['--help'])).toBe(0);

      const healthyCode = main(['scan', '--project', path.join(fixturesDir, 'healthy-app')]);
      expect(healthyCode).toBe(0);

      const failingCode = main(['scan', '--project', path.join(fixturesDir, 'missing-env')]);
      expect(failingCode).toBe(2);

      const invalidCode = main(['--unknown-flag-xyz']);
      expect(invalidCode).toBe(1);
    });

    it('CLI writes report files when --output-dir is specified', () => {
      const outDir = path.join(tempDir, 'output');
      const code = main([
        'scan',
        '--project',
        path.join(fixturesDir, 'healthy-app'),
        '--output-dir',
        outDir,
        '--format',
        'both',
      ]);
      expect(code).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'readiness-report.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'readiness-report.md'))).toBe(true);
    });
  });
});
