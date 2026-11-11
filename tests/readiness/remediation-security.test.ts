import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  assertSafeProjectRelativePath,
  buildSafeGitignoreContent,
  cleanupCheckpoints,
  createCheckpoint,
  executeRemediationWorkflow,
  generateRemediationPatches,
  loadCheckpointManifest,
  REMEDIATION_STATUSES,
  restoreCheckpoint,
} from '../../tools/readiness-auditor.mjs';

describe('Phase 14.2 — Filesystem, Checkpoint & Remediation Security', () => {
  let rootTempDir: string;
  let projectDir: string;
  let outsideDir: string;

  beforeEach(() => {
    rootTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-sec-14-2-'));
    projectDir = path.join(rootTempDir, 'project');
    outsideDir = path.join(rootTempDir, 'outside');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(rootTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup contention
    }
  });

  describe('A. Path Containment, Symlinks, Junctions & Restore Validation', () => {
    it('rejects absolute target paths during validation, checkpointing, and restoration', () => {
      const absTarget = path.join(outsideDir, 'target.txt');
      fs.writeFileSync(absTarget, 'untouched', 'utf8');

      expect(() => assertSafeProjectRelativePath(projectDir, absTarget)).toThrow(/Path traversal rejected/);

      expect(() =>
        createCheckpoint(projectDir, [{ targetFile: absTarget, action: 'modify', proposedContent: 'x' }])
      ).toThrow(/Path traversal rejected/);

      // Craft checkpoint pointing at absolute path via snapshots with existing backup dir
      fs.mkdirSync(path.join(projectDir, '.envguard', 'backups', 'checkpoint-1000-abcdef'), { recursive: true });
      expect(() =>
        restoreCheckpoint(
          {
            checkpointId: 'checkpoint-1000-abcdef',
            projectDir,
            snapshots: [{ targetFile: absTarget, existed: false }],
          },
          { projectDir }
        )
      ).toThrow(/Path traversal rejected/);

      expect(fs.readFileSync(absTarget, 'utf8')).toBe('untouched');
    });

    it('rejects relative directory traversal during both creation and restoration', () => {
      const escapedFile = path.join(outsideDir, 'sensitive.txt');
      fs.writeFileSync(escapedFile, 'do-not-delete', 'utf8');

      expect(() => assertSafeProjectRelativePath(projectDir, '../outside/sensitive.txt')).toThrow(
        /Path traversal rejected/
      );

      fs.mkdirSync(path.join(projectDir, '.envguard', 'backups', 'checkpoint-1000-abcdef'), { recursive: true });
      expect(() =>
        restoreCheckpoint(
          {
            checkpointId: 'checkpoint-1000-abcdef',
            projectDir,
            snapshots: [{ targetFile: '../outside/sensitive.txt', existed: false }],
          },
          { projectDir }
        )
      ).toThrow(/Path traversal rejected/);

      expect(fs.existsSync(escapedFile)).toBe(true);
      expect(fs.readFileSync(escapedFile, 'utf8')).toBe('do-not-delete');
    });

    it('rejects internal .envguard/backups target paths so patches cannot overwrite checkpoint metadata', () => {
      expect(() =>
        assertSafeProjectRelativePath(projectDir, '.envguard/backups/checkpoint-1/checkpoint-manifest.json')
      ).toThrow(/Unsafe target path rejected/);
    });

    it('rejects symlink escapes during checkpoint creation and restoration', () => {
      const outsideSecret = path.join(outsideDir, 'secret-target.txt');
      fs.writeFileSync(outsideSecret, 'original-outside', 'utf8');
      const linkInProject = path.join(projectDir, 'linked.txt');

      let symlinkCreated = false;
      try {
        fs.symlinkSync(outsideSecret, linkInProject, 'file');
        symlinkCreated = true;
      } catch {
        // Non-elevated Windows without Developer Mode may disallow file symlinks
      }

      if (symlinkCreated) {
        fs.mkdirSync(path.join(projectDir, '.envguard', 'backups', 'checkpoint-1000-abcdef'), { recursive: true });
        expect(() => assertSafeProjectRelativePath(projectDir, 'linked.txt')).toThrow(/Symlink\/junction traversal rejected/);
        expect(() =>
          createCheckpoint(projectDir, [{ targetFile: 'linked.txt', action: 'modify', proposedContent: 'pwned' }])
        ).toThrow(/Symlink\/junction traversal rejected/);
        expect(() =>
          restoreCheckpoint(
            {
              checkpointId: 'checkpoint-1000-abcdef',
              projectDir,
              snapshots: [{ targetFile: 'linked.txt', existed: false }],
            },
            { projectDir }
          )
        ).toThrow(/Symlink\/junction traversal rejected/);
      }

      expect(fs.readFileSync(outsideSecret, 'utf8')).toBe('original-outside');
    });

    it('rejects directory junctions / directory symlinks escaping project root (Windows junction & POSIX dir symlink)', () => {
      const outsideSub = path.join(outsideDir, 'sub');
      fs.mkdirSync(outsideSub, { recursive: true });
      const outsideTarget = path.join(outsideSub, 'pwned.txt');
      fs.writeFileSync(outsideTarget, 'safe-outside', 'utf8');

      const linkedSub = path.join(projectDir, 'escaped-dir');
      let dirLinkCreated = false;
      const typesToTry: Array<'junction' | 'dir'> = process.platform === 'win32' ? ['junction', 'dir'] : ['dir'];
      for (const linkType of typesToTry) {
        try {
          fs.symlinkSync(outsideSub, linkedSub, linkType);
          dirLinkCreated = true;
          break;
        } catch {
          // Try fallback link primitive
        }
      }

      if (dirLinkCreated) {
        fs.mkdirSync(path.join(projectDir, '.envguard', 'backups', 'checkpoint-1000-abcdef'), { recursive: true });
        expect(() => assertSafeProjectRelativePath(projectDir, 'escaped-dir/pwned.txt')).toThrow(
          /Symlink\/junction traversal rejected/
        );
        expect(() =>
          createCheckpoint(projectDir, [
            { targetFile: 'escaped-dir/pwned.txt', action: 'modify', proposedContent: 'corrupt' },
          ])
        ).toThrow(/Symlink\/junction traversal rejected/);
        expect(() =>
          restoreCheckpoint(
            {
              checkpointId: 'checkpoint-1000-abcdef',
              projectDir,
              snapshots: [{ targetFile: 'escaped-dir/pwned.txt', existed: false }],
            },
            { projectDir }
          )
        ).toThrow(/Symlink\/junction traversal rejected/);
      }

      expect(fs.readFileSync(outsideTarget, 'utf8')).toBe('safe-outside');
    });

    it('rejects tampered checkpoint manifests with manipulated fullTargetPath or backupPath or digest', () => {
      const configPath = path.join(projectDir, 'app.json');
      fs.writeFileSync(configPath, '{"v":1}\n', 'utf8');
      const unrelatedOutside = path.join(outsideDir, 'unrelated.txt');
      fs.writeFileSync(unrelatedOutside, 'unrelated-intact', 'utf8');

      const cp = createCheckpoint(projectDir, [{ targetFile: 'app.json', action: 'modify', proposedContent: '{"v":2}' }]);

      // Case 1: Tamper manifest fullTargetPath to unrelated file outside project
      const tamperedTarget = structuredClone(cp);
      tamperedTarget.snapshots[0].fullTargetPath = unrelatedOutside;
      expect(() => restoreCheckpoint(tamperedTarget)).toThrow(/Tampered checkpoint/);

      // Case 2: Tamper backupDir in manifest
      const tamperedBackupDir = structuredClone(cp);
      tamperedBackupDir.backupDir = outsideDir;
      expect(() => restoreCheckpoint(tamperedBackupDir)).toThrow(/Tampered checkpoint/);

      // Case 3: Tamper snapshot originalHash on disk and load manifest
      const manifestPath = path.join(cp.backupDir, 'checkpoint-manifest.json');
      const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      diskManifest.snapshots[0].fileSizeBytes = 999999;
      fs.writeFileSync(manifestPath, JSON.stringify(diskManifest, null, 2));
      expect(() => loadCheckpointManifest(projectDir, cp.checkpointId)).toThrow(/Tampered checkpoint manifest/);
      expect(() => restoreCheckpoint(diskManifest)).toThrow(/Tampered checkpoint manifest/);

      expect(fs.readFileSync(unrelatedOutside, 'utf8')).toBe('unrelated-intact');
    });

    it('detects corrupted backups and missing backups before touching project files', () => {
      const fileA = path.join(projectDir, 'a.txt');
      const fileB = path.join(projectDir, 'b.txt');
      fs.writeFileSync(fileA, 'orig-a\n', 'utf8');
      fs.writeFileSync(fileB, 'orig-b\n', 'utf8');

      const cp = createCheckpoint(projectDir, [
        { targetFile: 'a.txt', action: 'modify', proposedContent: 'mod-a\n' },
        { targetFile: 'b.txt', action: 'modify', proposedContent: 'mod-b\n' },
      ]);

      fs.writeFileSync(fileA, 'mod-a\n', 'utf8');
      fs.writeFileSync(fileB, 'mod-b\n', 'utf8');

      // Corrupt backup for b.txt: MUST fail in pre-flight BEFORE modifying a.txt
      const backupB = path.join(cp.backupDir, 'b.txt');
      fs.writeFileSync(backupB, 'CORRUPTED_DATA', 'utf8');
      expect(() => restoreCheckpoint(cp)).toThrow(/Corrupted backup detected/);
      expect(fs.readFileSync(fileA, 'utf8')).toBe('mod-a\n');

      // Delete backup for b.txt: MUST fail with missing backup error rather than silently returning restored: true
      fs.rmSync(backupB);
      expect(() => restoreCheckpoint(cp)).toThrow(/Missing or invalid backup file/);
      expect(fs.readFileSync(fileA, 'utf8')).toBe('mod-a\n');
    });

    it('rejects backup directory symlinks or junctions during create, restore, and cleanup', () => {
      const envguardDir = path.join(projectDir, '.envguard');
      fs.mkdirSync(envguardDir, { recursive: true });
      const backupsLink = path.join(envguardDir, 'backups');

      let linkCreated = false;
      const typesToTry: Array<'junction' | 'dir'> = process.platform === 'win32' ? ['junction', 'dir'] : ['dir'];
      for (const linkType of typesToTry) {
        try {
          fs.symlinkSync(outsideDir, backupsLink, linkType);
          linkCreated = true;
          break;
        } catch {
          // Try next symlink type if restricted by host
        }
      }

      if (linkCreated) {
        fs.writeFileSync(path.join(projectDir, 'a.txt'), 'hi', 'utf8');
        expect(() => createCheckpoint(projectDir, [{ targetFile: 'a.txt', action: 'modify', proposedContent: 'x' }])).toThrow(
          /backup/i
        );
        expect(() => cleanupCheckpoints(projectDir)).toThrow(/symlink/i);
      }
    });
  });

  describe('B. Concurrent-Change Protection, Partial Failures & Rollback Safety', () => {
    it('refuses to overwrite files modified concurrently between dry-run proposal and patch apply', () => {
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"concurrent-app","scripts":{"build":"echo ok"}}');
      fs.writeFileSync(path.join(projectDir, '.gitignore'), 'dist/\n');
      fs.writeFileSync(path.join(projectDir, 'index.js'), 'const port = process.env.PORT;\n');

      // Step 1: Dry-run proposals captured by developer
      const preview = executeRemediationWorkflow({ projectDir, applyFix: false });
      expect(preview.status).toBe(REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL);
      expect(preview.patches.length).toBeGreaterThanOrEqual(2);

      // Step 2: Another developer modifies .gitignore concurrently before approval executes!
      const developerEdit = 'dist/\n# Team custom rule\ncustom-secrets/\n';
      fs.writeFileSync(path.join(projectDir, '.gitignore'), developerEdit, 'utf8');

      // Step 3: Attempt to apply previously previewed patches
      const applyRes = executeRemediationWorkflow({
        projectDir,
        applyFix: true,
        patches: preview.patches,
        baselineReport: undefined,
      });

      expect(applyRes.status).toBe(REMEDIATION_STATUSES.CONFLICT);
      expect(applyRes.applied).toBe(false);
      expect(applyRes.conflictDetected).toBe(true);
      expect(applyRes.conflicts.some((c: { targetFile: string }) => c.targetFile === '.gitignore')).toBe(true);

      // Concurrent edit and other files remain untouched
      expect(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8')).toBe(developerEdit);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(false);
    });

    it('rolls back earlier writes cleanly after a partial failure during multi-file patch application', () => {
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"partial-app","scripts":{"build":"echo ok","test":"echo ok"}}');
      fs.writeFileSync(path.join(projectDir, '.gitignore'), 'dist/\n');
      fs.writeFileSync(path.join(projectDir, 'index.js'), 'const key = process.env.API_KEY;\n');

      const preview = executeRemediationWorkflow({ projectDir, applyFix: false });
      expect(preview.patches.length).toBeGreaterThanOrEqual(2);

      // Simulate crash while writing the 2nd patch
      const res = executeRemediationWorkflow({
        projectDir,
        applyFix: true,
        patches: preview.patches,
        writeHook: (_patch: unknown, index: number) => {
          if (index === 1) {
            throw new Error('Simulated disk I/O error on second patch');
          }
        },
      });

      expect(res.status).toBe(REMEDIATION_STATUSES.FAILED);
      expect(res.applied).toBe(false);
      expect(res.reverted).toBe(true);

      // First patch must be completely rolled back!
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(false);
      expect(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8')).toBe('dist/\n');
    });

    it('preserves concurrent developer modifications made after patch apply during rollback (modified & newly created files)', () => {
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"post-apply-app","scripts":{"build":"echo ok","test":"echo ok"}}');
      fs.writeFileSync(path.join(projectDir, '.gitignore'), 'dist/\n');
      fs.writeFileSync(path.join(projectDir, 'app.js'), 'const x = process.env.PORT;\n');

      const applyRes = executeRemediationWorkflow({
        projectDir,
        applyFix: true,
        allowExec: false,
      });

      expect(applyRes.status).toBe(REMEDIATION_STATUSES.REMEDIATED_AND_VERIFIED);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);

      // Developer edits BOTH the newly created .env.example and modified .gitignore AFTER patch apply
      const customTemplateEdit = '# Developer edited after remediation\nPORT=4000\nCUSTOM_FLAG=true\n';
      fs.writeFileSync(path.join(projectDir, '.env.example'), customTemplateEdit, 'utf8');

      // Rollback must refuse to silently delete/overwrite developer's post-patch work!
      const rollback = restoreCheckpoint(applyRes.checkpoint, { projectDir });
      expect(rollback.restored).toBe(false);
      expect(rollback.conflictDetected).toBe(true);
      expect(rollback.conflicts?.length).toBeGreaterThan(0);

      // Verify developer's edits were completely preserved
      expect(fs.readFileSync(path.join(projectDir, '.env.example'), 'utf8')).toBe(customTemplateEdit);
    });
  });

  describe('C. Backup Security, Platform Permissions & Secret Protection', () => {
    it('omits sensitive backup file content from manifest and sets appropriate platform security metadata', () => {
      const secretEnvPath = path.join(projectDir, '.env');
      const rawSecret = 'STRIPE_LIVE_SECRET=sk_live_SUPER_CONFIDENTIAL_TOKEN_987654321';
      fs.writeFileSync(secretEnvPath, rawSecret, 'utf8');

      const cp = createCheckpoint(projectDir, [{ targetFile: '.env', action: 'modify', proposedContent: 'REDACTED' }]);
      const manifestRaw = fs.readFileSync(path.join(cp.backupDir, 'checkpoint-manifest.json'), 'utf8');

      expect(manifestRaw).not.toContain(rawSecret);
      expect(manifestRaw).not.toContain('sk_live_SUPER_CONFIDENTIAL');
      expect(manifestRaw).not.toContain('originalContent');

      if (process.platform === 'win32') {
        expect(cp.security.posixModeEnforced).toBe(false);
        expect(cp.security.permissionWarning).toContain('NTFS');
      } else {
        const dirMode = fs.statSync(cp.backupDir).mode & 0o777;
        const manifestMode = fs.statSync(path.join(cp.backupDir, 'checkpoint-manifest.json')).mode & 0o777;
        expect(dirMode).toBe(0o700);
        expect(manifestMode).toBe(0o600);
      }
    });
  });

  describe('D. Generated .gitignore Correctness & Real Git Check-Ignore Verification', () => {
    it('excludes secrets and .envguard/ runtime dirs while allowing !.env.example and normal project files', () => {
      // Initialize real disposable Git repository
      execFileSync('git', ['init'], { cwd: projectDir, stdio: 'ignore' });

      const content = buildSafeGitignoreContent('dist/\n', true);
      fs.writeFileSync(path.join(projectDir, '.gitignore'), content, 'utf8');

      // Must contain negation pattern after .env.* and history note
      expect(content).toContain('.env\n');
      expect(content).toContain('.env.*\n!.env.example\n');
      expect(content).toContain('.envguard/backups/');
      expect(content).toContain('.envguard/checkpoints/');
      expect(content).toContain('.envguard/reports/');
      expect(content).toContain('.envguard/cache/');
      expect(content).toContain('does not remove already-tracked secrets from Git history');

      // Real git check-ignore verification
      const checkIgnored = (relPath: string): boolean => {
        try {
          execFileSync('git', ['check-ignore', '-q', relPath], { cwd: projectDir });
          return true;
        } catch {
          return false;
        }
      };

      // Ignored secret & runtime files
      expect(checkIgnored('.env')).toBe(true);
      expect(checkIgnored('.env.local')).toBe(true);
      expect(checkIgnored('.env.production')).toBe(true);
      expect(checkIgnored('server.key')).toBe(true);
      expect(checkIgnored('.envguard/backups/checkpoint-1/checkpoint-manifest.json')).toBe(true);
      expect(checkIgnored('.envguard/checkpoints/cp.json')).toBe(true);
      expect(checkIgnored('.envguard/reports/report.json')).toBe(true);
      expect(checkIgnored('.envguard/cache/state.json')).toBe(true);

      // Must NOT ignore safe template or legitimate source files!
      expect(checkIgnored('.env.example')).toBe(false);
      expect(checkIgnored('src/index.ts')).toBe(false);
      expect(checkIgnored('package.json')).toBe(false);
      expect(checkIgnored('README.md')).toBe(false);
    });

    it('rejects traversal finding targets during patch generation and records baseline hashes', () => {
      fs.writeFileSync(path.join(projectDir, '.gitignore'), 'dist/\n', 'utf8');
      const patches = generateRemediationPatches(
        projectDir,
        [
          { id: 'ENV-001', status: 'FAIL', severity: 'high', targetPath: '../../escaped' },
          { id: 'ENV-002', status: 'FAIL', severity: 'critical', targetPath: '.' },
        ],
        ['.gitignore']
      );

      expect(patches.length).toBe(1);
      expect(patches[0].targetFile).toBe('.gitignore');
      expect(patches[0].expectedExisted).toBe(true);
      expect(patches[0].expectedOriginalHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
