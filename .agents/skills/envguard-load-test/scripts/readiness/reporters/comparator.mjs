import { escapeMarkdown } from '../constants.mjs';

/**
 * Validates readiness report schema structure and required fields.
 *
 * @param {object} report - Assessment report candidate
 * @param {string} [label='Report'] - Label for error diagnostics
 */
export function validateReportSchema(report, label = 'Report') {
  if (!report || typeof report !== 'object') {
    throw new Error(`Invalid comparison input: ${label} must be a valid report object.`);
  }

  const requiredFields = ['schemaVersion', 'toolVersion', 'projectRoot', 'findings', 'summary'];
  for (const field of requiredFields) {
    if (report[field] === undefined || report[field] === null) {
      throw new Error(`Invalid comparison input: ${label} is missing required field "${field}".`);
    }
  }

  if (typeof report.schemaVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(report.schemaVersion)) {
    throw new Error(
      `Invalid comparison input: ${label} has incompatible schemaVersion "${report.schemaVersion}". Expected semver (e.g. 1.0.0, 1.1.0).`
    );
  }

  if (!Array.isArray(report.findings)) {
    throw new Error(`Invalid comparison input: ${label} "findings" must be an array.`);
  }

  if (typeof report.summary !== 'object' || Array.isArray(report.summary)) {
    throw new Error(`Invalid comparison input: ${label} "summary" must be an object.`);
  }
}

/**
 * Generates a unique, location-aware finding identity key.
 * Accommodates check ID, target workspace path, and relative evidence file.
 *
 * @param {object} finding
 * @returns {string} Unique finding key
 */
export function getFindingKey(finding) {
  const target = finding.targetPath || '.';
  if (finding.id?.startsWith('ARCH-') || finding.category === 'architecture') {
    return `${finding.id}::${target}`;
  }
  const file = finding.evidence?.file || '';
  return `${finding.id}::${target}::${file}`;
}

/**
 * Compares two EnvGuard readiness assessment reports to evaluate remediation,
 * detect regressions, track release gate status transitions, and enforce
 * project identity and scope compatibility.
 *
 * @param {object} beforeReport - Baseline readiness report object
 * @param {object} afterReport - Follow-up readiness report object
 * @param {object} [options={}] - Comparison options
 * @param {boolean} [options.allowCrossProject=false] - Whether to allow cross-project comparisons
 * @returns {object} Structured comparison result
 */
