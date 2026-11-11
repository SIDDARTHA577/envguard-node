import { runReadinessAudit } from '../engine/orchestrator.mjs';
import { compareReadinessReports } from '../reporters/comparator.mjs';
import { collectProjectFiles } from '../constants.mjs';
import { generateRemediationPatches } from './patch-generator.mjs';
import {
  assertSafeProjectRelativePathDetails,
  atomicWriteWithinRootSync,
  computeSha256,
  createCheckpoint,
  finalizeCheckpointPostApply,
  lstatSafe,
  resolveCanonicalProjectRoot,
  restoreCheckpoint,
  safeReadFileBufferSync,
} from './checkpoint-manager.mjs';

/**
 * Standardized status outcomes for the remediation workflow.
 */
export const REMEDIATION_STATUSES = {
  PROPOSED_PENDING_APPROVAL: 'PROPOSED_PENDING_APPROVAL',
  NO_ACTIONABLE_PATCHES: 'NO_ACTIONABLE_PATCHES',
  REMEDIATED_AND_VERIFIED: 'REMEDIATED_AND_VERIFIED',
  REVERTED_DUE_TO_REGRESSION: 'REVERTED_DUE_TO_REGRESSION',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
};

/**
 * Verifies that every patch target matches its pre-approval baseline state on disk.
 * Prevents silently overwriting concurrent changes made between diff preview and application.
 *
 * @param {string} canonicalBase
 * @param {Array<object>} patches
 * @returns {Array<{ targetFile: string, reason: string }>}
 */
