/**
 * Release Readiness Policy Framework for EnvGuard.
 * Evaluates assessment findings against explicit, reproducible release gates.
 */
export const POLICY_OUTCOMES = {
  READY_FOR_REVIEW: 'READY FOR HUMAN RELEASE REVIEW',
  BLOCKED: 'BLOCKED',
  INCOMPLETE_ASSESSMENT: 'INCOMPLETE ASSESSMENT',
  MANUAL_REVIEW_REQUIRED: 'MANUAL REVIEW REQUIRED',
};

export const DEFAULT_MANDATORY_CHECKS = [
  'ENV-001', // Environment variable documentation
  'SEC-001', // Secrets and sensitive keys scanning
];

export const DEFAULT_BLOCKING_CATEGORIES = [
  'security',
  'build_test',
];

export const DEFAULT_BLOCKING_SEVERITIES = [
  'critical',
  'high',
];

/**
 * Validates whether an active, unexpired waiver applies to a finding.
 *
 * @param {object} finding
 * @param {Array<object>} waivers
 * @param {Date} [now=new Date()]
 * @returns {{ waived: boolean, waiver?: object, isExpired?: boolean }}
 */
export function checkWaiver(finding, waivers = [], now = new Date()) {
  if (!Array.isArray(waivers) || waivers.length === 0) {
    return { waived: false };
  }

  for (const w of waivers) {
    if (!w || !w.checkId) continue;
    if (w.checkId === finding.id || w.checkId === `${finding.id}::${finding.targetPath || '.'}`) {
      // Check expiration
      if (w.expiresAt) {
        const expDate = new Date(w.expiresAt);
        if (!isNaN(expDate.getTime()) && expDate.getTime() <= now.getTime()) {
          return { waived: false, waiver: w, isExpired: true };
        }
      }
      return { waived: true, waiver: w, isExpired: false };
    }
  }

  return { waived: false };
}

/**
 * Evaluates assessment findings and determines policy outcome based on explicit,
 * auditable release gates. Never calculates misleading arithmetic percentage scores.
 *
 * @param {Array<object>} findings
 * @param {object} summary
 * @param {object} [context={}]
 * @param {string[]} [context.mandatoryChecks]
 * @param {string[]} [context.blockingSeverities]
 * @param {boolean} [context.requireDynamicVerification=false]
 * @param {Array<object>} [context.waivers]
 * @param {boolean} [context.allowExec=false]
 * @returns {{ outcome: string, reasons: string[], gates: object, blockerCount: number, warningCount: number, waiverRecords: Array<object> }}
 */
