import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CHECKPOINT_ID_PATTERN = /^checkpoint-\d+-[a-f0-9]+$/;

/**
 * Safely calls fs.lstatSync and returns null if the path does not exist (ENOENT).
 * Unlike fs.existsSync(), lstatSync() detects broken/dangling symlinks and junctions.
 *
 * @param {string} targetPath
 * @returns {fs.Stats|null}
 */
export function lstatSafe(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return null;
    }
    throw err;
  }
}

/**
 * Resolves the canonical project root directory via fs.realpathSync().
 * Rejects non-existent or non-directory roots.
 *
 * @param {string} projectDir
 * @returns {string} Canonical absolute project directory path
 */
export function resolveCanonicalProjectRoot(projectDir) {
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('Invalid project directory: must be a non-empty string.');
  }

  const resolved = path.resolve(projectDir);
  const st = lstatSafe(resolved);
  if (!st) {
    throw new Error(`Project directory does not exist: "${resolved}".`);
  }

  const canonicalBase = fs.realpathSync(resolved);
  const canonicalStat = fs.statSync(canonicalBase);
  if (!canonicalStat.isDirectory()) {
    throw new Error(`Project root path is not a directory: "${canonicalBase}".`);
  }

  return canonicalBase;
}

/**
 * Validates that a relative path is strictly contained within the canonical project directory,
 * contains no absolute/traversal components, does not target internal EnvGuard backup storage,
 * and contains no symlinks or Windows junctions along the path or target.
 *
 * @param {string} projectDir - Base project directory
 * @param {string} relFile - Proposed relative file path
 * @returns {{ canonicalBase: string, resolvedTarget: string, normalizedRelPath: string }}
 */
export function assertSafeProjectRelativePathDetails(projectDir, relFile) {
  if (!relFile || typeof relFile !== 'string') {
    throw new Error('Invalid target path: path must be a non-empty string.');
  }

  if (relFile.includes('\0') || /[\r\n]/.test(relFile)) {
    throw new Error(`Invalid target path: illegal control characters detected in "${relFile}".`);
  }

  // Reject absolute paths, Windows drive-relative paths (e.g. C:foo), and UNC paths
  if (path.isAbsolute(relFile) || /^[a-zA-Z]:/.test(relFile) || relFile.startsWith('\\\\') || relFile.startsWith('//')) {
    throw new Error(`Path traversal rejected: target path "${relFile}" must be project-relative, not absolute.`);
  }

  // Reject explicit '..' traversal segments prior to resolution
  const rawSegments = relFile.split(/[/\\]+/).filter(Boolean);
  if (rawSegments.length === 0 || rawSegments.includes('..')) {
    throw new Error(`Path traversal rejected: target path "${relFile}" contains forbidden parent directory traversal.`);
  }

  const canonicalBase = resolveCanonicalProjectRoot(projectDir);
  const resolvedTarget = path.resolve(canonicalBase, relFile);
  const relativeFromBase = path.relative(canonicalBase, resolvedTarget);

  if (!relativeFromBase || relativeFromBase.startsWith('..') || path.isAbsolute(relativeFromBase)) {
    throw new Error(`Path traversal rejected: target path "${relFile}" escapes project root boundary.`);
  }

  const normalizedRelPath = relativeFromBase.replace(/\\/g, '/');

  // Protect internal backup & checkpoint directories from being overwritten by patches
  if (
    normalizedRelPath === '.envguard' ||
    normalizedRelPath.startsWith('.envguard/backups') ||
    normalizedRelPath.startsWith('.envguard/checkpoints')
  ) {
    throw new Error(`Unsafe target path rejected: "${relFile}" cannot modify internal checkpoint storage.`);
  }

  // Walk every existing segment under canonicalBase to reject symlinks and Windows junctions
  const segments = normalizedRelPath.split('/').filter(Boolean);
  let currentPath = canonicalBase;

  for (let i = 0; i < segments.length; i++) {
    currentPath = path.join(currentPath, segments[i]);
    const st = lstatSafe(currentPath);

    if (st) {
      if (st.isSymbolicLink()) {
        throw new Error(
          `Symlink/junction traversal rejected: path component "${segments.slice(0, i + 1).join('/')}" is a symbolic link or junction.`
        );
      }

      // Ancestor segments before leaf must be real directories
      if (i < segments.length - 1 && !st.isDirectory()) {
        throw new Error(`Invalid path: ancestor "${segments.slice(0, i + 1).join('/')}" is not a directory.`);
      }

      // Check realpath containment as defense in depth
      const realComp = fs.realpathSync(currentPath);
      const relReal = path.relative(canonicalBase, realComp);
      if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
        throw new Error(`Path boundary escape rejected: "${currentPath}" resolved outside canonical root.`);
      }
    }
  }

  return {
    canonicalBase,
    resolvedTarget,
    normalizedRelPath,
  };
}

