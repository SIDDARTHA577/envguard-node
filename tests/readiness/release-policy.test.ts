import { describe, it, expect } from 'vitest';
import {
  evaluateReleasePolicy,
  checkWaiver,
  POLICY_OUTCOMES,
  DEFAULT_MANDATORY_CHECKS,
  DEFAULT_BLOCKING_CATEGORIES,
} from '../../tools/readiness-auditor.mjs';

describe('9.4: Release Readiness Policy Hardening & Accurate Gates', () => {
  const cleanSummary = {
    pass: 10,
    fail: 0,
    warning: 2,
    notRun: 0,
    manualReview: 0,
    notApplicable: 1,
    informational: 0,
    totalChecks: 13,
  };

  describe('Policy Outcomes & Defect Blocking', () => {
    it('exports default mandatory checks and blocking categories', () => {
      expect(DEFAULT_MANDATORY_CHECKS).toContain('ENV-001');
      expect(DEFAULT_MANDATORY_CHECKS).toContain('SEC-001');
      expect(DEFAULT_BLOCKING_CATEGORIES).toContain('security');
      expect(DEFAULT_BLOCKING_CATEGORIES).toContain('build_test');
    });

    it('blocks release on critical or high severity FAIL findings', () => {
      const findings = [
        {
          id: 'SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Secret In Code',
        },
      ];
      const summary = { ...cleanSummary, fail: 1 };

      const res = evaluateReleasePolicy(findings, summary);

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.blockerCount).toBe(1);
      expect(res.gates.zeroBlockers).toBe(false);
      expect(res.gates.zeroSecurityFailures).toBe(false);
      expect(res.reasons[0]).toContain('CRITICAL BLOCKER');
    });

    it('blocks release on medium severity failures in security category', () => {
      const findings = [
        {
          id: 'SEC-004',
          category: 'security',
          status: 'FAIL',
          severity: 'medium',
          title: 'Weak Cryptographic Salt',
          explanation: 'Salt length is shorter than recommended 16 bytes.',
        },
      ];
      const summary = { ...cleanSummary, fail: 1 };

      const res = evaluateReleasePolicy(findings, summary);

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.blockerCount).toBe(1);
      expect(res.gates.zeroBlockers).toBe(false);
      expect(res.gates.zeroSecurityFailures).toBe(false);
    });

    it('blocks release on medium severity failures in build_test category', () => {
      const findings = [
        {
          id: 'BUILD-003',
          category: 'build_test',
          status: 'FAIL',
          severity: 'medium',
          title: 'Unit Test Flakiness Detected',
          explanation: 'One or more test suites failed during execution.',
        },
      ];
      const summary = { ...cleanSummary, fail: 1 };

      const res = evaluateReleasePolicy(findings, summary);

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.blockerCount).toBe(1);
      expect(res.gates.zeroBlockers).toBe(false);
    });

    it('blocks release when a mandatory check fails or is NOT_RUN', () => {
      const findings = [
        {
          id: 'ENV-001',
          category: 'env',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Missing Environment Variable Template',
        },
      ];
      const summary = { ...cleanSummary, notRun: 1 };

      const res = evaluateReleasePolicy(findings, summary, {
        mandatoryChecks: ['ENV-001'],
      });

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.gates.mandatoryChecksPassed).toBe(false);
      expect(res.reasons[0]).toContain('Mandatory check "Missing Environment Variable Template" was NOT_RUN');
    });
  });

  describe('Waiver Framework', () => {
    it('downgrades a failing check to active waiver when unexpired waiver exists', () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days in future
      const findings = [
        {
          id: 'SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Test Secret in Fixture',
          explanation: 'Fixture contains dummy key.',
        },
      ];
      const summary = { ...cleanSummary, fail: 1 };
      const waivers = [
        {
          checkId: 'SEC-001',
          reason: 'Dummy key inside test fixture is not a production secret.',
          approver: 'sec-lead@company.com',
          expiresAt: futureDate,
        },
      ];

      const res = evaluateReleasePolicy(findings, summary, { waivers });

      expect(res.outcome).toBe(POLICY_OUTCOMES.READY_FOR_REVIEW);
      expect(res.blockerCount).toBe(0);
      expect(res.waiverRecords.length).toBe(1);
      expect(res.waiverRecords[0].status).toBe('ACTIVE_WAIVER');
      expect(res.waiverRecords[0].approver).toBe('sec-lead@company.com');
    });

    it('rejects expired waivers and keeps the finding as a blocker', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day in past
      const findings = [
        {
          id: 'SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Secret',
          explanation: 'Hardcoded credential found.',
        },
      ];
      const summary = { ...cleanSummary, fail: 1 };
      const waivers = [
        {
          checkId: 'SEC-001',
          reason: 'Temporary waiver for release candidate',
          approver: 'lead-dev',
          expiresAt: pastDate,
        },
      ];

      const res = evaluateReleasePolicy(findings, summary, { waivers });

      expect(res.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(res.blockerCount).toBe(1);
      expect(res.waiverRecords.length).toBe(1);
      expect(res.waiverRecords[0].status).toBe('EXPIRED_WAIVER');
    });

    it('checkWaiver helper accurately validates active vs expired waivers', () => {
      const activeWaiver = {
        checkId: 'ENV-001',
        reason: 'Legacy app',
        expiresAt: new Date(Date.now() + 100000).toISOString(),
      };
      const expiredWaiver = {
        checkId: 'ENV-002',
        reason: 'Old waiver',
        expiresAt: new Date(Date.now() - 100000).toISOString(),
      };

      const res1 = checkWaiver({ id: 'ENV-001' }, [activeWaiver]);
      expect(res1.waived).toBe(true);
      expect(res1.isExpired).toBe(false);

      const res2 = checkWaiver({ id: 'ENV-002' }, [expiredWaiver]);
      expect(res2.waived).toBe(false);
      expect(res2.isExpired).toBe(true);
    });
  });

  describe('Dynamic Verification & Manual Review Handling', () => {
    it('requires dynamic verification when requireDynamicVerification is configured', () => {
      const findings = [
        {
          id: 'ENV-001',
          status: 'PASS',
          category: 'env',
          title: 'Env template valid',
        },
      ];

      const res = evaluateReleasePolicy(findings, cleanSummary, {
        requireDynamicVerification: true,
        allowExec: false,
      });

      expect(res.outcome).toBe(POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT);
      expect(res.gates.testExecutionComplete).toBe(false);
      expect(res.reasons[0]).toContain('--allow-exec');
    });

    it('returns MANUAL_REVIEW_REQUIRED when manual review findings exist', () => {
      const findings = [
        {
          id: 'A11Y-002',
          status: 'MANUAL_REVIEW',
          category: 'accessibility',
          title: 'Manual Screen Reader Test Required',
        },
      ];
      const summary = { ...cleanSummary, manualReview: 1 };

      const res = evaluateReleasePolicy(findings, summary, { allowExec: true });

      expect(res.outcome).toBe(POLICY_OUTCOMES.MANUAL_REVIEW_REQUIRED);
      expect(res.gates.manualReviewsIdentified).toBe(true);
      expect(res.reasons[0]).toContain('requires human engineering sign-off');
    });

    it('never calculates misleading arithmetic percentage scores', () => {
      const findings = [
        {
          id: 'ENV-001',
          status: 'PASS',
          category: 'env',
          title: 'Pass',
        },
      ];
      const res = evaluateReleasePolicy(findings, cleanSummary, { allowExec: true });

      const typedRes = res as unknown as Record<string, unknown>;
      expect(typedRes.score).toBeUndefined();
      expect(typedRes.percentage).toBeUndefined();
      expect(typedRes.grade).toBeUndefined();
      expect(res.outcome).toBe(POLICY_OUTCOMES.READY_FOR_REVIEW);
    });
  });
});
