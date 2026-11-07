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

/**
 * Evaluates assessment findings and determines policy outcome.
 * Never calculates misleading arithmetic percentage scores.
 *
 * @param {Array<object>} findings
 * @param {object} summary
 * @param {object} context
 * @returns {{ outcome: string, reasons: string[], gates: object }}
 */
export function evaluateReleasePolicy(findings, summary, context = {}) {
  const reasons = [];

  // 1. Check for Blockers (Critical or High FAIL findings)
  const blockers = findings.filter(
    (f) => f.status === 'FAIL' && (f.severity === 'critical' || f.severity === 'high')
  );

  if (blockers.length > 0) {
    for (const b of blockers) {
      reasons.push(`[${b.id}] ${b.title} (${b.severity.toUpperCase()} BLOCKER)`);
    }
    return {
      outcome: POLICY_OUTCOMES.BLOCKED,
      reasons,
      gates: {
        zeroBlockers: false,
        testExecutionComplete: summary.fail === 0,
        manualReviewsIdentified: summary.manualReview > 0,
      },
      blockerCount: blockers.length,
    };
  }

  // 2. Check for Incomplete Assessment (Critical checks NOT_RUN)
  const criticalNotRun = findings.filter(
    (f) => f.status === 'NOT_RUN' && (f.id.startsWith('BUILD-') || f.id === 'API-006')
  );

  if (criticalNotRun.length > 0 && !context.allowExec) {
    reasons.push(
      `Assessment ran in read-only mode without script execution authorization (--allow-exec). Build and test execution results could not be verified.`
    );
    return {
      outcome: POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT,
      reasons,
      gates: {
        zeroBlockers: true,
        testExecutionComplete: false,
        manualReviewsIdentified: summary.manualReview > 0,
      },
      blockerCount: 0,
    };
  }

  // 3. Check for Manual Review Items
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
        testExecutionComplete: true,
        manualReviewsIdentified: true,
      },
      blockerCount: 0,
    };
  }

  // 4. All Gates Passed
  reasons.push('All applicable automated checks passed with zero blockers.');
  return {
    outcome: POLICY_OUTCOMES.READY_FOR_REVIEW,
    reasons,
    gates: {
      zeroBlockers: true,
      testExecutionComplete: true,
      manualReviewsIdentified: false,
    },
    blockerCount: 0,
  };
}
