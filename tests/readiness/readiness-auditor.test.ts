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
  assertSafeOutputDir,
  runProjectCommand,
  buildSanitizedEnv,
  parseGitignoreRules,
  isPathIgnoredByRules,
  previewExecutionCommands,
  EXIT_CODES,
  main,
} from '../../tools/readiness-auditor.mjs';
import { installSkills, uninstallSkills } from '../../tools/skill-manager.mjs';

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
      expect(passedIds).toContain('API-004');  // RFC 9457 problem details
      expect(passedIds).toContain('DEP-001');  // Dockerfile
      expect(passedIds).toContain('DEP-002');  // /health route
      expect(passedIds).toContain('DEP-003');  // SIGTERM handler
      expect(passedIds).toContain('DEP-004');  // CI workflows

      // Build & test checks must be NOT_RUN in read-only mode
      const buildCheck = report.findings.find((f) => f.id === 'BUILD-001');
      expect(buildCheck?.status).toBe('NOT_RUN');
      expect(buildCheck?.manualVerificationRequired).toBe(true);
    });

    it('blocks execution when allowExec is true but host is unisolated and trustProject is false', () => {
      const report = runReadinessAudit({
        projectDir,
        allowExec: true,
        trustProject: false,
        isIsolated: false,
        timeoutMs: 5000,
      });

      const testCheck = report.findings.find((f) => f.id === 'BUILD-002');
      expect(testCheck?.status).toBe('NOT_RUN');
      expect(testCheck?.title).toContain('Blocked by Containment Policy');
    });

    it('executes declared build and test commands when allowExec is true with explicit host trust', () => {
      const report = runReadinessAudit({
        projectDir,
        allowExec: true,
        trustProject: true,
        timeoutMs: 10000,
      });

      expect(report.summary.fail).toBe(0);

      const testCheck = report.findings.find((f) => f.id === 'BUILD-002');
      expect(testCheck?.status).toBe('PASS');
      expect(testCheck?.checkMethod).toBe('command_execution');
      expect(testCheck?.evidence?.exitCode).toBe(0);

      const buildCheck = report.findings.find((f) => f.id === 'BUILD-001');
      expect(buildCheck?.status).toBe('PASS');

      // Verify execution audit trail
      expect(report.executionAudit).toBeDefined();
      expect(report.executionAudit.length).toBeGreaterThan(0);
      expect(report.executionAudit[0].command).toBe('npm');
    }, 30000);
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

    it('identifies missing template, missing gitignore rule, and untracked unignored .env file without leaking secrets', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBeGreaterThanOrEqual(2);

      const missingTemplate = report.findings.find((f) => f.id === 'ENV-001');
      expect(missingTemplate?.status).toBe('FAIL');
      expect(missingTemplate?.severity).toBe('high');

      const missingIgnore = report.findings.find((f) => f.id === 'ENV-002');
      expect(missingIgnore?.status).toBe('FAIL');
      expect(missingIgnore?.severity).toBe('critical');

      const unignoredEnv = report.findings.find((f) => f.id === 'ENV-004');
      expect(unignoredEnv?.status).toBe('FAIL');

      // Ensure secret value is never in findings
      const json = JSON.stringify(report);
      expect(json).not.toContain('synthetic_test_secret_key_12345');
    });
  });

  describe('Scenario 3: Broken API Contract (broken-api)', () => {
    const projectDir = path.join(fixturesDir, 'broken-api');

    it('detects RPC action verbs and missing RFC 9457 Problem Details model', () => {
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

    it('reports NOT_RUN in read-only mode and reports FAIL with exit code 1 under authorized execution', () => {
      // 1. Read-only mode
      const readOnlyReport = runReadinessAudit({ projectDir, allowExec: false });
      const testReadOnly = readOnlyReport.findings.find((f) => f.id === 'BUILD-002');
      expect(testReadOnly?.status).toBe('NOT_RUN');

      // 2. Authorized execution mode
      const execReport = runReadinessAudit({
        projectDir,
        allowExec: true,
        trustProject: true,
        timeoutMs: 5000,
      });
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

  describe('Scenario 7: OpenAPI 3.1 YAML Specification (openapi-yaml)', () => {
    const projectDir = path.join(fixturesDir, 'openapi-yaml');

    it('successfully parses OpenAPI YAML, validates 3.1 schema structure and RFC 9457 model', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false, categories: ['api'] });

      const parsedFinding = report.findings.find((f) => f.id === 'API-001');
      expect(parsedFinding?.status).toBe('PASS');
      expect(parsedFinding?.title).toContain('YAML');

      const schemaFinding = report.findings.find((f) => f.id === 'API-002');
      expect(schemaFinding?.status).toBe('PASS');
      expect(schemaFinding?.title).toContain('3.1.0');

      const problemFinding = report.findings.find((f) => f.id === 'API-004');
      expect(problemFinding?.status).toBe('PASS');
      expect(problemFinding?.title).toContain('RFC 9457');
    });
  });

  describe('Scenario 8: Malformed OpenAPI YAML (invalid-openapi-yaml)', () => {
    const projectDir = path.join(fixturesDir, 'invalid-openapi-yaml');

    it('handles malformed YAML syntax gracefully and records API-001 FAIL without crashing', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false, categories: ['api'] });

      const parsedFinding = report.findings.find((f) => f.id === 'API-001');
      expect(parsedFinding?.status).toBe('FAIL');
      expect(parsedFinding?.title).toBe('Malformed OpenAPI Specification');
    });
  });

  describe('Git-Tracking vs Working Tree Accuracy', () => {
    it('correctly parses .gitignore rules including comments, whitespace, and negation', () => {
      const gitignore = `
        # Ignore secret files
        .env
        .env.*
        !.env.example
        *.log
        dist/
      `;
      const rules = parseGitignoreRules(gitignore);
      expect(rules.length).toBe(5);

      expect(isPathIgnoredByRules(rules, '.env')).toBe(true);
      expect(isPathIgnoredByRules(rules, '.env.local')).toBe(true);
      expect(isPathIgnoredByRules(rules, '.env.production')).toBe(true);
      expect(isPathIgnoredByRules(rules, '.env.example')).toBe(false); // negated!
      expect(isPathIgnoredByRules(rules, 'app.log')).toBe(true);
      expect(isPathIgnoredByRules(rules, 'src/index.ts')).toBe(false);
    });

    it('classifies untracked local .env file that IS ignored as PASS (info) rather than committed', () => {
      const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-test-env-'));
      try {
        fs.writeFileSync(path.join(tempProject, 'package.json'), JSON.stringify({ name: 'test' }));
        fs.writeFileSync(path.join(tempProject, '.env.example'), 'PORT=3000\n');
        fs.writeFileSync(path.join(tempProject, '.gitignore'), '.env\n');
        fs.writeFileSync(path.join(tempProject, '.env'), 'PORT=3000\nSECRET=local_only\n');

        const report = runReadinessAudit({ projectDir: tempProject, categories: ['env'] });
        const envFinding = report.findings.find((f) => f.id === 'ENV-004');

        expect(envFinding?.status).toBe('PASS');
        expect(envFinding?.title).toContain('Safely Ignored');
        expect(envFinding?.explanation).not.toContain('tracked in Git');
      } finally {
        fs.rmSync(tempProject, { recursive: true, force: true });
      }
    });
  });

  describe('Security Boundaries & Untrusted Command Execution', () => {
    let tempProject: string;

    beforeEach(() => {
      tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-security-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempProject)) {
        try {
          fs.rmSync(tempProject, { recursive: true, force: true });
        } catch {
          // Ignore transient Windows file handle release
        }
      }
    });

    it('strips parent environment variables and passes only minimized safe variables', () => {
      const taintedEnv = {
        PATH: process.env.PATH || '',
        AWS_SECRET_ACCESS_KEY: 'super_secret_aws_key',
        GITHUB_TOKEN: 'ghp_fake_token_123456789',
        DATABASE_PASSWORD: 'super_secret_password',
      };
      const clean = buildSanitizedEnv(taintedEnv);

      expect(clean.PATH).toBeDefined();
      expect(clean.CI).toBe('true');
      expect(clean.NODE_ENV).toBe('test');
      expect((clean as Record<string, string>).AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect((clean as Record<string, string>).GITHUB_TOKEN).toBeUndefined();
      expect((clean as Record<string, string>).DATABASE_PASSWORD).toBeUndefined();
    });

    it('rejects unwhitelisted binaries and commands with shell metacharacters', () => {
      // 1. Disallowed binary
      const res1 = runProjectCommand('curl', ['https://evil.com'], tempProject, { allowExec: true, trustProject: true });
      expect(res1.notRun).toBe(true);
      expect(res1.reason).toBe('unsupported_binary');

      // 2. Shell injection attempt in argument
      const res2 = runProjectCommand('npm', ['run', 'test; rm -rf /'], tempProject, { allowExec: true, trustProject: true });
      expect(res2.notRun).toBe(true);
      expect(res2.reason).toBe('unsafe_arguments');
    });

    it('supports --preview-commands to inspect execution plan without running scripts', () => {
      const preview = previewExecutionCommands(
        path.join(fixturesDir, 'healthy-app'),
        { scripts: { test: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' } },
        10000,
        { allowExec: false }
      );

      expect(preview.commands.length).toBe(2);
      expect(preview.disclosures.network).toBeDefined();
      expect(preview.disclosures.filesystem).toBeDefined();
    });

    it('enforces execution timeout limits on long-running commands', () => {
      fs.writeFileSync(
        path.join(tempProject, 'package.json'),
        JSON.stringify({
          name: 'timeout-test',
          scripts: { test: 'node -e "setTimeout(() => {}, 5000)"' },
        })
      );

      const report = runReadinessAudit({
        projectDir: tempProject,
        allowExec: true,
        trustProject: true,
        timeoutMs: 300,
        categories: ['build_test'],
      });

      const testCheck = report.findings.find((f) => f.id === 'BUILD-002');
      expect(testCheck?.status).toBe('FAIL');
      expect(testCheck?.title).toContain('Timed Out');
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

    it('assertSafeOutputDir rejects null bytes and root paths', () => {
      expect(() => assertSafeOutputDir('out\0dir')).toThrow(/contains null byte/);
      expect(() => assertSafeOutputDir('/')).toThrow(/Refusing to write assessment reports to system directory/);
    });

    it('sanitizes ANSI escape sequences and masks bearer tokens and stripe keys', () => {
      const ansiInput = '\u001b[31mRed text\u001b[39m and \u001b[1mbold\u001b[22m';
      expect(stripAnsi(ansiInput)).toBe('Red text and bold');

      const tokenInput = 'Authorization: Bearer my-secret-token-xyz123';
      expect(sanitizeOutput(tokenInput)).toContain('[REDACTED]');

      const ghToken = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      expect(sanitizeOutput(ghToken)).toContain('[REDACTED_GH_TOKEN]');

      const awsKey = 'AccessKey: AKIAIOSFODNN7EXAMPLE';
      expect(sanitizeOutput(awsKey)).toContain('[REDACTED_AWS_KEY]');
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
      const catOrder = new Map(['discovery', 'env', 'build_test', 'security', 'api', 'database', 'deployment', 'accessibility', 'performance'].map((c, i) => [c, i]));
      for (let i = 0; i < report.findings.length - 1; i++) {
        const cur = report.findings[i];
        const next = report.findings[i + 1];
        if (cur.category === next.category) {
          expect(cur.id.localeCompare(next.id)).toBeLessThanOrEqual(0);
        } else {
          expect(catOrder.get(cur.category)).toBeLessThanOrEqual(catOrder.get(next.category)!);
        }
      }
    });

    it('CLI main() exits with appropriate standardized exit codes', () => {
      // 0 = Success
      expect(main(['--help'])).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
      expect(main(['scan', '--project', path.join(fixturesDir, 'healthy-app')])).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);

      // 2 = Policy Blockers
      expect(main(['scan', '--project', path.join(fixturesDir, 'missing-env')])).toBe(EXIT_CODES.POLICY_BLOCKERS);

      // 3 = Invalid Arguments
      expect(main(['--unknown-flag-xyz'])).toBe(EXIT_CODES.INVALID_ARGUMENTS);
      expect(main(['scan', '--format', 'invalid_format'])).toBe(EXIT_CODES.INVALID_ARGUMENTS);
      expect(main(['scan', '--checks', 'invalid_category'])).toBe(EXIT_CODES.INVALID_ARGUMENTS);
      expect(main(['scan', '--timeout', '-100'])).toBe(EXIT_CODES.INVALID_ARGUMENTS);
      expect(main(['scan', '--project'])).toBe(EXIT_CODES.INVALID_ARGUMENTS); // missing value
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
      expect(code).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
      expect(fs.existsSync(path.join(outDir, 'readiness-report.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'readiness-report.md'))).toBe(true);
    });

    it('installs the production pack into an external project, executes bundled auditor, and uninstalls cleanly', () => {
      const externalProject = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-external-'));
      try {
        // 1. Install production pack into external project
        const installRes = installSkills({
          packName: 'production',
          destDir: externalProject,
          targetHost: 'codex',
        });
        expect(installRes.success).toBe(true);

        // 2. Verify files installed: both SKILL.md and bundled script
        const skillMd = path.join(externalProject, '.agents', 'skills', 'envguard-production-readiness', 'SKILL.md');
        const auditorScript = path.join(
          externalProject,
          '.agents',
          'skills',
          'envguard-production-readiness',
          'scripts',
          'readiness-auditor.mjs'
        );
        expect(fs.existsSync(skillMd)).toBe(true);
        expect(fs.existsSync(auditorScript)).toBe(true);

        // 3. Verify metadata recorded both files
        const meta = JSON.parse(fs.readFileSync(path.join(externalProject, '.envguard-skills.json'), 'utf8'));
        const recordedFiles = meta.skills['envguard-production-readiness'].files.map((f: { path: string }) => f.path);
        expect(recordedFiles.length).toBeGreaterThanOrEqual(2);

        // 4. Clean uninstall
        const uninstallRes = uninstallSkills({
          packName: 'production',
          destDir: externalProject,
        });
        expect(uninstallRes.success).toBe(true);
        expect(fs.existsSync(skillMd)).toBe(false);
        expect(fs.existsSync(auditorScript)).toBe(false);
      } finally {
        fs.rmSync(externalProject, { recursive: true, force: true });
      }
    }, 30000);
  });
});
