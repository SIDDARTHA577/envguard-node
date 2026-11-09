import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Creates an immutable backup checkpoint for all target files targeted by remediation patches.
 * Ensures non-destructive edits and enables full instant rollback.
 *
 * @param {string} projectDir - Base project directory
 * @param {Array<object>} patches - Proposed remediation patches
 * @returns {object} Checkpoint metadata
 */
export function createCheckpoint(projectDir, patches = []) {
  const timestamp = new Date().toISOString();
  const checkpointId = `checkpoint-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const backupDir = path.join(projectDir, '.envguard', 'backups', checkpointId);

  fs.mkdirSync(backupDir, { recursive: true });

  const snapshots = [];

  for (const patch of patches) {
    const relFile = patch.targetFile;
    const targetPath = path.join(projectDir, relFile);
    const backupPath = path.join(backupDir, relFile);

    const existed = fs.existsSync(targetPath);
    let originalContent = null;

    if (existed) {
      originalContent = fs.readFileSync(targetPath, 'utf8');
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, originalContent, 'utf8');
    }

    snapshots.push({
      targetFile: relFile,
      fullTargetPath: targetPath,
      existed,
      originalContent,
      backupPath: existed ? backupPath : null,
    });
  }

  const manifest = {
    checkpointId,
    timestamp,
    projectDir,
    backupDir,
    snapshots,
  };

  const manifestPath = path.join(backupDir, 'checkpoint-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

/**
 * Restores project files from a previously created checkpoint, rolling back all applied patches.
 *
 * @param {object} checkpoint - Checkpoint object returned by createCheckpoint()
 * @returns {{ restored: boolean, restoredFiles: string[] }}
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
      // File was modified: restore original content
      let content = snap.originalContent;
      if (content === null && snap.backupPath && fs.existsSync(snap.backupPath)) {
        content = fs.readFileSync(snap.backupPath, 'utf8');
      }

      if (content !== null) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');
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
