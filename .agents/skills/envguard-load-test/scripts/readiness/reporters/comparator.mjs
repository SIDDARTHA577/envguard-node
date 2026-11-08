import { escapeMarkdown } from '../constants.mjs';

/**
 * Compares two EnvGuard readiness assessment reports to evaluate remediation,
 * detect regressions, and track release gate status transitions.
 *
 * @param {object} beforeReport - Baseline readiness report object
 * @param {object} afterReport - Follow-up readiness report object
 * @returns {object} Structured comparison result
 */
export function compareReadinessReports(beforeReport, afterReport) {
  if (!beforeReport || typeof beforeReport !== 'object') {
    throw new Error('Invalid comparison input: beforeReport must be a valid report object.');
  }
  if (!afterReport || typeof afterReport !== 'object') {
    throw new Error('Invalid comparison input: afterReport must be a valid report object.');
  }

  const beforeFindings = Array.isArray(beforeReport.findings) ? beforeReport.findings : [];
  const afterFindings = Array.isArray(afterReport.findings) ? afterReport.findings : [];

  const getFindingKey = (f) => `${f.id}::${f.targetPath || '.'}`;

  const beforeMap = new Map();
  for (const f of beforeFindings) {
    beforeMap.set(getFindingKey(f), f);
  }

  const afterMap = new Map();
  for (const f of afterFindings) {
    afterMap.set(getFindingKey(f), f);
  }

  const resolvedFindings = [];
  const regressedFindings = [];
  const newFindings = [];
  const unchangedFindings = [];

  // Inspect findings from before report
  for (const [key, b] of beforeMap.entries()) {
    const a = afterMap.get(key);
    if (!a) {
      if (b.status === 'FAIL' || b.status === 'WARNING') {
        resolvedFindings.push({
          id: b.id,
          title: b.title,
          category: b.category,
          targetPath: b.targetPath,
          beforeStatus: b.status,
          afterStatus: 'RESOLVED',
          severity: b.severity,
          explanation: b.explanation,
        });
      }
    } else if (a.status === b.status) {
      unchangedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        status: a.status,
        severity: a.severity,
      });
    } else if ((b.status === 'FAIL' || b.status === 'WARNING') && (a.status === 'PASS' || a.status === 'NOT_APPLICABLE')) {
      resolvedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        afterStatus: a.status,
        severity: b.severity,
        explanation: a.explanation,
      });
    } else if (b.status === 'PASS' && (a.status === 'FAIL' || a.status === 'WARNING')) {
      regressedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        afterStatus: a.status,
        severity: a.severity,
        explanation: a.explanation,
        recommendation: a.recommendation,
      });
    }
  }

  // Inspect findings in after report that were not in before report
  for (const [key, a] of afterMap.entries()) {
    if (!beforeMap.has(key)) {
      if (a.status === 'FAIL' || a.status === 'WARNING') {
        newFindings.push({
          id: a.id,
          title: a.title,
          category: a.category,
          targetPath: a.targetPath,
          status: a.status,
          severity: a.severity,
          explanation: a.explanation,
          recommendation: a.recommendation,
        });
      }
    }
  }

  const beforeSummary = beforeReport.summary || {
    pass: 0,
    fail: 0,
    warning: 0,
    notRun: 0,
    manualReview: 0,
    informational: 0,
    totalChecks: 0,
  };

  const afterSummary = afterReport.summary || {
    pass: 0,
    fail: 0,
    warning: 0,
    notRun: 0,
    manualReview: 0,
    informational: 0,
    totalChecks: 0,
  };

  const summaryDelta = {
    pass: (afterSummary.pass ?? 0) - (beforeSummary.pass ?? 0),
    fail: (afterSummary.fail ?? 0) - (beforeSummary.fail ?? 0),
    warning: (afterSummary.warning ?? 0) - (beforeSummary.warning ?? 0),
    notRun: (afterSummary.notRun ?? 0) - (beforeSummary.notRun ?? 0),
    manualReview: (afterSummary.manualReview ?? 0) - (beforeSummary.manualReview ?? 0),
    informational: (afterSummary.informational ?? 0) - (beforeSummary.informational ?? 0),
    totalChecks: (afterSummary.totalChecks ?? 0) - (beforeSummary.totalChecks ?? 0),
  };

  const beforeOutcome = beforeReport.policyEvaluation?.outcome || 'UNKNOWN';
  const afterOutcome = afterReport.policyEvaluation?.outcome || 'UNKNOWN';

  const isImproved =
    (summaryDelta.fail < 0 && regressedFindings.length === 0) ||
    (beforeOutcome === 'BLOCKED' && afterOutcome !== 'BLOCKED');

  const isRegressed =
    regressedFindings.length > 0 ||
    summaryDelta.fail > 0 ||
    (beforeOutcome !== 'BLOCKED' && afterOutcome === 'BLOCKED');

  return {
    timestamp: new Date().toISOString(),
    before: {
      projectRoot: beforeReport.projectRoot || 'unknown',
      gitCommit: beforeReport.gitCommit || 'unknown',
      timestamp: beforeReport.timestamp || 'unknown',
      policyOutcome: beforeOutcome,
      summary: beforeSummary,
    },
    after: {
      projectRoot: afterReport.projectRoot || 'unknown',
      gitCommit: afterReport.gitCommit || 'unknown',
      timestamp: afterReport.timestamp || 'unknown',
      policyOutcome: afterOutcome,
      summary: afterSummary,
    },
    statusTransition: {
      from: beforeOutcome,
      to: afterOutcome,
      improved: isImproved,
      regressed: isRegressed,
    },
    summaryDelta,
    resolvedFindings,
    regressedFindings,
    newFindings,
    unchangedFindings,
  };
}

