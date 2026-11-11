import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  TEST_VERIFICATION_STATES,
  POLICY_OUTCOMES,
  discoverTestFramework,
  evaluateReleasePolicy,
  generateRemediationPatches,
  NodeTypeScriptAdapter,
  BaseAdapter,
  runReadinessAudit,
  createDefaultRegistry,
} from '../../tools/readiness-auditor.mjs';
import { syncCodexSkills } from '../../scripts/sync-codex-skills.mjs';

describe('Phase 14.3 — Evidence Integrity, Verification Semantics & Layer B Quality Gates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-evidence-14-3-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('A. Granular Test Verification States vs Dependency Declaration', () => {
    it('does NOT classify vitest/jest dependency alone as TEST_FILES_FOUND or TESTS_PASSED', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'deps-only-app', devDependencies: { vitest: '^2.0.0' } }, null, 2)
      );

      const discovery = discoverTestFramework(tempDir, { devDependencies: { vitest: '^2.0.0' } }, ['package.json']);

      expect(discovery.frameworkDeclared).toBe(true);
      expect(discovery.framework).toBe('vitest');
      expect(discovery.testFilesFound).toBe(false);
      expect(discovery.testExecuted).toBe(false);
      expect(discovery.states).toContain(TEST_VERIFICATION_STATES.FRAMEWORK_DECLARED);
      expect(discovery.states).not.toContain(TEST_VERIFICATION_STATES.TEST_FILES_FOUND);
      expect(discovery.states).not.toContain(TEST_VERIFICATION_STATES.TEST_EXECUTED);
      expect(discovery.states).not.toContain(TEST_VERIFICATION_STATES.TESTS_PASSED);
      expect(discovery.verificationState).toBe(TEST_VERIFICATION_STATES.MANUAL_REVIEW);
      expect(discovery.status).toBe('MANUAL_REVIEW');
      expect(discovery.limitations.some((l: string) => l.includes('zero test files'))).toBe(true);

      // Should not auto-configure passing expectations when test files do not exist
      const patches = generateRemediationPatches(
        tempDir,
        [{ id: 'BUILD-002', status: 'MANUAL_REVIEW', targetPath: '.', title: 'No tests' }],
        ['package.json']
      );
      expect(patches.length).toBe(0);
    });

    it('detects RUNNER_AVAILABLE and TEST_FILES_FOUND without prematurely claiming TESTS_PASSED', () => {
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'vitest'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'vitest', 'package.json'), '{"name":"vitest"}');
      fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'tests', 'app.test.ts'), 'export {};');

      const pkg = { name: 'tested-app', devDependencies: { vitest: '^2.0.0' } };
      const discovery = discoverTestFramework(tempDir, pkg, ['package.json', 'tests/app.test.ts']);

      expect(discovery.frameworkDeclared).toBe(true);
      expect(discovery.runnerAvailable).toBe(true);
      expect(discovery.testFilesFound).toBe(true);
      expect(discovery.testFilesCount).toBe(1);
      expect(discovery.testExecuted).toBe(false);
      expect(discovery.states).toContain(TEST_VERIFICATION_STATES.FRAMEWORK_DECLARED);
      expect(discovery.states).toContain(TEST_VERIFICATION_STATES.RUNNER_AVAILABLE);
      expect(discovery.states).toContain(TEST_VERIFICATION_STATES.TEST_FILES_FOUND);
      expect(discovery.states).toContain(TEST_VERIFICATION_STATES.NOT_RUN);
      expect(discovery.states).not.toContain(TEST_VERIFICATION_STATES.TESTS_PASSED);
      expect(discovery.verificationState).toBe(TEST_VERIFICATION_STATES.NOT_RUN);
    });

    it('only records TESTS_PASSED after authorized dynamic execution executes non-empty tests', () => {
      const adapter = new NodeTypeScriptAdapter();
      fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'tests', 'core.test.js'), 'export {};');

      const pkg = {
        name: 'exec-app',
        devDependencies: { vitest: '^2.0.0' },
        scripts: { build: 'tsc', test: 'vitest run' },
      };

      // 1. Read-only mode must remain NOT_RUN with testExecuted: false
      const readOnly = adapter.runDynamicChecks(
        { path: '.', absPath: tempDir, manifest: pkg, type: 'backend', isRoot: true },
        { projectDir: tempDir, files: ['package.json', 'tests/core.test.js'], allowExec: false },
        () => ({ success: true, exitCode: 0, durationMs: 1 })
      );
      const roTest = readOnly.find((f: { id: string }) => f.id === 'BUILD-002');
      expect(roTest.status).toBe('NOT_RUN');
      expect(roTest.evidence.verificationState).toBe(TEST_VERIFICATION_STATES.NOT_RUN);
      expect(roTest.evidence.testExecuted).toBe(false);

      // 2. Authorized execution where runner exits 0 reporting "No test files found" -> MANUAL_REVIEW (NOT TESTS_PASSED!)
      const emptyPass = adapter.runDynamicChecks(
        { path: '.', absPath: tempDir, manifest: pkg, type: 'backend', isRoot: true },
        { projectDir: tempDir, files: ['package.json', 'tests/core.test.js'], allowExec: true, trustProject: true },
        () => ({ success: true, exitCode: 0, durationMs: 50, stdout: 'No test files found, exiting with code 0', stderr: '' })
      );
      const emptyTest = emptyPass.find((f: { id: string }) => f.id === 'BUILD-002');
      expect(emptyTest.status).toBe('MANUAL_REVIEW');
      expect(emptyTest.evidence.verificationState).toBe(TEST_VERIFICATION_STATES.MANUAL_REVIEW);

      // 3. Authorized execution with actual tests executed -> TESTS_PASSED
      const realPass = adapter.runDynamicChecks(
        { path: '.', absPath: tempDir, manifest: pkg, type: 'backend', isRoot: true },
        { projectDir: tempDir, files: ['package.json', 'tests/core.test.js'], allowExec: true, trustProject: true },
        () => ({ success: true, exitCode: 0, durationMs: 120, stdout: 'Test Files 1 passed (1)\nTests 5 passed (5)', stderr: '' })
      );
      const passTest = realPass.find((f: { id: string }) => f.id === 'BUILD-002');
      expect(passTest.status).toBe('PASS');
      expect(passTest.evidence.verificationState).toBe(TEST_VERIFICATION_STATES.TESTS_PASSED);
      expect(passTest.evidence.testExecuted).toBe(true);
      expect(passTest.evidence.states).toContain(TEST_VERIFICATION_STATES.TEST_EXECUTED);
      expect(passTest.evidence.states).toContain(TEST_VERIFICATION_STATES.TESTS_PASSED);
    });

    it('records TESTS_FAILED when test runner fails or times out', () => {
      const adapter = new NodeTypeScriptAdapter();
      const pkg = { name: 'fail-app', scripts: { build: 'echo ok', test: 'vitest run' } };

      const failed = adapter.runDynamicChecks(
        { path: '.', absPath: tempDir, manifest: pkg, type: 'backend', isRoot: true },
        { projectDir: tempDir, files: ['package.json'], allowExec: true, trustProject: true },
        () => ({ success: false, exitCode: 1, durationMs: 90, stderr: 'Assertion failed' })
      );
      const failTest = failed.find((f: { id: string }) => f.id === 'BUILD-002');
      expect(failTest.status).toBe('FAIL');
      expect(failTest.evidence.verificationState).toBe(TEST_VERIFICATION_STATES.TESTS_FAILED);
      expect(failTest.evidence.testExecuted).toBe(true);
    });
  });

  describe('C. Release Policy Verification, Scanner Crash & Incomplete Coverage Gates', () => {
    const baseSummary = {
      pass: 5,
      fail: 0,
      warning: 0,
      notRun: 0,
      manualReview: 0,
      notApplicable: 0,
      informational: 0,
      error: 0,
      totalChecks: 5,
    };

    it('blocks release immediately when ANY finding has status ERROR (scanner crash)', () => {
      const res = evaluateReleasePolicy(
        [
          {
            id: 'SCAN-ERR-NODE-STATIC',
            category: 'security',
            status: 'ERROR',
            severity: 'critical',
            title: 'Scanner Crash',
          },
        ],
        { ...baseSummary, error: 1 },
        { allowExec: true }
      );

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.gates.zeroScannerErrors).toBe(false);
      expect(res.blockerCount).toBe(1);
    });

    it('never marks outcome READY_FOR_REVIEW when dynamic BUILD checks remain NOT_RUN even with allowExec=true', () => {
      const res = evaluateReleasePolicy(
        [
          { id: 'ENV-001', category: 'env', status: 'PASS', severity: 'info', title: 'Template present' },
          { id: 'BUILD-002', category: 'build_test', status: 'NOT_RUN', severity: 'high', title: 'No tests configured' },
        ],
        { ...baseSummary, pass: 1, notRun: 1 },
        { allowExec: true }
      );

      expect(res.outcome).toBe(POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT);
      expect(res.gates.testExecutionComplete).toBe(false);
    });

    it('marks outcome INCOMPLETE_ASSESSMENT when incompleteCoverage is flagged and flags empty dir coverage', () => {
      const emptyAudit = runReadinessAudit({ projectDir: tempDir });
      expect(emptyAudit.policyEvaluation.gates.completeCoverage).toBe(false);
      expect(emptyAudit.limitations.some((l: string) => l.includes('zero discoverable application source files'))).toBe(true);

      const policyRes = evaluateReleasePolicy(
        [{ id: 'ENV-001', category: 'env', status: 'PASS', title: 'Passing partial check' }],
        { ...baseSummary, pass: 1 },
        { allowExec: true, incompleteCoverage: true }
      );
      expect(policyRes.outcome).toBe(POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT);
      expect(policyRes.gates.completeCoverage).toBe(false);
    });

    it('captures unhandled adapter crashes as ERROR findings and blocks readiness safely without throwing', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"crash-target"}');

      class CrashingAdapter extends BaseAdapter {
        constructor() {
          super({ id: 'crashing-test-adapter', name: 'Crashing Test Adapter', version: '1.0.0' });
        }
        detect() {
          return { matched: true, confidence: 1.0, reason: 'test' };
        }
        runStaticChecks(): Array<unknown> {
          throw new Error('Simulated static parser crash');
        }
      }

      const registry = createDefaultRegistry();
      registry.register(new CrashingAdapter());

      const report = runReadinessAudit({
        projectDir: tempDir,
        includeArchitecture: false,
        registryOverride: registry,
      });

      expect(report.summary.error).toBe(1);
      expect(report.policyEvaluation.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(report.policyEvaluation.gates.zeroScannerErrors).toBe(false);
      expect(report.findings.some((f: { status: string; id: string }) => f.status === 'ERROR' && f.id.includes('SCAN-ERR'))).toBe(true);
    });

    it('blocks when explicit mandatory checks are missing from findings under verifyMandatoryCheckPresence', () => {
      const res = evaluateReleasePolicy(
        [{ id: 'ENV-001', category: 'env', status: 'PASS', title: 'Template' }],
        baseSummary,
        {
          mandatoryChecks: ['ENV-001', 'SEC-001'],
          verifyMandatoryCheckPresence: true,
          allowExec: true,
        }
      );

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.gates.mandatoryChecksPassed).toBe(false);
    });
  });

  describe('B & D. Layer B Quality Gates & Codex Script Invocation Safety', () => {
    it('validates syncCodexSkills passes options object with repoRoot instead of raw string', () => {
      expect(() => syncCodexSkills(path.resolve(__dirname, '..', '..'))).not.toThrow();
    });

    it('verifies package.json lint and typecheck scripts include Layer B tools and scripts', () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
      expect(rootPkg.scripts.lint).toContain('tools/');
      expect(rootPkg.scripts.lint).toContain('scripts/');
      expect(rootPkg.scripts.typecheck).toContain('tsconfig.tools.json');
      expect(rootPkg.dependencies).toBeUndefined();
    });
  });
});