/**
 * Backward-compatible wrapper returning the validated resolved target path string.
 *
 * @param {string} projectDir - Base project directory
 * @param {string} relFile - Proposed relative file path
 * @returns {string} Validated resolved target path
 */
export function assertSafeProjectRelativePath(projectDir, relFile) {
  return assertSafeProjectRelativePathDetails(projectDir, relFile).resolvedTarget;
}

/**
 * Computes SHA-256 digest for a string or buffer.
 *
 * @param {string|Buffer} content
 * @returns {string} Hex-encoded SHA-256 digest
 */
export function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Computes canonical integrity digest for a checkpoint manifest object.
 *
 * @param {object} manifest
 * @returns {string} SHA-256 digest
 */
export function computeManifestIntegrityHash(manifest) {
  const payload = {
    checkpointId: manifest.checkpointId,
    timestamp: manifest.timestamp,
    projectDir: manifest.projectDir,
    snapshots: (manifest.snapshots || []).map((s) => ({
      targetFile: s.targetFile,
      backupRelFile: s.backupRelFile,
      existed: Boolean(s.existed),
      originalHash: s.originalHash ?? null,
      originalMode: s.originalMode ?? null,
      fileSizeBytes: s.fileSizeBytes ?? 0,
      applied: s.applied ?? undefined,
      appliedHash: s.appliedHash ?? null,
    })),
  };
  return computeSha256(JSON.stringify(payload));
}

/**
 * Reads a regular file while resisting symlink substitution via lstatSync + O_NOFOLLOW + fstatSync inode checks.
 * Note: Cross-platform user-space checks harden against TOCTOU substitution where primitives exist,
 * though true kernel-enforced atomic path resolution requires OS-specific openat2() support.
 *
 * @param {string} filePath
 * @returns {{ buffer: Buffer, mode: number }}
 */
export function safeReadFileBufferSync(filePath) {
  const preStat = lstatSafe(filePath);
  if (!preStat) {
    throw new Error(`File not found: "${filePath}".`);
  }
  if (preStat.isSymbolicLink()) {
    throw new Error(`Symlink read rejected: "${filePath}" is a symbolic link.`);
  }
  if (!preStat.isFile()) {
    throw new Error(`Invalid file type: "${filePath}" is not a regular file.`);
  }

  const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollowFlag);

  try {
    const fdStat = fs.fstatSync(fd);
    if (!fdStat.isFile()) {
      throw new Error(`Invalid file handle: "${filePath}" is not a regular file.`);
    }

    // Detect concurrent file swap between lstat and open when OS provides inode numbers
    if (fdStat.ino > 0 && preStat.ino > 0 && (fdStat.dev !== preStat.dev || fdStat.ino !== preStat.ino)) {
      throw new Error(`Concurrent file substitution detected while reading "${filePath}".`);
    }

    const buffer = Buffer.alloc(fdStat.size);
    let offset = 0;
    while (offset < fdStat.size) {
      const bytesRead = fs.readSync(fd, buffer, offset, fdStat.size - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }

    return {
      buffer: offset === buffer.length ? buffer : buffer.subarray(0, offset),
      mode: fdStat.mode & 0o777,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Creates directories along a path while rejecting any symlink/junction encountered along the path.
 *
 * @param {string} baseDir - Already verified canonical root directory
 * @param {string} relSubDir - Relative subdirectory path inside baseDir
 * @param {number} [mode=0o755]
 */
function safeMkdirWithinBaseSync(baseDir, relSubDir, mode = 0o755) {
  const segments = relSubDir.split(/[/\\]+/).filter(Boolean);
  let current = baseDir;

  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`Unsafe directory segment "${seg}" in backup/target path.`);
    }
    current = path.join(current, seg);
    const st = lstatSafe(current);
    if (st) {
      if (st.isSymbolicLink()) {
        throw new Error(`Symlink/junction directory rejected: "${current}".`);
      }
      if (!st.isDirectory()) {
        throw new Error(`Expected directory but found non-directory: "${current}".`);
      }
    } else {
      fs.mkdirSync(current, { mode });
    }
  }
}