/**
 * Formats report comparison results into clean Markdown.
 *
 * @param {object} comparison
 * @returns {string} Markdown string
 */
export function formatComparisonMarkdown(comparison) {
  const { before, after, statusTransition, summaryDelta, resolvedFindings, regressedFindings, newFindings } = comparison;

  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  let md = `# EnvGuard Production Readiness Verification & Comparison Report\n\n`;
  md += `**Before Assessment**: \`${escapeMarkdown(before.projectRoot)}\` (${before.timestamp}) — Outcome: \`${before.policyOutcome}\`  \n`;
  md += `**After Assessment**: \`${escapeMarkdown(after.projectRoot)}\` (${after.timestamp}) — Outcome: \`${after.policyOutcome}\`  \n`;
  md += `**Release Gate Transition**: \`${statusTransition.from}\` -> \`${statusTransition.to}\`  \n`;
  if (statusTransition.improved) {
    md += `**Evaluation Verdict**: :white_check_mark: **IMPROVED** (Defects remediated with zero regressions)\n\n`;
  } else if (statusTransition.regressed) {
    md += `**Evaluation Verdict**: :x: **REGRESSION DETECTED** (New failures or regressed checks require attention)\n\n`;
  } else {
    md += `**Evaluation Verdict**: :arrows_counterclockwise: **NO MATERIAL CHANGE**\n\n`;
  }

  // Summary Table
  md += `## 1. Summary of Assessment Deltas\n\n`;
  md += `| Check Metric | Baseline (Before) | Follow-Up (After) | Delta |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  md += `| **Verified Passing (PASS)** | ${before.summary.pass} | ${after.summary.pass} | **${sign(summaryDelta.pass)}** |\n`;
  md += `| **Blocking Failures (FAIL)** | ${before.summary.fail} | ${after.summary.fail} | **${sign(summaryDelta.fail)}** |\n`;
  md += `| **Warnings & Risks (WARNING)** | ${before.summary.warning} | ${after.summary.warning} | **${sign(summaryDelta.warning)}** |\n`;
  md += `| **Unexecuted Checks (NOT_RUN)** | ${before.summary.notRun} | ${after.summary.notRun} | **${sign(summaryDelta.notRun)}** |\n`;
  md += `| **Manual Review Required** | ${before.summary.manualReview} | ${after.summary.manualReview} | **${sign(summaryDelta.manualReview)}** |\n`;
  md += `| **Informational Diagnostics** | ${before.summary.informational ?? 0} | ${after.summary.informational ?? 0} | **${sign(summaryDelta.informational)}** |\n`;
  md += `| **Total Evaluated Checks** | ${before.summary.totalChecks} | ${after.summary.totalChecks} | **${sign(summaryDelta.totalChecks)}** |\n\n`;

  // Resolved Findings
  md += `## 2. Remediated & Resolved Findings (${resolvedFindings.length})\n\n`;
  if (resolvedFindings.length === 0) {
    md += `No previously open findings were resolved in this assessment cycle.\n\n`;
  } else {
    for (const r of resolvedFindings) {
      md += `- :white_check_mark: **[${r.id}] ${escapeMarkdown(r.title)}**: Remediated from \`${r.beforeStatus}\` -> \`${r.afterStatus}\` (${r.explanation || 'Verified passed'})\n`;
    }
    md += `\n`;
  }

  // Regressions
  if (regressedFindings.length > 0) {
    md += `## 3. Regressions Detected (${regressedFindings.length})\n\n`;
    for (const reg of regressedFindings) {
      md += `### :x: [${reg.id}] ${escapeMarkdown(reg.title)} (REGRESSION)\n`;
      md += `- **Transition**: Was \`${reg.beforeStatus}\`, now \`${reg.afterStatus}\` (\`${reg.severity?.toUpperCase() || 'HIGH'}\`)\n`;
      md += `- **Explanation**: ${escapeMarkdown(reg.explanation)}\n`;
      if (reg.recommendation) {
        md += `- **Remediation Action**: ${escapeMarkdown(reg.recommendation)}\n`;
      }
      md += `\n`;
    }
  }

  // New Findings
  if (newFindings.length > 0) {
    md += `## 4. New Findings Discovered (${newFindings.length})\n\n`;
    for (const nf of newFindings) {
      md += `### [${nf.id}] ${escapeMarkdown(nf.title)} (${nf.status})\n`;
      md += `- **Severity**: \`${nf.severity?.toUpperCase() || 'HIGH'}\`\n`;
      md += `- **Explanation**: ${escapeMarkdown(nf.explanation)}\n`;
      if (nf.recommendation) {
        md += `- **Remediation Action**: ${escapeMarkdown(nf.recommendation)}\n`;
      }
      md += `\n`;
    }
  }

  // Next Steps
  md += `## 5. Next Verification Steps\n\n`;
  if (after.policyOutcome === 'READY FOR HUMAN RELEASE REVIEW') {
    md += `All automated policy blockers are fully resolved. Submit this verification report to the lead release engineer or maintainer for final deployment sign-off.\n`;
  } else if (after.policyOutcome === 'BLOCKED') {
    md += `Assessment remains **BLOCKED**. Address all remaining P0 blocking failures before scheduling production rollout.\n`;
  } else {
    md += `Assessment outcome is \`${after.policyOutcome}\`. Complete remaining manual reviews or run authorized tests (--allow-exec) to finalize production evaluation.\n`;
  }

  return md;
}