export function detectPreApplyConflicts(canonicalBase, patches = []) {
  const conflicts = [];

  for (const patch of patches) {
    let details;
    try {
      details = assertSafeProjectRelativePathDetails(canonicalBase, patch.targetFile);
    } catch (err) {
      conflicts.push({
        targetFile: patch.targetFile,
        reason: err.message,
      });
      continue;
    }

    const { resolvedTarget, normalizedRelPath } = details;
    const st = lstatSafe(resolvedTarget);

    if (st && st.isSymbolicLink()) {
      conflicts.push({
        targetFile: normalizedRelPath,
        reason: `Target "${normalizedRelPath}" is a symbolic link or junction.`,
      });
      continue;
    }

    const expectedExisted =
      typeof patch.expectedExisted === 'boolean' ? patch.expectedExisted : patch.action !== 'create';

    if (!expectedExisted) {
      if (st) {
        conflicts.push({
          targetFile: normalizedRelPath,
          reason: `Target file "${normalizedRelPath}" already exists on disk (created concurrently since patch formulation).`,
        });
      }
      continue;
    }

    // Expected file to exist prior to modification
    if (!st) {
      conflicts.push({
        targetFile: normalizedRelPath,
        reason: `Target file "${normalizedRelPath}" no longer exists on disk (deleted concurrently since patch formulation).`,
      });
      continue;
    }

    let expectedHash = patch.expectedOriginalHash;
    if (!expectedHash && typeof patch.currentContent === 'string') {
      expectedHash = computeSha256(Buffer.from(patch.currentContent, 'utf8'));
    }

    if (expectedHash) {
      const { buffer: currentBuffer } = safeReadFileBufferSync(resolvedTarget);
      const currentHash = computeSha256(currentBuffer);
      if (currentHash !== expectedHash) {
        conflicts.push({
          targetFile: normalizedRelPath,
          reason: `Concurrent modification detected in "${normalizedRelPath}": disk hash does not match approved baseline.`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Executes the safe, reviewable remediation workflow.
 * Formulates non-destructive patches, displays unified diffs, enforces approval gates,
 * detects concurrent developer edits, creates rollback checkpoints, applies writes atomically,
 * and reruns comparative assessments.
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
 * @param {Array<object>|null} [options.patches=null] - Pre-approved patches to apply directly
 * @param {Function|null} [options.writeHook=null] - Optional internal hook invoked per patch write (for testing partial failures)
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
  patches: providedPatches = null,
  writeHook = null,
} = {}) {
  const safeProjectDir = resolveCanonicalProjectRoot(projectDir);

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

  // 2. Formulate or use pre-approved patches
  const files = collectProjectFiles(safeProjectDir);
  const patches = providedPatches ?? generateRemediationPatches(safeProjectDir, beforeReport.findings, files);

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

  // 4. Concurrent-Change Pre-Flight Check before creating backup or writing disk
  const preApplyConflicts = detectPreApplyConflicts(safeProjectDir, patches);
  if (preApplyConflicts.length > 0) {
    return {
      status: REMEDIATION_STATUSES.CONFLICT,
      applied: false,
      reverted: false,
      conflictDetected: true,
      conflicts: preApplyConflicts,
      projectDir: safeProjectDir,
      patches,
      diffPreview,
      error: `Remediation refused due to concurrent modifications or unsafe paths: ${preApplyConflicts.map((c) => c.reason).join('; ')}`,
    };
  }

  // 5. Approved Application with Secure Checkpoint & Atomic Writes
  let checkpoint = null;
  const postApplyStatusMap = new Map();
  for (const p of patches) {
    const details = assertSafeProjectRelativePathDetails(safeProjectDir, p.targetFile);
    postApplyStatusMap.set(details.normalizedRelPath, { applied: false, appliedHash: null });
  }

  try {
    checkpoint = createCheckpoint(safeProjectDir, patches);

    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      const { normalizedRelPath } = assertSafeProjectRelativePathDetails(safeProjectDir, patch.targetFile);

      if (typeof writeHook === 'function') {
        writeHook(patch, i);
      }

      const appliedHash = atomicWriteWithinRootSync(safeProjectDir, normalizedRelPath, patch.proposedContent);
      postApplyStatusMap.set(normalizedRelPath, { applied: true, appliedHash });
    }

    // Record exact applied hashes on manifest so subsequent rollbacks preserve concurrent developer edits
    checkpoint = finalizeCheckpointPostApply(checkpoint, postApplyStatusMap);

    // 6. Automated Retesting & Comparison
    const afterReport = runReadinessAudit({
      projectDir: safeProjectDir,
      categories,
      allowExec,
      trustProject,
      timeoutMs,
    });

    const comparison = compareReadinessReports(beforeReport, afterReport);

    // 7. Regression Guard & Verified Rollback
    if (comparison.statusTransition.regressed && autoRollbackOnRegression) {
      const rollbackResult = restoreCheckpoint(checkpoint, {
        projectDir: safeProjectDir,
        preserveConcurrentChanges: true,
      });
      return {
        status: REMEDIATION_STATUSES.REVERTED_DUE_TO_REGRESSION,
        applied: false,
        reverted: rollbackResult.restored === true,
        projectDir: safeProjectDir,
        checkpoint,
        rollbackResult,
        patches,
        diffPreview,
        comparison,
        beforeReport,
        afterReport,
        error:
          'Remediation patches introduced regressions in follow-up assessment. Changes rolled back to pristine checkpoint.',
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
    let reverted = false;
    let rollbackResult = null;

    if (checkpoint) {
      try {
        checkpoint = finalizeCheckpointPostApply(checkpoint, postApplyStatusMap);
        rollbackResult = restoreCheckpoint(checkpoint, {
          projectDir: safeProjectDir,
          preserveConcurrentChanges: true,
        });
        reverted = rollbackResult.restored === true;
      } catch (rbErr) {
        rollbackResult = { restored: false, error: rbErr.message, restoredFiles: [] };
      }
    }

    return {
      status: REMEDIATION_STATUSES.FAILED,
      applied: false,
      reverted,
      rollbackResult,
      projectDir: safeProjectDir,
      checkpoint,
      error: err.message,
    };
  }
}
