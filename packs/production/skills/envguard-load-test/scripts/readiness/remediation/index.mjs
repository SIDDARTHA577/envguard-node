export { generateUnifiedDiff } from './diff-viewer.mjs';
export {
  discoverEnvVarNames,
  discoverTestFramework,
  buildSafeGitignoreContent,
  generateRemediationPatches,
} from './patch-generator.mjs';
export {
  lstatSafe,
  resolveCanonicalProjectRoot,
  assertSafeProjectRelativePath,
  assertSafeProjectRelativePathDetails,
  computeSha256,
  computeManifestIntegrityHash,
  safeReadFileBufferSync,
  atomicWriteWithinRootSync,
  ensureSafeBackupsBaseDir,
  inspectBackupPermissionSecurity,
  createCheckpoint,
  finalizeCheckpointPostApply,
  loadCheckpointManifest,
  restoreCheckpoint,
  cleanupCheckpoints,
} from './checkpoint-manager.mjs';
export {
  REMEDIATION_STATUSES,
  detectPreApplyConflicts,
  executeRemediationWorkflow,
} from './remediation-runner.mjs';