/**
 * Atomically writes file content via a securely created same-directory temporary file and rename.
 * Preserves permissions when modifying existing files unless an explicit mode is requested.
 *
 * @param {string} canonicalBase
 * @param {string} relFile
 * @param {string|Buffer} content
 * @param {object} [options]
 * @param {number} [options.mode]
 */
export function atomicWriteWithinRootSync(canonicalBase, relFile, content, { mode } = {}) {
  const { resolvedTarget, normalizedRelPath } = assertSafeProjectRelativePathDetails(canonicalBase, relFile);
  const relDir = path.dirname(normalizedRelPath);

  if (relDir !== '.' && relDir !== '') {
    safeMkdirWithinBaseSync(canonicalBase, relDir, 0o755);
  }

  const existingStat = lstatSafe(resolvedTarget);
  if (existingStat && existingStat.isSymbolicLink()) {
    throw new Error(`Symlink overwrite rejected: "${normalizedRelPath}" is a symbolic link.`);
  }

  let targetMode = mode;
  if (targetMode === undefined) {
    targetMode = existingStat ? existingStat.mode & 0o777 : 0o644;
  }

  const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const tmpName = `.envguard-tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const tmpPath = path.join(path.dirname(resolvedTarget), tmpName);

  const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
  const openFlags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollowFlag;

  let fd;
  try {
    fd = fs.openSync(tmpPath, openFlags, targetMode);
    let written = 0;
    while (written < contentBuffer.length) {
      written += fs.writeSync(fd, contentBuffer, written, contentBuffer.length - written);
    }
    try {
      fs.fsyncSync(fd);
    } catch {
      // Some platforms/filesystems return EINVAL/EPERM on fsyncSync; ignore safely
    }
    fs.closeSync(fd);
    fd = undefined;

    // Final check before atomic rename
    const targetCheck = lstatSafe(resolvedTarget);
    if (targetCheck && targetCheck.isSymbolicLink()) {
      throw new Error(`Concurrent symlink substitution detected at "${normalizedRelPath}" before commit.`);
    }

    fs.renameSync(tmpPath, resolvedTarget);

    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(resolvedTarget, targetMode);
      } catch {}
    }

    return computeSha256(contentBuffer);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {}
    throw err;
  }
}

/**
 * Validates that .envguard and .envguard/backups inside canonicalBase are real directories,
 * not symlinks or junctions pointing elsewhere.
 *
 * @param {string} canonicalBase
 * @returns {string} Validated backups base path
 */
export function ensureSafeBackupsBaseDir(canonicalBase) {
  const envguardDir = path.join(canonicalBase, '.envguard');
  const envguardStat = lstatSafe(envguardDir);
  if (envguardStat) {
    if (envguardStat.isSymbolicLink() || !envguardStat.isDirectory()) {
      throw new Error('Security error: ".envguard" directory is a symlink or non-directory.');
    }
  } else {
    fs.mkdirSync(envguardDir, { mode: 0o700 });
  }

  const backupsBase = path.join(envguardDir, 'backups');
  const backupsStat = lstatSafe(backupsBase);
  if (backupsStat) {
    if (backupsStat.isSymbolicLink() || !backupsStat.isDirectory()) {
      throw new Error('Security error: ".envguard/backups" directory is a symlink or non-directory.');
    }
  } else {
    fs.mkdirSync(backupsBase, { mode: 0o700 });
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(envguardDir, 0o700);
      fs.chmodSync(backupsBase, 0o700);
    } catch {}
  }

  return backupsBase;
}

/**
 * Inspects platform permission protection guarantees for a backup directory.
 *
 * @param {string} backupDir
 * @returns {object} Security assessment metadata
 */
export function inspectBackupPermissionSecurity(backupDir) {
  if (process.platform === 'win32') {
    return {
      platform: 'win32',
      posixModeEnforced: false,
      restrictedAccessVerified: false,
      permissionWarning:
        'Windows NTFS relies on Access Control Lists (ACLs) rather than POSIX chmod flags (0600/0700). Ensure the project directory ACL restricts access to the current user account.',
    };
  }

  try {
    const st = fs.statSync(backupDir);
    const mode = st.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      fs.chmodSync(backupDir, 0o700);
      const recheck = fs.statSync(backupDir).mode & 0o777;
      if ((recheck & 0o077) !== 0) {
        return {
          platform: process.platform,
          posixModeEnforced: false,
          restrictedAccessVerified: false,
          permissionWarning: `Backup directory permissions (${recheck.toString(8)}) remain overly permissive after chmod 0700.`,
        };
      }
    }

    return {
      platform: process.platform,
      posixModeEnforced: true,
      restrictedAccessVerified: true,
      permissionWarning: null,
    };
  } catch (err) {
    return {
      platform: process.platform,
      posixModeEnforced: false,
      restrictedAccessVerified: false,
      permissionWarning: `Unable to verify backup directory permissions: ${err.message}`,
    };
  }
}

/**
 * Validates that a backup file path is strictly contained within approvedBackupDir and has no symlinks.
 *
 * @param {string} approvedBackupDir
 * @param {string} backupRelFile
 * @returns {string} Safe backup file path
 */
function assertSafeBackupFilePath(approvedBackupDir, backupRelFile) {
  if (!backupRelFile || typeof backupRelFile !== 'string') {
    throw new Error('Invalid backup relative file path in checkpoint metadata.');
  }
  if (path.isAbsolute(backupRelFile) || /^[a-zA-Z]:/.test(backupRelFile) || backupRelFile.includes('..')) {
    throw new Error(`Unsafe backup path rejected in checkpoint manifest: "${backupRelFile}".`);
  }

  const resolvedBackup = path.resolve(approvedBackupDir, backupRelFile);
  const rel = path.relative(approvedBackupDir, resolvedBackup);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Backup path traversal rejected: "${backupRelFile}" escapes approved backup directory.`);
  }

  // Ensure no symlink inside approvedBackupDir along rel
  const segments = rel.split(/[/\\]+/).filter(Boolean);
  let cur = approvedBackupDir;
  for (const seg of segments) {
    cur = path.join(cur, seg);
    const st = lstatSafe(cur);
    if (st && st.isSymbolicLink()) {
      throw new Error(`Symlink/junction rejected inside backup directory: "${cur}".`);
    }
  }

  return resolvedBackup;
}

