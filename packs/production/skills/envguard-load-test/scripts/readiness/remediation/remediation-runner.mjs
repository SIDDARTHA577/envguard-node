import fs from 'node:fs';
import path from 'node:path';
import { runReadinessAudit } from '../engine/orchestrator.mjs';
import { compareReadinessReports } from '../reporters/comparator.mjs';
import { collectProjectFiles } from '../constants.mjs';
import { generateRemediationPatches } from './patch-generator.mjs';
import { createCheckpoint, restoreCheckpoint } from './checkpoint-manager.mjs';

/**
 * Standardized status outcomes for the remediation workflow.
 */
export const REMEDIATION_STATUSES = {
  PROPOSED_PENDING_APPROVAL: 'PROPOSED_PENDING_APPROVAL',
  NO_ACTIONABLE_PATCHES: 'NO_ACTIONABLE_PATCHES',
  REMEDIATED_AND_VERIFIED: 'REMEDIATED_AND_VERIFIED',
  REVERTED_DUE_TO_REGRESSION: 'REVERTED_DUE_TO_REGRESSION',
  FAILED: 'FAILED',
};

/**
 * Executes the safe, reviewable remediation workflow.
 * Formulates non-destructive patches, displays unified diffs, enforces approval gates,
 * creates rollback checkpoints, and reruns comparative assessments.
 *
 * @param {object} options
 * @param {string} [options.projectDir='.'] - Target project directory
 * @param {boolean} [options.applyFix=false] - Explicit approval gate to apply edits
 * @param {boolean} [options.autoRollbackOnRegression=true] - Revert on regression
 * @param {boolean} [options.allowExec=false] - Authorization for follow-up dynamic tests
 * @param {boolean} [options.trustProject=false] - Explicit host trust
 * @param {number} [options.timeoutMs=10000] - Subprocess execution timeout
 * @param {string[]} [options.categories] - Assessment categories
 * @param {object|null} [options.baselineReport=null] - Pre-computed baseline report
 * @returns {object} Structured remediation result
 */
export function executeRemediationWorkflow({
  projectDir = '.',
  applyFix = false,
  autoRollbackOnRegression = true,
  allowExec = false,
  trustProject = false,
  timeoutMs = 10000,
  categories,
  baselineReport = null,
} = {}) {
  const safeProjectDir = path.resolve(projectDir);

  // 1. Baseline Assessment
  let beforeReport = baselineReport;
  if (!beforeReport) {
    beforeReport = runReadinessAudit({
      projectDir: safeProjectDir,
      categories,
      allowExec,
      trustProject,
      timeoutMs,
    });
  }

  // 2. Formulate Patches
  const files = collectProjectFiles(safeProjectDir);
  const patches = generateRemediationPatches(safeProjectDir, beforeReport.findings, files);

  if (patches.length === 0) {
    return {
      status: REMEDIATION_STATUSES.NO_ACTIONABLE_PATCHES,
      projectDir: safeProjectDir,
      applied: false,
      reverted: false,
      patches: [],
      diffPreview: '',
      message: 'No actionable remediation patches available for current findings.',
    };
  }

  const diffPreview = patches.map((p) => p.unifiedDiff).join('\n');

  // 3. Approval Gate / Dry-Run Mode
  if (!applyFix) {
    return {
      status: REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL,
      approvalRequired: true,
      applied: false,
      reverted: false,
      projectDir: safeProjectDir,
      patches,
      diffPreview,
      summary: {
        totalPatches: patches.length,
        filesToCreate: patches.filter((p) => p.action === 'create').length,
        filesToModify: patches.filter((p) => p.action === 'modify').length,
      },
      message:
        'Remediation patches formulated with zero destructive changes. Review unified diffs above. Pass --apply-fix to apply with rollback checkpointing.',
    };
  }

  // 4. Approved Application with Checkpoint Protection
  let checkpoint = null;
  try {
    checkpoint = createCheckpoint(safeProjectDir, patches);

    // Apply each patch to disk
    for (const patch of patches) {
      const targetPath = path.join(safeProjectDir, patch.targetFile);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, patch.proposedContent, 'utf8');
    }

    // 5. Automated Retesting & Comparison
    const afterReport = runReadinessAudit({
      projectDir: safeProjectDir,
      categories,
      allowExec,
      trustProject,
      timeoutMs,
    });

    const comparison = compareReadinessReports(beforeReport, afterReport);

    // 6. Regression Guard & Rollback
    if (comparison.statusTransition.regressed && autoRollbackOnRegression) {
      const rollbackResult = restoreCheckpoint(checkpoint);
      return {
        status: REMEDIATION_STATUSES.REVERTED_DUE_TO_REGRESSION,
        applied: false,
        reverted: true,
        projectDir: safeProjectDir,
        checkpoint,
        rollbackResult,
        patches,
        diffPreview,
        comparison,
        beforeReport,
        afterReport,
        error:
          'Remediation patches introduced regressions in follow-up assessment. Changes automatically rolled back to pristine checkpoint.',
      };
    }

    return {
      status: REMEDIATION_STATUSES.REMEDIATED_AND_VERIFIED,
      applied: true,
      reverted: false,
      projectDir: safeProjectDir,
      checkpoint,
      patches,
      diffPreview,
      comparison,
      beforeReport,
      afterReport,
      verdict: comparison.statusTransition.verdict,
    };
  } catch (err) {
    if (checkpoint) {
      try {
        restoreCheckpoint(checkpoint);
      } catch {}
    }

    return {
      status: REMEDIATION_STATUSES.FAILED,
      applied: false,
      reverted: Boolean(checkpoint),
      projectDir: safeProjectDir,
      error: err.message,
    };
  }
}