export function compareReadinessReports(beforeReport, afterReport, options = {}) {
  // 1. Schema Validation
  validateReportSchema(beforeReport, 'beforeReport');
  validateReportSchema(afterReport, 'afterReport');

  const { allowCrossProject = false } = options;

  // 2. Project Identity Verification
  const beforeProject = beforeReport.projectRoot || 'unknown';
  const afterProject = afterReport.projectRoot || 'unknown';
  const isProjectMismatched = beforeProject !== afterProject;

  // 3. Assessment Scope Compatibility Verification
  const beforeCategories = new Set(beforeReport.configuration?.categories || []);
  const afterCategories = new Set(afterReport.configuration?.categories || []);
  const missingCategories = [...beforeCategories].filter((c) => !afterCategories.has(c));
  const isScopeMismatched = missingCategories.length > 0;

  // 4. Source Revision & Tool Version Tracking
  const beforeCommit = beforeReport.gitCommit || 'unknown';
  const afterCommit = afterReport.gitCommit || 'unknown';
  const isSameCommit = beforeCommit !== 'unknown' && beforeCommit === afterCommit;
  const toolVersionChanged = beforeReport.toolVersion !== afterReport.toolVersion;

  // 5. Index Findings
  const beforeFindings = Array.isArray(beforeReport.findings) ? beforeReport.findings : [];
  const afterFindings = Array.isArray(afterReport.findings) ? afterReport.findings : [];

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
  const missingFindings = [];
  const notRunFindings = [];
  const noLongerApplicableFindings = [];
  const indeterminateFindings = [];

  // 6. Inspect baseline findings against follow-up findings
  for (const [key, b] of beforeMap.entries()) {
    const a = afterMap.get(key);

    if (!a) {
      // Finding disappeared from follow-up report
      if (b.status === 'FAIL' || b.status === 'WARNING') {
        const categoryOmitted = missingCategories.includes(b.category);
        const record = {
          id: b.id,
          title: b.title,
          category: b.category,
          targetPath: b.targetPath,
          beforeStatus: b.status,
          severity: b.severity,
          explanation: b.explanation,
          evidence: b.evidence,
          reason: categoryOmitted
            ? `Category "${b.category}" was omitted from follow-up scan configuration.`
            : 'Check was not evaluated or omitted in follow-up assessment.',
        };

        missingFindings.push(record);
        if (isProjectMismatched && !allowCrossProject) {
          indeterminateFindings.push({
            ...record,
            indeterminateReason: 'Project identity mismatch prevents verification of disappeared finding.',
          });
        }
      }
    } else if (a.status === b.status) {
      unchangedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        status: a.status,
        severity: a.severity,
        evidence: a.evidence,
      });
    } else if ((b.status === 'FAIL' || b.status === 'WARNING') && a.status === 'PASS') {
      // Confirmed Remediation
      resolvedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        afterStatus: a.status,
        severity: b.severity,
        explanation: a.explanation || 'Verified passed in follow-up assessment.',
        evidence: a.evidence,
      });
    } else if ((b.status === 'FAIL' || b.status === 'WARNING') && a.status === 'NOT_APPLICABLE') {
      // Classified as no longer applicable (NOT resolved)
      noLongerApplicableFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        afterStatus: a.status,
        severity: b.severity,
        explanation:
          a.explanation ||
          'Check condition is no longer applicable (e.g. dependency or component removed). Direct code remediation unverified.',
        evidence: a.evidence,
      });
    } else if ((b.status === 'FAIL' || b.status === 'NOT_RUN') && a.status === 'NOT_RUN') {
      notRunFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        afterStatus: a.status,
        severity: b.severity,
        explanation: a.explanation || 'Follow-up check was not executed (e.g. requires --allow-exec).',
        evidence: a.evidence,
      });
    } else if (
      (b.status === 'PASS' && (a.status === 'FAIL' || a.status === 'WARNING')) ||
      (b.status === 'WARNING' && a.status === 'FAIL')
    ) {
      // Regression
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
        evidence: a.evidence,
      });
    } else {
      // Other status transitions
      unchangedFindings.push({
        id: a.id,
        title: a.title,
        category: a.category,
        targetPath: a.targetPath,
        beforeStatus: b.status,
        status: a.status,
        severity: a.severity,
        evidence: a.evidence,
      });
    }
  }

  // 7. Inspect new findings in follow-up report
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
          evidence: a.evidence,
        });
      }
    }
  }

  // 8. Summary statistics & Deltas
  const beforeSummary = beforeReport.summary || {
    pass: 0,
    fail: 0,
    warning: 0,
    notRun: 0,
    manualReview: 0,
    notApplicable: 0,
    informational: 0,
    totalChecks: 0,
  };

  const afterSummary = afterReport.summary || {
    pass: 0,
    fail: 0,
    warning: 0,
    notRun: 0,
    manualReview: 0,
    notApplicable: 0,
    informational: 0,
    totalChecks: 0,
  };

  const summaryDelta = {
    pass: (afterSummary.pass ?? 0) - (beforeSummary.pass ?? 0),
    fail: (afterSummary.fail ?? 0) - (beforeSummary.fail ?? 0),
    warning: (afterSummary.warning ?? 0) - (beforeSummary.warning ?? 0),
    notRun: (afterSummary.notRun ?? 0) - (beforeSummary.notRun ?? 0),
    manualReview: (afterSummary.manualReview ?? 0) - (beforeSummary.manualReview ?? 0),
    notApplicable: (afterSummary.notApplicable ?? 0) - (beforeSummary.notApplicable ?? 0),
    informational: (afterSummary.informational ?? 0) - (beforeSummary.informational ?? 0),
    totalChecks: (afterSummary.totalChecks ?? 0) - (beforeSummary.totalChecks ?? 0),
  };

  const beforeOutcome = beforeReport.policyEvaluation?.outcome || 'UNKNOWN';
  const afterOutcome = afterReport.policyEvaluation?.outcome || 'UNKNOWN';

  // 9. Status Transition Evaluation
  const isRegressed =
    regressedFindings.length > 0 ||
    newFindings.some((f) => f.status === 'FAIL') ||
    summaryDelta.fail > 0 ||
    (beforeOutcome !== 'BLOCKED' && afterOutcome === 'BLOCKED');

  const isScopeBlocked = isScopeMismatched && missingFindings.length > 0;
  const isProjectBlocked = isProjectMismatched && !allowCrossProject;

  const isImproved =
    !isProjectBlocked &&
    !isScopeBlocked &&
    !isRegressed &&
    resolvedFindings.length > 0 &&
    missingFindings.length === 0 &&
    afterOutcome !== 'BLOCKED';

  let verdict = 'NO_MATERIAL_CHANGE';
  if (isProjectBlocked) {
    verdict = 'INDETERMINATE_PROJECT_MISMATCH';
  } else if (isScopeBlocked) {
    verdict = 'INDETERMINATE_SCOPE_MISMATCH';
  } else if (isRegressed) {
    verdict = 'REGRESSION_DETECTED';
  } else if (isImproved) {
    verdict = 'IMPROVED';
  }

  return {
    timestamp: new Date().toISOString(),
    projectIdentity: {
      beforeProject,
      afterProject,
      projectMismatch: isProjectMismatched,
      allowCrossProject,
    },
    scopeCompatibility: {
      scopeMismatch: isScopeMismatched,
      missingCategories,
      beforeCategories: Array.from(beforeCategories),
      afterCategories: Array.from(afterCategories),
    },
    sourceRevision: {
      beforeCommit,
      afterCommit,
      isSameCommit,
      toolVersionChanged,
      beforeToolVersion: beforeReport.toolVersion,
      afterToolVersion: afterReport.toolVersion,
    },
    before: {
      projectRoot: beforeProject,
      gitCommit: beforeCommit,
      toolVersion: beforeReport.toolVersion,
      schemaVersion: beforeReport.schemaVersion,
      timestamp: beforeReport.timestamp || 'unknown',
      policyOutcome: beforeOutcome,
      summary: beforeSummary,
      configuration: beforeReport.configuration || {},
    },
    after: {
      projectRoot: afterProject,
      gitCommit: afterCommit,
      toolVersion: afterReport.toolVersion,
      schemaVersion: afterReport.schemaVersion,
      timestamp: afterReport.timestamp || 'unknown',
      policyOutcome: afterOutcome,
      summary: afterSummary,
      configuration: afterReport.configuration || {},
    },
    statusTransition: {
      from: beforeOutcome,
      to: afterOutcome,
      verdict,
      improved: isImproved,
      regressed: isRegressed,
      indeterminate: isProjectBlocked || isScopeBlocked,
    },
    summaryDelta,
    resolvedFindings,
    regressedFindings,
    newFindings,
    unchangedFindings,
    missingFindings,
    notRunFindings,
    noLongerApplicableFindings,
    indeterminateFindings,
  };
}

