import { escapeMarkdown } from '../constants.mjs';

/**
 * Generates human-readable Markdown readiness report with all standardized sections.
 */
export function generateMarkdownReport(report) {
  const { summary, findings, limitations, configuration, platform, projectRoot, timestamp } = report;

  let md = `# EnvGuard Production Readiness Assessment Report\n\n`;
  md += `**Project**: \`${escapeMarkdown(projectRoot)}\`  \n`;
  md += `**Timestamp**: ${timestamp}  \n`;
  md += `**Auditor Version**: v${report.toolVersion} (Schema v${report.schemaVersion})  \n`;
  md += `**Platform**: Node.js ${platform.nodeVersion} on ${platform.os}  \n`;
  md += `**Execution Permitted (--allow-exec)**: ${configuration.allowExec ? 'Yes (Authorized Mode)' : 'No (Read-Only Mode)'}  \n`;
  if (configuration.allowExec) {
    md += `**Execution Containment**: ${report.executionPolicy?.isolated ? 'Container Isolated' : configuration.trustProject ? 'Host Explicitly Trusted (--trust-project)' : 'Untrusted Blocked'}  \n`;
  }
  if (report.policyEvaluation?.outcome) {
    md += `**Release Gate Outcome**: \`${report.policyEvaluation.outcome}\`  \n`;
  }
  md += `\n`;

  // Executive Summary Table
  md += `## 1. Executive Summary\n\n`;
  md += `| Check Status | Count | Description |\n`;
  md += `| :--- | :---: | :--- |\n`;
  md += `| **PASS** | ${summary.pass} | Verified passing criteria |\n`;
  md += `| **FAIL** | ${summary.fail} | Blocking failures requiring remediation |\n`;
  md += `| **WARNING** | ${summary.warning} | Non-blocking risks or missing conventions |\n`;
  md += `| **INFORMATIONAL** | ${summary.informational ?? 0} | Informational diagnostics and external notes |\n`;
  md += `| **NOT_RUN** | ${summary.notRun} | Checks skipped (authorization or infra unavailable) |\n`;
  md += `| **MANUAL_REVIEW** | ${summary.manualReview} | Heuristics requiring human engineering review |\n`;
  md += `| **NOT_APPLICABLE**| ${summary.notApplicable} | Checks irrelevant to detected project type |\n`;
  md += `| **Total Checks** | ${summary.totalChecks} | Comprehensive assessment scope |\n\n`;

  // Discovered Inventory & Architecture (if multi-application or monorepo)
  if (report.projectMetadata?.inventory?.applications?.length > 1) {
    const apps = report.projectMetadata.inventory.applications;
    md += `### Discovered Architecture & Workspaces (${apps.length} applications)\n\n`;
    md += `| Application | Path | Type | Frameworks | Databases |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const app of apps) {
      md += `| \`${escapeMarkdown(app.name)}\` | \`${escapeMarkdown(app.path)}\` | ${app.type} | ${app.frameworks?.join(', ') || 'none'} | ${app.databases?.join(', ') || 'none'} |\n`;
    }
    md += `\n`;
  }

  // 2. Blocking Failures
  const failures = findings.filter((f) => f.status === 'FAIL');
  if (failures.length > 0) {
    md += `## 2. Blocking Failures (${failures.length})\n\n`;
    for (const f of failures) {
      md += `### [${f.id}] ${escapeMarkdown(f.title)}\n`;
      md += `- **Severity**: \`${f.severity ? f.severity.toUpperCase() : 'BLOCKER'}\` | **Confidence**: \`${f.confidence}\`\n`;
      md += `- **Explanation**: ${escapeMarkdown(f.explanation)}\n`;
      if (f.evidence?.file) md += `- **Evidence**: \`${escapeMarkdown(f.evidence.file)}\`\n`;
      if (f.evidence?.command) md += `- **Command**: \`${escapeMarkdown(f.evidence.command)}\` (exit code: ${f.evidence.exitCode})\n`;
      if (f.evidence?.snippet) md += `\`\`\`\n${escapeMarkdown(f.evidence.snippet)}\n\`\`\`\n`;
      md += `- **Recommendation**: ${escapeMarkdown(f.recommendation)}\n\n`;
    }
  }

  // 3. Warnings
  const warnings = findings.filter((f) => f.status === 'WARNING');
  if (warnings.length > 0) {
    md += `## 3. Warnings & Improvement Opportunities (${warnings.length})\n\n`;
    for (const w of warnings) {
      md += `### [${w.id}] ${escapeMarkdown(w.title)}\n`;
      md += `- **Explanation**: ${escapeMarkdown(w.explanation)}\n`;
      if (w.evidence?.file) md += `- **Evidence**: \`${escapeMarkdown(w.evidence.file)}\`\n`;
      md += `- **Recommendation**: ${escapeMarkdown(w.recommendation)}\n\n`;
    }
  }

  // 4. Verified Passing Checks
  const passed = findings.filter((f) => f.status === 'PASS');
  md += `## 4. Verified Passing Checks (${passed.length})\n\n`;
  for (const p of passed) {
    md += `- **[${p.id}] ${escapeMarkdown(p.title)}**: ${escapeMarkdown(p.explanation)}\n`;
  }
  md += `\n`;

  // 5. Manual Review & Not-Run
  const manualAndNotRun = findings.filter((f) => f.status === 'MANUAL_REVIEW' || f.status === 'NOT_RUN');
  if (manualAndNotRun.length > 0) {
    md += `## 5. Unexecuted & Manual Review Items (${manualAndNotRun.length})\n\n`;
    for (const item of manualAndNotRun) {
      md += `- **[${item.id}] ${escapeMarkdown(item.title)}** (${item.status}): ${escapeMarkdown(item.explanation)}\n`;
    }
    md += `\n`;
  }

  // 5b. Informational Diagnostics
  const informational = findings.filter((f) => f.status === 'INFORMATIONAL');
  if (informational.length > 0) {
    md += `## Informational Diagnostics (${informational.length})\n\n`;
    for (const info of informational) {
      md += `- **[${info.id}] ${escapeMarkdown(info.title)}**: ${escapeMarkdown(info.explanation)}\n`;
    }
    md += `\n`;
  }

  // 6. Prioritized Remediation Plan
  md += `## 6. Prioritized Remediation Plan\n\n`;
  let step = 1;
  for (const f of failures) {
    md += `${step++}. **[P0 - Blocker]** ${escapeMarkdown(f.title)}: ${escapeMarkdown(f.recommendation)}\n`;
  }
  for (const w of warnings.filter((w) => w.severity === 'high')) {
    md += `${step++}. **[P1 - High]** ${escapeMarkdown(w.title)}: ${escapeMarkdown(w.recommendation)}\n`;
  }
  for (const w of warnings.filter((w) => w.severity !== 'high')) {
    md += `${step++}. **[P2 - Medium/Low]** ${escapeMarkdown(w.title)}: ${escapeMarkdown(w.recommendation)}\n`;
  }
  if (failures.length === 0 && warnings.length === 0) {
    md += `All automated checks passed cleanly! Proceed with manual operational verification before production rollout.\n`;
  }
  md += `\n`;

  // 7. Known Limitations
  md += `## 7. Known Limitations & Scope Boundaries\n\n`;
  for (const lim of limitations) {
    md += `- ${escapeMarkdown(lim)}\n`;
  }
  md += `\n`;

  return md;
}