/**
 * Creates an immutable, secure backup checkpoint for all target files targeted by remediation patches.
 * Strictly validates project containment, enforces 0o600/0o700 permissions where supported,
 * checks backup write integrity, and omits raw secrets from JSON manifests.
 *
 * @param {string} projectDir - Base project directory
 * @param {Array<object>} patches - Proposed remediation patches
 * @returns {object} Checkpoint metadata manifest
 */
export function createCheckpoint(projectDir, patches = []) {
  const canonicalBase = resolveCanonicalProjectRoot(projectDir);
  const backupsBase = ensureSafeBackupsBaseDir(canonicalBase);

  const timestamp = new Date().toISOString();
  const checkpointId = `checkpoint-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const backupDir = path.join(backupsBase, checkpointId);

  // Pre-validate ALL patches before creating backup files
  const validatedTargets = patches.map((patch) => {
    const details = assertSafeProjectRelativePathDetails(canonicalBase, patch.targetFile);
    return { patch, ...details };
  });

  fs.mkdirSync(backupDir, { mode: 0o700 });
  const permissionSecurity = inspectBackupPermissionSecurity(backupDir);

  const snapshots = [];

  try {
    for (const item of validatedTargets) {
      const { resolvedTarget, normalizedRelPath } = item;
      const backupRelFile = normalizedRelPath;
      const backupFilePath = assertSafeBackupFilePath(backupDir, backupRelFile);

      const st = lstatSafe(resolvedTarget);
      const existed = Boolean(st);
      let originalHash = null;
      let originalMode = null;
      let fileSizeBytes = 0;

      if (existed) {
        const { buffer: originalBuffer, mode } = safeReadFileBufferSync(resolvedTarget);
        fileSizeBytes = originalBuffer.length;
        originalHash = computeSha256(originalBuffer);
        originalMode = mode;

        const relBackupSubDir = path.dirname(backupRelFile);
        if (relBackupSubDir !== '.' && relBackupSubDir !== '') {
          safeMkdirWithinBaseSync(backupDir, relBackupSubDir, 0o700);
        }

        // Write backup atomically inside backupDir with mode 0o600
        const tmpBackup = path.join(path.dirname(backupFilePath), `.tmp-${crypto.randomBytes(6).toString('hex')}`);
        const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
        const fd = fs.openSync(tmpBackup, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollowFlag, 0o600);
        try {
          fs.writeSync(fd, originalBuffer, 0, originalBuffer.length);
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(tmpBackup, backupFilePath);

        if (process.platform !== 'win32') {
          try {
            fs.chmodSync(backupFilePath, 0o600);
          } catch {}
        }

        // Verify backup write integrity
        const { buffer: verifyBuffer } = safeReadFileBufferSync(backupFilePath);
        if (computeSha256(verifyBuffer) !== originalHash) {
          throw new Error(`Checkpoint integrity error: backup verification failed for "${normalizedRelPath}".`);
        }
      }

      snapshots.push({
        targetFile: normalizedRelPath,
        backupRelFile,
        fullTargetPath: resolvedTarget,
        existed,
        originalHash,
        originalMode,
        fileSizeBytes,
        applied: undefined,
        appliedHash: null,
        // Note: originalContent is strictly omitted to prevent secrets from leaking into manifest JSON.
        backupPath: existed ? backupFilePath : null,
      });
    }

    const manifest = {
      checkpointId,
      timestamp,
      projectDir: canonicalBase,
      backupDir,
      security: permissionSecurity,
      snapshots,
    };

    manifest.manifestIntegrityHash = computeManifestIntegrityHash(manifest);

    // Write manifest atomically with mode 0o600
    const manifestPath = path.join(backupDir, 'checkpoint-manifest.json');
    const tmpManifest = path.join(backupDir, `.tmp-manifest-${crypto.randomBytes(6).toString('hex')}`);
    const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
    const mfd = fs.openSync(tmpManifest, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollowFlag, 0o600);
    try {
      fs.writeSync(mfd, JSON.stringify(manifest, null, 2), 0, 'utf8');
    } finally {
      fs.closeSync(mfd);
    }
    fs.renameSync(tmpManifest, manifestPath);

    return manifest;
  } catch (err) {
    // Clean up failed partial backup directory cleanly
    try {
      fs.rmSync(backupDir, { recursive: true, force: true });
    } catch {}
    throw err;
  }
}

/**
 * Updates a checkpoint manifest after patch writes finish so rollback knows which patches
 * succeeded and their exact post-patch SHA-256 digests for concurrent-change protection.
 *
 * @param {object} checkpoint
 * @param {Map<string, { applied: boolean, appliedHash: string|null }>} postApplyStatusMap
 * @returns {object} Updated sealed checkpoint manifest
 */
export function finalizeCheckpointPostApply(checkpoint, postApplyStatusMap) {
  const canonicalBase = resolveCanonicalProjectRoot(checkpoint.projectDir);
  if (!CHECKPOINT_ID_PATTERN.test(checkpoint.checkpointId || '')) {
    throw new Error(`Invalid checkpoint ID "${checkpoint.checkpointId}".`);
  }

  const backupsBase = ensureSafeBackupsBaseDir(canonicalBase);
  const approvedBackupDir = path.join(backupsBase, checkpoint.checkpointId);

  const updatedSnapshots = checkpoint.snapshots.map((snap) => {
    const info = postApplyStatusMap.get(snap.targetFile);
    if (!info) return snap;
    return {
      ...snap,
      applied: info.applied,
      appliedHash: info.appliedHash,
    };
  });

  const updatedManifest = {
    ...checkpoint,
    snapshots: updatedSnapshots,
  };
  updatedManifest.manifestIntegrityHash = computeManifestIntegrityHash(updatedManifest);

  const manifestPath = path.join(approvedBackupDir, 'checkpoint-manifest.json');
  const tmpManifest = path.join(approvedBackupDir, `.tmp-manifest-${crypto.randomBytes(6).toString('hex')}`);
  const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
  const fd = fs.openSync(tmpManifest, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollowFlag, 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(updatedManifest, null, 2), 0, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpManifest, manifestPath);

  return updatedManifest;
}

/**
 * Safely loads and validates a checkpoint manifest from disk.
 * Verifies integrity digest against tampering.
 *
 * @param {string} projectDir
 * @param {string} checkpointId
 * @returns {object} Verified checkpoint manifest
 */
export function loadCheckpointManifest(projectDir, checkpointId) {
  if (!CHECKPOINT_ID_PATTERN.test(checkpointId || '')) {
    throw new Error(`Invalid checkpoint ID rejected: "${checkpointId}".`);
  }
  const canonicalBase = resolveCanonicalProjectRoot(projectDir);
  const backupsBase = ensureSafeBackupsBaseDir(canonicalBase);
  const approvedBackupDir = path.join(backupsBase, checkpointId);
  const dirStat = lstatSafe(approvedBackupDir);
  if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`Checkpoint backup directory missing or invalid: "${checkpointId}".`);
  }

  const manifestPath = path.join(approvedBackupDir, 'checkpoint-manifest.json');
  const { buffer } = safeReadFileBufferSync(manifestPath);
  const manifest = JSON.parse(buffer.toString('utf8'));

  if (!manifest.manifestIntegrityHash || computeManifestIntegrityHash(manifest) !== manifest.manifestIntegrityHash) {
    throw new Error(`Tampered checkpoint manifest detected for "${checkpointId}": integrity digest mismatch.`);
  }

  return manifest;
}

/**
 * Restores project files from a previously created checkpoint, strictly validating
 * target containment, backup path containment, backup file SHA-256 integrity,
 * manifest integrity, and preserving concurrent developer modifications made after patch apply.
 *
 * @param {object} checkpoint - Checkpoint object returned by createCheckpoint()
 * @param {object} [options]
 * @param {string} [options.projectDir] - Expected canonical project root directory
 * @param {boolean} [options.force=false] - Force overwrite even if concurrent modifications exist
 * @param {boolean} [options.preserveConcurrentChanges=true] - Prevent overwriting concurrent developer edits
 * @returns {{
 *   restored: boolean,
 *   partialRestore?: boolean,
 *   conflictDetected?: boolean,
 *   conflicts?: Array<{ targetFile: string, reason: string }>,
 *   checkpointId: string,
 *   restoredFiles: string[],
 *   error?: string
 * }}
 */
export function restoreCheckpoint(checkpoint, options = {}) {
  const { projectDir, force = false, preserveConcurrentChanges = true } = options;

  if (!checkpoint || typeof checkpoint !== 'object' || !Array.isArray(checkpoint.snapshots)) {
    throw new Error('Invalid checkpoint metadata provided for rollback.');
  }

  if (!checkpoint.checkpointId || !CHECKPOINT_ID_PATTERN.test(checkpoint.checkpointId)) {
    throw new Error(`Dangerous or invalid checkpoint ID rejected: "${checkpoint.checkpointId}".`);
  }

  const targetRootInput = projectDir || checkpoint.projectDir;
  if (!targetRootInput) {
    throw new Error('Invalid checkpoint metadata: missing projectDir.');
  }

  const canonicalBase = resolveCanonicalProjectRoot(targetRootInput);

  if (checkpoint.projectDir) {
    const manifestRoot = resolveCanonicalProjectRoot(checkpoint.projectDir);
    if (manifestRoot !== canonicalBase) {
      throw new Error(`Project root mismatch: checkpoint belongs to "${manifestRoot}", not "${canonicalBase}".`);
    }
  }

  // Verify manifest integrity if present
  if (checkpoint.manifestIntegrityHash) {
    const expectedManifestHash = computeManifestIntegrityHash(checkpoint);
    if (expectedManifestHash !== checkpoint.manifestIntegrityHash) {
      throw new Error('Tampered checkpoint manifest detected: manifest integrity digest mismatch.');
    }
  }

  // Derive approved backup directory strictly from canonical root and verified checkpointId
  const backupsBase = ensureSafeBackupsBaseDir(canonicalBase);
  const approvedBackupDir = path.join(backupsBase, checkpoint.checkpointId);

  if (checkpoint.backupDir) {
    const providedBackupDir = path.resolve(checkpoint.backupDir);
    if (providedBackupDir !== path.resolve(approvedBackupDir)) {
      throw new Error(
        `Tampered checkpoint backup directory rejected: "${checkpoint.backupDir}" does not match approved "${approvedBackupDir}".`
      );
    }
  }

  const backupDirStat = lstatSafe(approvedBackupDir);
  if (!backupDirStat || backupDirStat.isSymbolicLink() || !backupDirStat.isDirectory()) {
    throw new Error(`Checkpoint backup directory missing or compromised: "${approvedBackupDir}".`);
  }

  // Phase 1 Pre-flight Validation across ALL snapshots BEFORE mutating any disk files
  const preparedOperations = [];
  const conflicts = [];

  for (const snap of checkpoint.snapshots) {
    if (!snap || typeof snap !== 'object' || !snap.targetFile) {
      throw new Error('Corrupted snapshot entry detected in checkpoint manifest.');
    }

    // Never touch files whose patch was never applied during a partial write failure
    if (snap.applied === false) {
      continue;
    }

    const { resolvedTarget, normalizedRelPath } = assertSafeProjectRelativePathDetails(canonicalBase, snap.targetFile);

    // Never blindly trust fullTargetPath from manifest: verify exact match with derived canonical target
    if (snap.fullTargetPath && path.resolve(snap.fullTargetPath) !== path.resolve(resolvedTarget)) {
      throw new Error(
        `Tampered checkpoint snapshot rejected: fullTargetPath "${snap.fullTargetPath}" mismatches canonical target "${resolvedTarget}".`
      );
    }

    let backupBuffer = null;

    if (snap.existed) {
      const backupRel = snap.backupRelFile || normalizedRelPath;
      const expectedBackupFile = assertSafeBackupFilePath(approvedBackupDir, backupRel);

      if (snap.backupPath && path.resolve(snap.backupPath) !== path.resolve(expectedBackupFile)) {
        throw new Error(
          `Tampered checkpoint backupPath rejected: "${snap.backupPath}" mismatches approved "${expectedBackupFile}".`
        );
      }

      const bStat = lstatSafe(expectedBackupFile);
      if (!bStat || bStat.isSymbolicLink() || !bStat.isFile()) {
        throw new Error(`Missing or invalid backup file for "${normalizedRelPath}": cannot verify rollback state.`);
      }

      const { buffer } = safeReadFileBufferSync(expectedBackupFile);
      backupBuffer = buffer;

      if (!snap.originalHash || computeSha256(backupBuffer) !== snap.originalHash) {
        throw new Error(`Corrupted backup detected: SHA-256 digest mismatch for "${normalizedRelPath}".`);
      }

      if (typeof snap.fileSizeBytes === 'number' && backupBuffer.length !== snap.fileSizeBytes) {
        throw new Error(`Corrupted backup detected: size mismatch for "${normalizedRelPath}".`);
      }
    }

    // Check for concurrent developer modifications made AFTER patch apply
    if (preserveConcurrentChanges && !force && snap.appliedHash) {
      const currentStat = lstatSafe(resolvedTarget);
      if (!snap.existed) {
        if (currentStat) {
          if (currentStat.isSymbolicLink()) {
            conflicts.push({
              targetFile: normalizedRelPath,
              reason: 'Target path was replaced with a symlink/junction after remediation.',
            });
          } else {
            const { buffer: currBuf } = safeReadFileBufferSync(resolvedTarget);
            const currHash = computeSha256(currBuf);
            if (currHash !== snap.appliedHash) {
              conflicts.push({
                targetFile: normalizedRelPath,
                reason: `Newly created file "${normalizedRelPath}" was modified concurrently after patch application; refusing to delete developer changes.`,
              });
            }
          }
        }
      } else {
        if (!currentStat) {
          conflicts.push({
            targetFile: normalizedRelPath,
            reason: `Target file "${normalizedRelPath}" was deleted concurrently after patch application; refusing silent overwrite.`,
          });
        } else if (currentStat.isSymbolicLink()) {
          conflicts.push({
            targetFile: normalizedRelPath,
            reason: 'Target path was replaced with a symlink/junction after remediation.',
          });
        } else {
          const { buffer: currBuf } = safeReadFileBufferSync(resolvedTarget);
          const currHash = computeSha256(currBuf);
          if (currHash !== snap.appliedHash && currHash !== snap.originalHash) {
            conflicts.push({
              targetFile: normalizedRelPath,
              reason: `Target file "${normalizedRelPath}" was modified concurrently after patch application; refusing to overwrite developer changes.`,
            });
          }
        }
      }
    }

    preparedOperations.push({
      snap,
      resolvedTarget,
      normalizedRelPath,
      backupBuffer,
    });
  }

  // Refuse rollback if concurrent developer modifications are detected (and force is false)
  if (conflicts.length > 0) {
    return {
      restored: false,
      conflictDetected: true,
      conflicts,
      checkpointId: checkpoint.checkpointId,
      restoredFiles: [],
      error: `Rollback aborted to preserve concurrent developer changes in: ${conflicts.map((c) => c.targetFile).join(', ')}`,
    };
  }

  // Phase 2: Execute validated atomic restorations
  const restoredFiles = [];
  try {
    for (const op of preparedOperations) {
      if (!op.snap.existed) {
        const st = lstatSafe(op.resolvedTarget);
        if (st) {
          if (st.isSymbolicLink()) {
            throw new Error(`Symlink unlink rejected during rollback: "${op.normalizedRelPath}".`);
          }
          fs.unlinkSync(op.resolvedTarget);
          restoredFiles.push(op.normalizedRelPath);
        }
      } else {
        atomicWriteWithinRootSync(canonicalBase, op.normalizedRelPath, op.backupBuffer, {
          mode: op.snap.originalMode ?? undefined,
        });
        restoredFiles.push(op.normalizedRelPath);
      }
    }
  } catch (err) {
    return {
      restored: false,
      partialRestore: restoredFiles.length > 0,
      checkpointId: checkpoint.checkpointId,
      restoredFiles,
      error: `Rollback failed during restoration: ${err.message}`,
    };
  }

  return {
    restored: true,
    checkpointId: checkpoint.checkpointId,
    restoredFiles,
  };
}

/**
 * Safely removes old checkpoints exceeding age or count limits.
 * Rejects operation if .envguard/backups is a symlink/junction.
 *
 * @param {string} projectDir - Base project directory
 * @param {object} [options]
 * @param {number} [options.maxAgeMs=604800000] - Maximum checkpoint age (default: 7 days)
 * @param {number} [options.maxCheckpoints=10] - Maximum retained checkpoints (default: 10)
 * @returns {number} Count of pruned checkpoints
 */
export function cleanupCheckpoints(projectDir, { maxAgeMs = 7 * 24 * 3600 * 1000, maxCheckpoints = 10 } = {}) {
  const canonicalBase = resolveCanonicalProjectRoot(projectDir);
  const envguardDir = path.join(canonicalBase, '.envguard');
  const envguardStat = lstatSafe(envguardDir);
  if (!envguardStat) return 0;
  if (envguardStat.isSymbolicLink() || !envguardStat.isDirectory()) {
    throw new Error('Security error: ".envguard" directory is a symlink or non-directory.');
  }

  const backupsBase = path.join(envguardDir, 'backups');
  const backupsStat = lstatSafe(backupsBase);
  if (!backupsStat) return 0;
  if (backupsStat.isSymbolicLink() || !backupsStat.isDirectory()) {
    throw new Error('Security error: ".envguard/backups" directory is a symlink or non-directory.');
  }

  let prunedCount = 0;
  const entries = fs.readdirSync(backupsBase, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && CHECKPOINT_ID_PATTERN.test(e.name))
    .map((e) => {
      const dirPath = path.join(backupsBase, e.name);
      let mtime = 0;
      try {
        mtime = fs.lstatSync(dirPath).mtimeMs;
      } catch {}
      return { name: e.name, path: dirPath, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  const now = Date.now();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isTooOld = (now - entry.mtime) > maxAgeMs;
    const exceedsMax = i >= maxCheckpoints;

    if (isTooOld || exceedsMax) {
      fs.rmSync(entry.path, { recursive: true, force: true });
      prunedCount++;
    }
  }

  return prunedCount;
}