/**
 * Formats report comparison results into clean, comprehensive Markdown.
 *
 * @param {object} comparison
 * @returns {string} Markdown string
 */
export function formatComparisonMarkdown(comparison) {
  const {
    projectIdentity,
    scopeCompatibility,
    sourceRevision,
    before,
    after,
    statusTransition,
    summaryDelta,
    resolvedFindings,
    regressedFindings,
    newFindings,
    missingFindings,
    noLongerApplicableFindings,
    notRunFindings,
  } = comparison;

  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  let md = `# EnvGuard Production Readiness Verification & Comparison Report\n\n`;
  md += `**Before Assessment**: \`${escapeMarkdown(before.projectRoot)}\` (${before.timestamp}) — Outcome: \`${before.policyOutcome}\` (Commit: \`${escapeMarkdown(before.gitCommit)}\`)  \n`;
  md += `**After Assessment**: \`${escapeMarkdown(after.projectRoot)}\` (${after.timestamp}) — Outcome: \`${after.policyOutcome}\` (Commit: \`${escapeMarkdown(after.gitCommit)}\`)  \n`;
  md += `**Release Gate Transition**: \`${statusTransition.from}\` -> \`${statusTransition.to}\`  \n`;

  // Verdict Banner
  if (statusTransition.verdict === 'IMPROVED') {
    md += `**Evaluation Verdict**: :white_check_mark: **IMPROVED** (Defects remediated with zero regressions)\n\n`;
  } else if (statusTransition.verdict === 'REGRESSION_DETECTED') {
    md += `**Evaluation Verdict**: :x: **REGRESSION DETECTED** (New failures or regressed checks require attention)\n\n`;
  } else if (statusTransition.verdict === 'INDETERMINATE_PROJECT_MISMATCH') {
    md += `**Evaluation Verdict**: :warning: **INDETERMINATE (PROJECT MISMATCH)** (Baseline and follow-up evaluated different project roots: \`${escapeMarkdown(before.projectRoot)}\` vs \`${escapeMarkdown(after.projectRoot)}\`)\n\n`;
  } else if (statusTransition.verdict === 'INDETERMINATE_SCOPE_MISMATCH') {
    md += `**Evaluation Verdict**: :warning: **INDETERMINATE (SCOPE MISMATCH)** (Categories omitted in follow-up: \`${scopeCompatibility.missingCategories.join(', ')}\`)\n\n`;
  } else {
    md += `**Evaluation Verdict**: :arrows_counterclockwise: **NO MATERIAL CHANGE**\n\n`;
  }

  // Warnings for scope / project mismatch
  if (projectIdentity.projectMismatch && !projectIdentity.allowCrossProject) {
    md += `> [!WARNING]\n`;
    md += `> **Project Identity Mismatch**: Baseline project (\`${escapeMarkdown(projectIdentity.beforeProject)}\`) differs from follow-up (\`${escapeMarkdown(projectIdentity.afterProject)}\`). Comparative remediation claims are marked indeterminate.\n\n`;
  }

  if (scopeCompatibility.scopeMismatch) {
    md += `> [!WARNING]\n`;
    md += `> **Assessment Scope Mismatch**: Follow-up scan omitted categories [${scopeCompatibility.missingCategories.join(', ')}]. Disappeared checks in these categories are classified as unverified missing checks, not resolved findings.\n\n`;
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
  md += `| **Not Applicable (N/A)** | ${before.summary.notApplicable ?? 0} | ${after.summary.notApplicable ?? 0} | **${sign(summaryDelta.notApplicable ?? 0)}** |\n`;
  md += `| **Informational Diagnostics** | ${before.summary.informational ?? 0} | ${after.summary.informational ?? 0} | **${sign(summaryDelta.informational ?? 0)}** |\n`;
  md += `| **Total Evaluated Checks** | ${before.summary.totalChecks} | ${after.summary.totalChecks} | **${sign(summaryDelta.totalChecks)}** |\n\n`;

  // Resolved Findings
  md += `## 2. Remediated & Resolved Findings (${resolvedFindings.length})\n\n`;
  if (resolvedFindings.length === 0) {
    md += `No previously open findings were confirmed resolved in this assessment cycle.\n\n`;
  } else {
    for (const r of resolvedFindings) {
      const location = r.evidence?.file ? ` (\`${r.evidence.file}\`)` : '';
      md += `- :white_check_mark: **[${r.id}] ${escapeMarkdown(r.title)}**${location}: Remediated from \`${r.beforeStatus}\` -> \`${r.afterStatus}\` (${escapeMarkdown(r.explanation || 'Verified passed')})\n`;
    }
    md += `\n`;
  }

  // Regressions
  if (regressedFindings.length > 0) {
    md += `## 3. Regressions Detected (${regressedFindings.length})\n\n`;
    for (const reg of regressedFindings) {
      md += `### :x: [${reg.id}] ${escapeMarkdown(reg.title)} (REGRESSION)\n`;
      md += `- **Transition**: Was \`${reg.beforeStatus}\`, now \`${reg.afterStatus}\` (\`${reg.severity?.toUpperCase() || 'HIGH'}\`)\n`;
      if (reg.evidence?.file) {
        md += `- **Location**: \`${reg.evidence.file}\`\n`;
      }
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
      if (nf.evidence?.file) {
        md += `- **Location**: \`${nf.evidence.file}\`\n`;
      }
      md += `- **Explanation**: ${escapeMarkdown(nf.explanation)}\n`;
      if (nf.recommendation) {
        md += `- **Remediation Action**: ${escapeMarkdown(nf.recommendation)}\n`;
      }
      md += `\n`;
    }
  }

  // No Longer Applicable Findings
  if (noLongerApplicableFindings.length > 0) {
    md += `## 5. Findings No Longer Applicable (${noLongerApplicableFindings.length})\n\n`;
    for (const nla of noLongerApplicableFindings) {
      md += `- :information_source: **[${nla.id}] ${escapeMarkdown(nla.title)}**: Changed from \`${nla.beforeStatus}\` -> \`NOT_APPLICABLE\` (${escapeMarkdown(nla.explanation)})\n`;
    }
    md += `\n`;
  }

  // Missing / Unexecuted Checks
  if (missingFindings.length > 0) {
    md += `## 6. Unverified Missing Findings (${missingFindings.length})\n\n`;
    for (const mf of missingFindings) {
      md += `- :warning: **[${mf.id}] ${escapeMarkdown(mf.title)}**: Previously \`${mf.beforeStatus}\` but absent in follow-up (${escapeMarkdown(mf.reason)})\n`;
    }
    md += `\n`;
  }

  // Next Steps
  md += `## 7. Next Verification Steps\n\n`;
  if (after.policyOutcome === 'READY FOR HUMAN RELEASE REVIEW') {
    md += `All automated policy blockers are fully resolved. Submit this verification report to the lead release engineer or maintainer for final deployment sign-off.\n`;
  } else if (after.policyOutcome === 'BLOCKED') {
    md += `Assessment remains **BLOCKED**. Address all remaining P0 blocking failures before scheduling production rollout.\n`;
  } else {
    md += `Assessment outcome is \`${after.policyOutcome}\`. Complete remaining manual reviews or run authorized tests (--allow-exec) to finalize production evaluation.\n`;
  }

  return md;
}
