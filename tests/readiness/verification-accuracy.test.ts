import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReadinessAudit } from '../../tools/readiness/engine/orchestrator.mjs';
import { importSarifReport } from '../../tools/readiness/engine/sarif.mjs';
import { POLICY_OUTCOMES } from '../../tools/readiness/policies/release-policy.mjs';
import { REPORT_SCHEMA_VERSION } from '../../tools/readiness/constants.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

describe('Phase 4.1.1 — Verification Accuracy Hardening', () => {
  // ===========================================================================
  // 1. OASIS SARIF v2.1.0 Semantics & Collision Resistance
  // ===========================================================================
  describe('1. SARIF v2.1.0 Kind & Level Semantics', () => {
    const sarifFixture = path.join(fixturesDir, 'accuracy', 'sarif', 'full-spectrum.sarif.json');

    it('accurately parses kind: pass as PASS status with info severity', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const passFinding = findings.find((f) => f.checkId === 'RULE-PASS-01');

      expect(passFinding).toBeDefined();
      expect(passFinding?.status).toBe('PASS');
      expect(passFinding?.severity).toBe('info');
      expect(passFinding?.sarifKind).toBe('pass');
    });

    it('maps kind: fail with level: error and CVSS >= 9.0 to FAIL critical', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const errFinding = findings.find((f) => f.checkId === 'RULE-FAIL-ERR-01');

      expect(errFinding).toBeDefined();
      expect(errFinding?.status).toBe('FAIL');
      expect(errFinding?.severity).toBe('critical');
      expect(errFinding?.sarifKind).toBe('fail');
    });

    it('maps kind: fail with level: warning to WARNING status', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const warnFinding = findings.find((f) => f.checkId === 'RULE-FAIL-WARN-01');

      expect(warnFinding).toBeDefined();
      expect(warnFinding?.status).toBe('WARNING');
      expect(warnFinding?.severity).toBe('medium');
    });

    it('NEVER converts level: note or kind: informational into false PASS claims', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });

      // level: note must be INFORMATIONAL
      const noteFinding = findings.find((f) => f.checkId === 'RULE-FAIL-NOTE-01');
      expect(noteFinding).toBeDefined();
      expect(noteFinding?.status).toBe('INFORMATIONAL');
      expect(noteFinding?.status).not.toBe('PASS');
      expect(noteFinding?.severity).toBe('info');

      // kind: informational must be INFORMATIONAL
      const infoFinding = findings.find((f) => f.checkId === 'RULE-INFO-01');
      expect(infoFinding).toBeDefined();
      expect(infoFinding?.status).toBe('INFORMATIONAL');
      expect(infoFinding?.status).not.toBe('PASS');
    });

    it('maps kind: review and kind: open to MANUAL_REVIEW with verification requirement', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const reviewFinding = findings.find((f) => f.checkId === 'RULE-REVIEW-01');

      expect(reviewFinding).toBeDefined();
      expect(reviewFinding?.status).toBe('MANUAL_REVIEW');
      expect(reviewFinding?.manualVerificationRequired).toBe(true);
      expect(reviewFinding?.confidence).toBe('unverified');
    });

    it('maps kind: notApplicable to NOT_APPLICABLE status', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const naFinding = findings.find((f) => f.checkId === 'RULE-NA-01');

      expect(naFinding).toBeDefined();
      expect(naFinding?.status).toBe('NOT_APPLICABLE');
    });

    it('provides collision-free stable IDs for identical ruleIds across different locations', () => {
      const findings = importSarifReport(sarifFixture, { projectDir: rootDir });
      const duplicateRuleFindings = findings.filter((f) => f.checkId === 'RULE-COLLISION-01');

      expect(duplicateRuleFindings.length).toBe(2);
      expect(duplicateRuleFindings[0].id).not.toBe(duplicateRuleFindings[1].id);
      expect(duplicateRuleFindings[0].evidence?.file).toBe('src/fileA.ts');
      expect(duplicateRuleFindings[1].evidence?.file).toBe('src/fileB.ts');
    });

    it('detects incomplete scanner execution and generates ERROR finding', () => {
      const failedSarif = path.join(fixturesDir, 'accuracy', 'sarif', 'incomplete-execution.sarif.json');
      const findings = importSarifReport(failedSarif, { projectDir: rootDir });

      const failureFinding = findings.find((f) => f.id.startsWith('SARIF-INVOCATION-FAILURE'));
      expect(failureFinding).toBeDefined();
      expect(failureFinding?.status).toBe('ERROR');
      expect(failureFinding?.severity).toBe('high');
      expect(failureFinding?.explanation).toContain('not successful');
    });
  });

  // ===========================================================================
  // 2. Database Composite Foreign Key Indexing (DB-005)
  // ===========================================================================
  describe('2. Composite Foreign Key Indexing (DB-005)', () => {
    const compositeProject = path.join(fixturesDir, 'accuracy', 'composite-indexing');

    it('recognizes composite index with foreign key as leftmost prefix, while flagging non-leftmost as WARNING', () => {
      const report = runReadinessAudit({ projectDir: compositeProject, allowExec: false });
      const indexFinding = report.findings.find((f) => f.id === 'DB-005');

      expect(indexFinding).toBeDefined();
      // Project model has @@index([createdAt, organizationId]) which does not index organizationId leftmost
      expect(indexFinding?.status).toBe('WARNING');
      expect(indexFinding?.title).toContain('Unindexed Foreign Key Relation');
      expect(indexFinding?.explanation).toContain('Project');
      expect(indexFinding?.explanation).toContain('organizationId');
    });
  });

  // ===========================================================================
  // 3. Dynamic SQL & Entropy-Unverified JWT (DB-004 & SEC-005)
  // ===========================================================================
  describe('3. Dynamic SQL & Unverified JWT Entropy (DB-004, SEC-004, SEC-005)', () => {
    const dynamicProject = path.join(fixturesDir, 'accuracy', 'dynamic-sql-jwt');

    it('marks dynamic SQL variable as MANUAL_REVIEW rather than false PASS', () => {
      const report = runReadinessAudit({ projectDir: dynamicProject, allowExec: false });
      const sqliFinding = report.findings.find((f) => f.id === 'DB-004');

      expect(sqliFinding).toBeDefined();
      expect(sqliFinding?.status).toBe('MANUAL_REVIEW');
      expect(sqliFinding?.title).toContain('Dynamic SQL Query Variable');
      expect(sqliFinding?.manualVerificationRequired).toBe(true);
    });

    it('marks JWT loaded without startup length check as MANUAL_REVIEW entropy unverified', () => {
      const report = runReadinessAudit({ projectDir: dynamicProject, allowExec: false });
      const jwtFinding = report.findings.find((f) => f.id === 'SEC-005');

      expect(jwtFinding).toBeDefined();
      expect(jwtFinding?.status).toBe('MANUAL_REVIEW');
      expect(jwtFinding?.title).toContain('Authentication Secret Entropy Unverified');
      expect(jwtFinding?.manualVerificationRequired).toBe(true);
    });

    it('marks dynamic cookie call as MANUAL_REVIEW when static options cannot be proved', () => {
      const report = runReadinessAudit({ projectDir: dynamicProject, allowExec: false });
      const cookieFinding = report.findings.find((f) => f.id === 'SEC-004');

      expect(cookieFinding).toBeDefined();
      expect(cookieFinding?.status).toBe('MANUAL_REVIEW');
      expect(cookieFinding?.title).toContain('Session Cookie Security Flags Require Verification');
    });
  });

  // ===========================================================================
  // 4. Report Schema v1.1.0 & Release Policy Integration
  // ===========================================================================
  describe('4. Report Schema v1.1.0 & Release Policy Gates', () => {
    it('sets schemaVersion to 1.1.0 and calculates summary.informational accurately', () => {
      const sarifFixture = path.join(fixturesDir, 'accuracy', 'sarif', 'full-spectrum.sarif.json');
      const healthyProject = path.join(fixturesDir, 'deep-healthy-backend');

      const report = runReadinessAudit({
        projectDir: healthyProject,
        sarifPath: sarifFixture,
        allowExec: false,
      });

      expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
      expect(report.schemaVersion).toBe('1.1.0');
      expect(report.summary.informational).toBeGreaterThanOrEqual(2);
      expect(report.summary.informational).toBe(
        report.findings.filter((f) => f.status === 'INFORMATIONAL').length
      );
    });

    it('ensures INFORMATIONAL findings do not inflate PASS count or block releases', () => {
      const healthyProject = path.join(fixturesDir, 'deep-healthy-backend');
      const report = runReadinessAudit({ projectDir: healthyProject, allowExec: false });

      // Healthy backend has 0 FAIL
      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.outcome).not.toBe(POLICY_OUTCOMES.BLOCKED);
    });
  });
});
