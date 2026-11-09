import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  compareReadinessReports,
  validateReportSchema,
  getFindingKey,
  formatComparisonMarkdown,
  runReadinessAudit,
} from '../../tools/readiness-auditor.mjs';

const rootDir = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

type MockReport = Parameters<typeof compareReadinessReports>[0];
type FindingItem = { id: string; status: string; [key: string]: unknown };

describe('9.1 & 9.2: Readiness Report Comparator Accuracy & Same-Project Regression Fixtures', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-comparator-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // 1. Schema Validation
  describe('Schema Validation & Error Handling', () => {
    it('validates finding key format and schema helper directly', () => {
      const key = getFindingKey({ id: 'ENV-001', targetPath: '.', evidence: { file: '.env.example' } });
      expect(key).toBe('ENV-001::.::.env.example');

      const archKey = getFindingKey({ id: 'ARCH-RATE-001', targetPath: '.', evidence: { file: 'arbitrary.js' } });
      expect(archKey).toBe('ARCH-RATE-001::.');

      expect(() => validateReportSchema(null)).toThrow();
    });
    it('throws when beforeReport or afterReport is not an object', () => {
      expect(() => compareReadinessReports(null as unknown as MockReport, {} as unknown as MockReport)).toThrow(
        /Invalid comparison input: beforeReport must be a valid report object/
      );
      const validMock = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'my-app',
        findings: [],
        summary: {},
      };
      expect(() => compareReadinessReports(validMock, null as unknown as MockReport)).toThrow(
        /Invalid comparison input: afterReport must be a valid report object/
      );
    });

    it('throws when required schema fields are missing', () => {
      const incomplete = { schemaVersion: '1.1.0', toolVersion: '1.0.0' };
      expect(() =>
        compareReadinessReports(incomplete as unknown as MockReport, incomplete as unknown as MockReport)
      ).toThrow(/is missing required field "projectRoot"/);
    });

    it('throws when schemaVersion is incompatible or non-semver', () => {
      const invalidVersion = {
        schemaVersion: 'invalid-version',
        toolVersion: '1.0.0',
        projectRoot: 'my-app',
        findings: [],
        summary: {},
      };
      expect(() =>
        compareReadinessReports(invalidVersion as unknown as MockReport, invalidVersion as unknown as MockReport)
      ).toThrow(/incompatible schemaVersion/);
    });

    it('throws when findings is not an array', () => {
      const invalidFindings = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'my-app',
        findings: 'not-an-array',
        summary: {},
      };
      expect(() =>
        compareReadinessReports(invalidFindings as unknown as MockReport, invalidFindings as unknown as MockReport)
      ).toThrow(/"findings" must be an array/);
    });
  });

  // 2. Controlled Same-Project Before-and-After Scenarios
  describe('Controlled Same-Project Scenarios', () => {
    it('Scenario A: confirms actual defect fixed (FAIL -> PASS)', () => {
      const appDir = path.join(tempDir, 'app-a');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const before = runReadinessAudit({ projectDir: appDir });
      expect(before.summary.fail).toBeGreaterThan(0);

      // Remediate both defects in the same project
      fs.writeFileSync(
        path.join(appDir, '.env.example'),
        'PORT=3000\nDATABASE_URL=postgres://localhost:5432/db\nAPI_KEY=your_key_here\n'
      );
      fs.writeFileSync(path.join(appDir, '.gitignore'), '.env\n.env.*\nnode_modules\n');

      const after = runReadinessAudit({ projectDir: appDir, allowExec: true, trustProject: true });

      const comp = compareReadinessReports(before, after);

      expect(comp.projectIdentity.projectMismatch).toBe(false);
      expect(comp.scopeCompatibility.scopeMismatch).toBe(false);
      expect(comp.statusTransition.from).toBe('BLOCKED');
      expect(comp.statusTransition.to).toBe('READY FOR HUMAN RELEASE REVIEW');
      expect(comp.statusTransition.improved).toBe(true);
      expect(comp.statusTransition.regressed).toBe(false);
      expect(comp.statusTransition.verdict).toBe('IMPROVED');

      expect(comp.resolvedFindings.length).toBeGreaterThanOrEqual(2);
      const resolvedIds = comp.resolvedFindings.map((f: FindingItem) => f.id);
      expect(resolvedIds).toContain('ENV-001');
      expect(resolvedIds).toContain('ENV-002');
      expect(comp.summaryDelta.fail).toBeLessThan(0);
    });

    it('Scenario B: detects defect remains unchanged (FAIL -> FAIL)', () => {
      const appDir = path.join(tempDir, 'app-b');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const before = runReadinessAudit({ projectDir: appDir });
      // Run second audit without fixing anything
      const after = runReadinessAudit({ projectDir: appDir });

      const comp = compareReadinessReports(before, after);

      expect(comp.statusTransition.improved).toBe(false);
      expect(comp.statusTransition.regressed).toBe(false);
      expect(comp.statusTransition.verdict).toBe('NO_MATERIAL_CHANGE');
      expect(comp.resolvedFindings.length).toBe(0);

      const unchangedFailures = comp.unchangedFindings.filter((f: FindingItem) => f.status === 'FAIL');
      expect(unchangedFailures.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario C: detects new defect introduced (regression from clean baseline)', () => {
      const appDir = path.join(tempDir, 'app-c');
      fs.cpSync(path.join(fixturesDir, 'healthy-app'), appDir, { recursive: true });

      const before = runReadinessAudit({ projectDir: appDir });

      // Introduce defect: delete .env.example
      fs.rmSync(path.join(appDir, '.env.example'), { force: true });

      const after = runReadinessAudit({ projectDir: appDir });

      const comp = compareReadinessReports(before, after);

      expect(comp.statusTransition.regressed).toBe(true);
      expect(comp.statusTransition.improved).toBe(false);
      expect(comp.statusTransition.verdict).toBe('REGRESSION_DETECTED');
      expect(comp.regressedFindings.length).toBeGreaterThan(0);

      const regressedEnv = comp.regressedFindings.find((f: FindingItem) => f.id === 'ENV-001');
      expect(regressedEnv).toBeDefined();
      expect(regressedEnv.beforeStatus).toBe('PASS');
      expect(regressedEnv.afterStatus).toBe('FAIL');
    });

    it('Scenario D: check disabled/omitted category classifies missing findings, NOT resolved', () => {
      const appDir = path.join(tempDir, 'app-d');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      // Before: evaluated all categories including env and security
      const before = runReadinessAudit({
        projectDir: appDir,
        categories: ['env', 'security', 'discovery'],
      });

      // After: evaluated ONLY discovery (omitted env and security!)
      const after = runReadinessAudit({
        projectDir: appDir,
        categories: ['discovery'],
      });

      const comp = compareReadinessReports(before, after);

      expect(comp.scopeCompatibility.scopeMismatch).toBe(true);
      expect(comp.scopeCompatibility.missingCategories).toContain('env');
      expect(comp.scopeCompatibility.missingCategories).toContain('security');

      // The missing env failures must NOT be marked resolved!
      expect(comp.resolvedFindings.length).toBe(0);
      expect(comp.missingFindings.length).toBeGreaterThan(0);
      expect(comp.statusTransition.improved).toBe(false);
      expect(comp.statusTransition.verdict).toBe('INDETERMINATE_SCOPE_MISMATCH');
    });

    it('Scenario E: changed application identity prevents false remediation claim', () => {
      const before = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'missing-env'),
      });
      const after = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'healthy-app'),
      });

      // Default: allowCrossProject is false
      const comp = compareReadinessReports(before, after);

      expect(comp.projectIdentity.projectMismatch).toBe(true);
      expect(comp.statusTransition.improved).toBe(false);
      expect(comp.statusTransition.verdict).toBe('INDETERMINATE_PROJECT_MISMATCH');
      expect(comp.statusTransition.indeterminate).toBe(true);

      const md = formatComparisonMarkdown(comp);
      expect(md).toContain('INDETERMINATE (PROJECT MISMATCH)');
    });

    it('Scenario F: allows cross-project comparison when explicit opt-in is granted', () => {
      const before = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'missing-env'),
      });
      const after = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'healthy-app'),
      });

      const comp = compareReadinessReports(before, after, { allowCrossProject: true });

      expect(comp.projectIdentity.projectMismatch).toBe(true);
      expect(comp.projectIdentity.allowCrossProject).toBe(true);
      // With explicit opt-in, it computes deltas without forcing indeterminate verdict
      expect(comp.resolvedFindings.length).toBeGreaterThan(0);
    });

    it('Scenario G: distinguishes distinct finding locations under the same check ID', () => {
      const mockBefore = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'multi-file-app',
        findings: [
          {
            id: 'SEC-001',
            targetPath: '.',
            evidence: { file: 'src/server.ts' },
            status: 'FAIL',
            severity: 'critical',
            title: 'Hardcoded Secret',
          },
          {
            id: 'SEC-001',
            targetPath: '.',
            evidence: { file: 'src/auth.ts' },
            status: 'FAIL',
            severity: 'critical',
            title: 'Hardcoded Secret',
          },
        ],
        summary: { fail: 2, pass: 0, totalChecks: 2 },
      };

      // In after: server.ts is fixed (PASS), but auth.ts remains FAIL
      const mockAfter = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'multi-file-app',
        findings: [
          {
            id: 'SEC-001',
            targetPath: '.',
            evidence: { file: 'src/server.ts' },
            status: 'PASS',
            severity: 'info',
            title: 'No Secrets Found',
          },
          {
            id: 'SEC-001',
            targetPath: '.',
            evidence: { file: 'src/auth.ts' },
            status: 'FAIL',
            severity: 'critical',
            title: 'Hardcoded Secret',
          },
        ],
        summary: { fail: 1, pass: 1, totalChecks: 2 },
      };

      const comp = compareReadinessReports(mockBefore, mockAfter);

      expect(comp.resolvedFindings.length).toBe(1);
      expect(comp.resolvedFindings[0].evidence.file).toBe('src/server.ts');
      expect(comp.unchangedFindings.length).toBe(1);
      expect(comp.unchangedFindings[0].evidence.file).toBe('src/auth.ts');
    });

    it('Scenario H: finding changed from FAIL to NOT_APPLICABLE is classified separately, not resolved', () => {
      const mockBefore = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'service-app',
        findings: [
          {
            id: 'API-001',
            targetPath: '.',
            evidence: { file: 'server.js' },
            status: 'FAIL',
            severity: 'high',
            title: 'Missing CORS Headers',
          },
        ],
        summary: { fail: 1, pass: 0, totalChecks: 1 },
      };

      const mockAfter = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'service-app',
        findings: [
          {
            id: 'API-001',
            targetPath: '.',
            evidence: { file: 'server.js' },
            status: 'NOT_APPLICABLE',
            severity: 'info',
            title: 'CORS Check Not Applicable',
            explanation: 'HTTP server removed from target application.',
          },
        ],
        summary: { fail: 0, pass: 0, notApplicable: 1, totalChecks: 1 },
      };

      const comp = compareReadinessReports(mockBefore, mockAfter);

      // Must NOT be considered resolved
      expect(comp.resolvedFindings.length).toBe(0);
      expect(comp.noLongerApplicableFindings.length).toBe(1);
      expect(comp.noLongerApplicableFindings[0].id).toBe('API-001');
    });

    it('Scenario I: check resulting in NOT_RUN is tracked in notRunFindings', () => {
      const mockBefore = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'service-app',
        findings: [
          {
            id: 'BUILD-002',
            targetPath: '.',
            evidence: { file: 'package.json' },
            status: 'FAIL',
            severity: 'high',
            title: 'Test Script Failed',
          },
        ],
        summary: { fail: 1, pass: 0, totalChecks: 1 },
      };

      const mockAfter = {
        schemaVersion: '1.1.0',
        toolVersion: '1.0.0',
        projectRoot: 'service-app',
        findings: [
          {
            id: 'BUILD-002',
            targetPath: '.',
            evidence: { file: 'package.json' },
            status: 'NOT_RUN',
            severity: 'info',
            title: 'Test Script Skipped (Read-Only Mode)',
          },
        ],
        summary: { fail: 0, pass: 0, notRun: 1, totalChecks: 1 },
      };

      const comp = compareReadinessReports(mockBefore, mockAfter);

      expect(comp.resolvedFindings.length).toBe(0);
      expect(comp.notRunFindings.length).toBe(1);
      expect(comp.notRunFindings[0].id).toBe('BUILD-002');
    });
  });
});
