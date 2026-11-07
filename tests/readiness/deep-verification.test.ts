import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { runReadinessAudit } from '../../tools/readiness/engine/orchestrator.mjs';
import { importSarifReport } from '../../tools/readiness/engine/sarif.mjs';
import { POLICY_OUTCOMES } from '../../tools/readiness/policies/release-policy.mjs';
import { main } from '../../tools/readiness-auditor.mjs';
import { EXIT_CODES } from '../../tools/readiness/constants.mjs';

describe('Phase 4.1: Deep Web, Backend & Database Verification', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

  // ===========================================================================
  // 1. Deep Healthy Backend Verification
  // ===========================================================================
  describe('1. Deep Healthy Backend Assessment (deep-healthy-backend)', () => {
    const projectDir = path.join(fixturesDir, 'deep-healthy-backend');

    it('verifies zero policy blockers on hardened production backend', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.outcome).not.toBe(POLICY_OUTCOMES.BLOCKED);
    });

    it('verifies SQL injection defenses and parameterized queries (DB-004 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const sqliFinding = report.findings.find((f) => f.id === 'DB-004');

      expect(sqliFinding?.status).toBe('PASS');
      expect(sqliFinding?.title).toContain('Parameterized Database Queries Enforced');
    });

    it('verifies foreign key indexing in Prisma schema (DB-005 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const indexFinding = report.findings.find((f) => f.id === 'DB-005');

      expect(indexFinding?.status).toBe('PASS');
      expect(indexFinding?.title).toContain('Database Foreign Key Relations Properly Indexed');
    });

    it('verifies database migration reversibility and rollback planning (DB-002 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const migrationFinding = report.findings.find((f) => f.id === 'DB-002');

      expect(migrationFinding?.status).toBe('PASS');
      expect(migrationFinding?.title).toContain('Rollback Support Present');
    });

    it('verifies secure session and cookie configurations (SEC-004 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const cookieFinding = report.findings.find((f) => f.id === 'SEC-004');

      expect(cookieFinding?.status).toBe('PASS');
      expect(cookieFinding?.title).toContain('Secure Cookie Configuration Enforced');
    });

    it('verifies authentication secrets loaded from environment (SEC-005 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const secretFinding = report.findings.find((f) => f.id === 'SEC-005');

      expect(secretFinding?.status).toBe('PASS');
      expect(secretFinding?.title).toContain('Authentication Secrets Loaded From Environment');
    });

    it('verifies multi-tenant data isolation and tenantId filters (SEC-006 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const tenantFinding = report.findings.find((f) => f.id === 'SEC-006');

      expect(tenantFinding?.status).toBe('PASS');
      expect(tenantFinding?.title).toContain('Multi-Tenant Data Isolation Filters Enforced');
    });

    it('verifies route authorization middleware guardrails (SEC-007 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const authRouteFinding = report.findings.find((f) => f.id === 'SEC-007');

      expect(authRouteFinding?.status).toBe('PASS');
      expect(authRouteFinding?.title).toContain('Route Authorization Middleware Guardrails Enforced');
    });

    it('verifies bounded collection pagination and max limit caps (API-007 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const paginationFinding = report.findings.find((f) => f.id === 'API-007');

      expect(paginationFinding?.status).toBe('PASS');
      expect(paginationFinding?.title).toContain('Collection Pagination Capped by Maximum Bounds');
    });

    it('verifies rate limiting middleware protection (API-008 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const rateLimitFinding = report.findings.find((f) => f.id === 'API-008');

      expect(rateLimitFinding?.status).toBe('PASS');
      expect(rateLimitFinding?.title).toContain('API Rate Limiting Middleware Configured');
    });
  });

  // ===========================================================================
  // 2. Deep Defective Backend Verification
  // ===========================================================================
  describe('2. Deep Defective Backend Assessment (deep-defective-backend)', () => {
    const projectDir = path.join(fixturesDir, 'deep-defective-backend');

    it('evaluates release policy as BLOCKED with multiple critical blockers', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.policyEvaluation.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(report.policyEvaluation.blockerCount).toBeGreaterThanOrEqual(3);
    });

    it('detects raw SQL query interpolation and flags critical failure (DB-004 FAIL)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const sqliFinding = report.findings.find((f) => f.id === 'DB-004');

      expect(sqliFinding?.status).toBe('FAIL');
      expect(sqliFinding?.severity).toBe('critical');
      expect(sqliFinding?.title).toContain('Potential SQL Injection');
      expect(sqliFinding?.evidence?.snippet).toContain('$queryRawUnsafe');
    });

    it('detects insecure cookie flags (httpOnly: false) and flags high failure (SEC-004 FAIL)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const cookieFinding = report.findings.find((f) => f.id === 'SEC-004');

      expect(cookieFinding?.status).toBe('FAIL');
      expect(cookieFinding?.severity).toBe('high');
      expect(cookieFinding?.title).toContain('Insecure Cookie Configuration');
      expect(cookieFinding?.explanation).toContain('httpOnly: false');
    });

    it('detects hardcoded JWT secrets and flags critical failure (SEC-005 FAIL)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const secretFinding = report.findings.find((f) => f.id === 'SEC-005');

      expect(secretFinding?.status).toBe('FAIL');
      expect(secretFinding?.severity).toBe('critical');
      expect(secretFinding?.title).toContain('Hardcoded Authentication Secret Detected');
      expect(secretFinding?.explanation).toContain('jsonwebtoken');
      expect(secretFinding?.evidence?.snippet).toContain('hardcoded_insecure_jwt_secret_123');
    });

    it('detects multi-tenant queries missing tenantId filter (SEC-006 FAIL)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const tenantFinding = report.findings.find((f) => f.id === 'SEC-006');

      expect(tenantFinding?.status).toBe('FAIL');
      expect(tenantFinding?.severity).toBe('high');
      expect(tenantFinding?.title).toContain('Missing Multi-Tenant Isolation Filter');
    });

    it('flags unindexed foreign key relations in schema.prisma (DB-005 WARNING)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const indexFinding = report.findings.find((f) => f.id === 'DB-005');

      expect(indexFinding?.status).toBe('WARNING');
      expect(indexFinding?.severity).toBe('medium');
      expect(indexFinding?.title).toContain('Unindexed Foreign Key Relation');
      expect(indexFinding?.explanation).toContain('customerId');
    });

    it('flags database migrations lacking rollback (down) scripts (DB-002 WARNING)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const migrationFinding = report.findings.find((f) => f.id === 'DB-002');

      expect(migrationFinding?.status).toBe('WARNING');
      expect(migrationFinding?.severity).toBe('medium');
      expect(migrationFinding?.title).toContain('Migrations Lack Rollback (Down) Scripts');
    });

    it('flags unconstrained pagination limit fallbacks (API-007 WARNING)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const paginationFinding = report.findings.find((f) => f.id === 'API-007');

      expect(paginationFinding?.status).toBe('WARNING');
      expect(paginationFinding?.severity).toBe('medium');
      expect(paginationFinding?.title).toContain('Unconstrained Collection Pagination Limit');
    });

    it('flags missing API rate limiting middleware (API-008 WARNING)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const rateLimitFinding = report.findings.find((f) => f.id === 'API-008');

      expect(rateLimitFinding?.status).toBe('WARNING');
      expect(rateLimitFinding?.severity).toBe('medium');
      expect(rateLimitFinding?.title).toContain('No API Rate Limiting Middleware Configured');
    });

    it('flags unprotected administrative mutating endpoints (SEC-007 WARNING)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const authRouteFinding = report.findings.find((f) => f.id === 'SEC-007');

      expect(authRouteFinding?.status).toBe('WARNING');
      expect(authRouteFinding?.severity).toBe('high');
      expect(authRouteFinding?.title).toContain('Administrative Route Lacks Authorization Middleware');
    });
  });

  // ===========================================================================
  // 3. Next.js Deep Frontend Verification
  // ===========================================================================
  describe('3. Next.js Deep Frontend Assessment (nextjs-app)', () => {
    const projectDir = path.join(fixturesDir, 'nextjs-app');

    it('verifies route error boundaries in Next.js App Router (NEXT-009 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const errorBoundaryFinding = report.findings.find((f) => f.id === 'NEXT-009');

      expect(errorBoundaryFinding?.status).toBe('PASS');
      expect(errorBoundaryFinding?.title).toContain('Route Error Boundaries Configured');
      expect(errorBoundaryFinding?.evidence?.file).toContain('app/error.tsx');
    });

    it('verifies automated accessibility testing tooling configured (NEXT-011 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });
      const a11yToolFinding = report.findings.find((f) => f.id === 'NEXT-011');

      expect(a11yToolFinding?.status).toBe('PASS');
      expect(a11yToolFinding?.title).toContain('Automated Frontend Accessibility Testing Configured');
      expect(a11yToolFinding?.explanation).toContain('eslint-plugin-jsx-a11y');
    });
  });

  // ===========================================================================
  // 4. SARIF Static Analysis Results Import
  // ===========================================================================
  describe('4. SARIF Static Analysis Results Import (sarif-importer)', () => {
    const sarifPath = path.join(fixturesDir, 'sarif', 'sample-codeql.sarif.json');
    const healthyProject = path.join(fixturesDir, 'deep-healthy-backend');

    it('imports CodeQL SARIF results and maps levels to EnvGuard findings correctly', () => {
      const findings = importSarifReport(sarifPath, { projectDir: healthyProject });

      expect(findings.length).toBe(3);

      // Error level with security-severity 9.8 maps to FAIL + critical
      const sqliFinding = findings.find((f) => f.id === 'SARIF-js/sql-injection');
      expect(sqliFinding?.status).toBe('FAIL');
      expect(sqliFinding?.severity).toBe('critical');
      expect(sqliFinding?.toolName).toBe('CodeQL');
      expect(sqliFinding?.category).toBe('database');
      expect(sqliFinding?.evidence?.line).toBe(45);
      expect(sqliFinding?.evidence?.snippet).toContain('db.query');

      // Warning level maps to WARNING + medium
      const rateLimitFinding = findings.find((f) => f.id === 'SARIF-js/missing-rate-limiting');
      expect(rateLimitFinding?.status).toBe('WARNING');
      expect(rateLimitFinding?.severity).toBe('medium');
      expect(rateLimitFinding?.category).toBe('api');

      // Note level maps to PASS + info
      const noteFinding = findings.find((f) => f.id === 'SARIF-js/debugger-statement');
      expect(noteFinding?.status).toBe('PASS');
      expect(noteFinding?.severity).toBe('info');
    });

    it('integrates SARIF report via runReadinessAudit({ sarifPath }) and blocks release on critical findings', () => {
      const report = runReadinessAudit({
        projectDir: healthyProject,
        sarifPath,
        allowExec: false,
      });

      // Contains imported SARIF finding
      const sarifFinding = report.findings.find((f) => f.id === 'SARIF-js/sql-injection');
      expect(sarifFinding).toBeDefined();
      expect(sarifFinding?.status).toBe('FAIL');

      // Policy evaluation blocks release due to critical SARIF finding
      expect(report.policyEvaluation.outcome).toBe(POLICY_OUTCOMES.BLOCKED);

      // Limitation disclosed
      expect(report.limitations.some((l) => l.includes('SARIF findings'))).toBe(true);
    });

    it('CLI supports --sarif parameter and exits with POLICY_BLOCKERS on critical SARIF errors', () => {
      const code = main([
        'scan',
        '--project',
        healthyProject,
        '--sarif',
        sarifPath,
      ]);

      expect(code).toBe(EXIT_CODES.POLICY_BLOCKERS);
    });

    it('handles non-existent SARIF path gracefully with ERROR finding without throwing', () => {
      const findings = importSarifReport('non-existent.sarif.json', { projectDir: healthyProject });

      expect(findings.length).toBe(1);
      expect(findings[0].status).toBe('ERROR');
      expect(findings[0].title).toContain('SARIF Report File Not Found');
    });

    it('handles malformed JSON SARIF file gracefully with ERROR finding', () => {
      const tempFile = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'sarif', 'corrupt.sarif');
      fs.writeFileSync(tempFile, '{ malformed json: not valid', 'utf8');

      try {
        const findings = importSarifReport(tempFile, { projectDir: healthyProject });
        expect(findings.length).toBe(1);
        expect(findings[0].status).toBe('ERROR');
        expect(findings[0].title).toContain('Malformed SARIF Report JSON');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });
});
