import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Validates that a file path is strictly relative to the project directory
 * and does not attempt directory traversal or escape via symlinks/junctions.
 *
 * @param {string} projectDir - Base project directory
 * @param {string} relFile - Proposed relative file path
 * @returns {string} Fully resolved and validated safe absolute path
 * @throws {Error} If path traversal or boundary escape is detected
 */
export function assertSafeProjectRelativePath(projectDir, relFile) {
  if (!relFile || typeof relFile !== 'string') {
    throw new Error('Invalid target path: path must be a non-empty string.');
  }

  // Reject absolute paths
  if (path.isAbsolute(relFile)) {
    throw new Error(`Path traversal rejected: target path "${relFile}" must be project-relative, not absolute.`);
  }

  const resolvedBase = path.resolve(projectDir);
  const resolvedTarget = path.resolve(resolvedBase, relFile);
  const relativeFromBase = path.relative(resolvedBase, resolvedTarget);

  // Reject directory traversal escaping project base
  if (relativeFromBase.startsWith('..') || path.isAbsolute(relativeFromBase)) {
    throw new Error(`Path traversal rejected: target path "${relFile}" escapes project root boundary.`);
  }

  // Symlink & junction containment check
  if (fs.existsSync(resolvedTarget)) {
    const lstat = fs.lstatSync(resolvedTarget);
    if (lstat.isSymbolicLink()) {
      const realTarget = fs.realpathSync(resolvedTarget);
      const relReal = path.relative(resolvedBase, realTarget);
      if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
        throw new Error(`Symlink traversal rejected: target "${relFile}" points outside project root (${realTarget}).`);
      }
    }
  }

  // Check parent directories for external symlink targets
  let currentDir = path.dirname(resolvedTarget);
  while (currentDir.length >= resolvedBase.length && currentDir.startsWith(resolvedBase)) {
    if (fs.existsSync(currentDir)) {
      const dirStat = fs.lstatSync(currentDir);
      if (dirStat.isSymbolicLink()) {
        const realDir = fs.realpathSync(currentDir);
        const relRealDir = path.relative(resolvedBase, realDir);
        if (relRealDir.startsWith('..') || path.isAbsolute(relRealDir)) {
          throw new Error(`Symlink directory traversal rejected: ancestor "${currentDir}" points outside project root.`);
        }
      }
    }
    if (currentDir === resolvedBase) break;
    currentDir = path.dirname(currentDir);
  }

  return resolvedTarget;
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
 * Creates an immutable, secure backup checkpoint for all target files targeted by remediation patches.
 * Ensures non-destructive edits, verifies file integrity, enforces 0o600/0o700 permissions,
 * and strictly omits raw secret-bearing content from JSON manifests.
 *
 * @param {string} projectDir - Base project directory
 * @param {Array<object>} patches - Proposed remediation patches
 * @returns {object} Checkpoint metadata manifest
 */
export function createCheckpoint(projectDir, patches = []) {
  const safeProjectDir = path.resolve(projectDir);
  const timestamp = new Date().toISOString();
  const checkpointId = `checkpoint-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const backupDir = path.join(safeProjectDir, '.envguard', 'backups', checkpointId);

  // Restricted directory permissions (0o700)
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const snapshots = [];

  for (const patch of patches) {
    const relFile = patch.targetFile;
    const targetPath = assertSafeProjectRelativePath(safeProjectDir, relFile);
    const backupPath = path.join(backupDir, relFile);

    const existed = fs.existsSync(targetPath);
    let originalHash = null;
    let fileSizeBytes = 0;

    if (existed) {
      const originalBuffer = fs.readFileSync(targetPath);
      fileSizeBytes = originalBuffer.length;
      originalHash = computeSha256(originalBuffer);

      fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
      // Write backup with restricted file permissions (0o600)
      fs.writeFileSync(backupPath, originalBuffer, { mode: 0o600 });

      // Verify backup write integrity
      const backupBuffer = fs.readFileSync(backupPath);
      if (computeSha256(backupBuffer) !== originalHash) {
        throw new Error(`Checkpoint integrity error: backup write verification failed for "${relFile}".`);
      }
    }

    snapshots.push({
      targetFile: relFile,
      fullTargetPath: targetPath,
      existed,
      originalHash,
      fileSizeBytes,
      // Note: originalContent is intentionally NOT stored in snapshots or JSON manifest
      // to avoid embedding raw secrets/credentials in manifest files.
      backupPath: existed ? backupPath : null,
    });
  }

  const manifest = {
    checkpointId,
    timestamp,
    projectDir: safeProjectDir,
    backupDir,
    snapshots,
  };

  const manifestPath = path.join(backupDir, 'checkpoint-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });

  return manifest;
}

/**
 * Restores project files from a previously created checkpoint, rolling back all applied patches.
 * Validates integrity against SHA-256 digests before finalizing restore.
 *
 * @param {object} checkpoint - Checkpoint object returned by createCheckpoint()
 * @returns {{ restored: boolean, checkpointId: string, restoredFiles: string[] }}
 */
export function restoreCheckpoint(checkpoint) {
  if (!checkpoint || !Array.isArray(checkpoint.snapshots)) {
    throw new Error('Invalid checkpoint object provided for rollback.');
  }

  const restoredFiles = [];

  for (const snap of checkpoint.snapshots) {
    const targetPath = snap.fullTargetPath;

    if (!snap.existed) {
      // File was created by remediation: delete it to restore pristine state
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true });
        restoredFiles.push(snap.targetFile);
      }
    } else {
      // File existed prior to patch: restore content from secure backup file
      if (snap.backupPath && fs.existsSync(snap.backupPath)) {
        const backupBuffer = fs.readFileSync(snap.backupPath);
        // Verify backup integrity
        if (snap.originalHash && computeSha256(backupBuffer) !== snap.originalHash) {
          throw new Error(`Corrupted backup detected: SHA-256 digest mismatch for "${snap.targetFile}".`);
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, backupBuffer);
        restoredFiles.push(snap.targetFile);
      }
    }
  }

  return {
    restored: true,
    checkpointId: checkpoint.checkpointId,
    restoredFiles,
  };
}

/**
 * Safely removes old checkpoints exceeding age or count limits.
 *
 * @param {string} projectDir - Base project directory
 * @param {object} [options]
 * @param {number} [options.maxAgeMs=604800000] - Maximum checkpoint age (default: 7 days)
 * @param {number} [options.maxCheckpoints=10] - Maximum retained checkpoints (default: 10)
 * @returns {number} Count of pruned checkpoints
 */
export function cleanupCheckpoints(projectDir, { maxAgeMs = 7 * 24 * 3600 * 1000, maxCheckpoints = 10 } = {}) {
  const backupsBase = path.join(path.resolve(projectDir), '.envguard', 'backups');
  if (!fs.existsSync(backupsBase)) return 0;

  let prunedCount = 0;
  try {
    const entries = fs.readdirSync(backupsBase, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('checkpoint-'))
      .map((e) => {
        const dirPath = path.join(backupsBase, e.name);
        let mtime = 0;
        try {
          mtime = fs.statSync(dirPath).mtimeMs;
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
  } catch {
    // Ignore cleanup errors
  }

  return prunedCount;
}