export function evaluateReleasePolicy(findings = [], summary = {}, context = {}) {
  const reasons = [];
  const waiverRecords = [];
  const blockers = [];
  const now = new Date();

  const mandatoryChecks = new Set(context.mandatoryChecks || DEFAULT_MANDATORY_CHECKS);
  const blockingSeverities = new Set(context.blockingSeverities || DEFAULT_BLOCKING_SEVERITIES);
  const blockingCategories = new Set(DEFAULT_BLOCKING_CATEGORIES);
  const requireDynamicVerification = Boolean(context.requireDynamicVerification);
  const allowExec = Boolean(context.allowExec);
  const waivers = Array.isArray(context.waivers) ? context.waivers : [];

  // Track security failures
  let securityFailures = 0;
  let mandatoryFailures = 0;

  // 1. Evaluate Findings
  for (const f of findings) {
    if (f.status === 'FAIL') {
      const { waived, waiver, isExpired } = checkWaiver(f, waivers, now);

      if (waived) {
        waiverRecords.push({
          checkId: f.id,
          title: f.title,
          category: f.category,
          severity: f.severity,
          reason: waiver.reason || 'Approved technical waiver',
          approver: waiver.approver || 'release-engineer',
          expiresAt: waiver.expiresAt || 'none',
          status: 'ACTIVE_WAIVER',
        });
        continue;
      }

      if (isExpired) {
        waiverRecords.push({
          checkId: f.id,
          title: f.title,
          category: f.category,
          severity: f.severity,
          reason: waiver.reason,
          approver: waiver.approver,
          expiresAt: waiver.expiresAt,
          status: 'EXPIRED_WAIVER',
        });
      }

      // Check if this failure is blocking:
      // A failure blocks if:
      // a) It has a blocking severity (critical, high)
      // b) It is in a blocking category (security, build_test) even if medium severity
      // c) It is in the mandatoryChecks list
      const isBlockingSeverity = blockingSeverities.has(f.severity);
      const isBlockingCategory = blockingCategories.has(f.category);
      const isMandatoryCheck = mandatoryChecks.has(f.id);

      if (f.category === 'security') {
        securityFailures++;
      }
      if (isMandatoryCheck) {
        mandatoryFailures++;
      }

      if (isBlockingSeverity || isBlockingCategory || isMandatoryCheck) {
        blockers.push(f);
        const tagParts = [];
        if (f.severity) {
          tagParts.push(`${f.severity.toUpperCase()} BLOCKER`);
        } else {
          tagParts.push('BLOCKER');
        }
        if (isMandatoryCheck) {
          tagParts.push('MANDATORY CHECK');
        }
        const blockerTag = tagParts.join(' / ');
        reasons.push(`[${f.id}] ${f.title} (${blockerTag}): ${f.explanation || 'Check failed'}`);
      }
    }
  }

  // 2. Check Mandatory Checks that might be NOT_RUN
  for (const checkId of mandatoryChecks) {
    const matchingFindings = findings.filter((f) => f.id === checkId);
    for (const f of matchingFindings) {
      if (f.status === 'NOT_RUN') {
        blockers.push(f);
        mandatoryFailures++;
        reasons.push(`[${f.id}] Mandatory check "${f.title}" was NOT_RUN and cannot be verified.`);
      }
    }
  }

  // If blockers exist -> BLOCKED
  if (blockers.length > 0) {
    return {
      outcome: POLICY_OUTCOMES.BLOCKED,
      reasons,
      gates: {
        zeroBlockers: false,
        zeroSecurityFailures: securityFailures === 0,
        mandatoryChecksPassed: mandatoryFailures === 0,
        testExecutionComplete: summary.fail === 0 && (!requireDynamicVerification || allowExec),
        manualReviewsIdentified: (summary.manualReview ?? 0) > 0,
      },
      blockerCount: blockers.length,
      warningCount: summary.warning ?? 0,
      waiverRecords,
    };
  }

  // 3. Check for Incomplete Assessment (Critical dynamic checks NOT_RUN without authorization)
  const dynamicChecksNotRun = findings.filter(
    (f) => f.status === 'NOT_RUN' && (f.id.startsWith('BUILD-') || f.id === 'API-006')
  );

  if ((dynamicChecksNotRun.length > 0 || requireDynamicVerification) && !allowExec) {
    reasons.push(
      'Assessment ran in read-only mode without script execution authorization (--allow-exec). Dynamic build and test execution results could not be verified.'
    );
    return {
      outcome: POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT,
      reasons,
      gates: {
        zeroBlockers: true,
        zeroSecurityFailures: true,
        mandatoryChecksPassed: true,
        testExecutionComplete: false,
        manualReviewsIdentified: (summary.manualReview ?? 0) > 0,
      },
      blockerCount: 0,
      warningCount: summary.warning ?? 0,
      waiverRecords,
    };
  }

  // 4. Check for Manual Review Items
  const manualReviews = findings.filter((f) => f.status === 'MANUAL_REVIEW');
  if (manualReviews.length > 0) {
    for (const m of manualReviews) {
      reasons.push(`[${m.id}] ${m.title} requires human engineering sign-off.`);
    }
    return {
      outcome: POLICY_OUTCOMES.MANUAL_REVIEW_REQUIRED,
      reasons,
      gates: {
        zeroBlockers: true,
        zeroSecurityFailures: true,
        mandatoryChecksPassed: true,
        testExecutionComplete: true,
        manualReviewsIdentified: true,
      },
      blockerCount: 0,
      warningCount: summary.warning ?? 0,
      waiverRecords,
    };
  }

  // 5. All Gates Passed Cleanly
  reasons.push('All applicable automated checks passed with zero blockers.');
  return {
    outcome: POLICY_OUTCOMES.READY_FOR_REVIEW,
    reasons,
    gates: {
      zeroBlockers: true,
      zeroSecurityFailures: true,
      mandatoryChecksPassed: true,
      testExecutionComplete: true,
      manualReviewsIdentified: false,
    },
    blockerCount: 0,
    warningCount: summary.warning ?? 0,
    waiverRecords,
  };
}
