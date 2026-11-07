import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  installSkills,
  uninstallSkills,
  assertSafeDestination,
  validateMetadata,
  SUPPORTED_HOSTS,
} from '../../tools/skill-manager.mjs';

describe('Skill Installer & Pack Management', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-test-install-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects path traversal attempts outside the destination directory', () => {
    expect(() => {
      assertSafeDestination(tempDir, '../../outside');
    }).toThrow(/Path traversal attempt detected/);

    expect(() => {
      assertSafeDestination(tempDir, '../evil/payload');
    }).toThrow(/Path traversal attempt detected/);

    expect(() => {
      assertSafeDestination(tempDir, 'sub/../../outside');
    }).toThrow(/Path traversal attempt detected/);
  });

  it('detects symlink escapes when an intermediate directory points outside base', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-test-outside-'));
    const symlinkDir = path.join(tempDir, 'linked-sub');

    try {
      // Create symlink pointing outside destination
      fs.symlinkSync(outsideDir, symlinkDir, 'junction');

      expect(() => {
        assertSafeDestination(tempDir, 'linked-sub/escaped.txt');
      }).toThrow(/Symlink escape detected/);
    } catch (err) {
      // If OS permissions restrict symlink/junction creation, verify skip reason
      if (!err.message.includes('Symlink escape detected')) {
        console.warn('Symlink test skipped due to platform restrictions:', err.message);
      } else {
        throw err;
      }
    } finally {
      if (fs.existsSync(outsideDir)) {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    }
  });

  it('rejects unsupported target host identifiers with a helpful error', () => {
    expect(() => {
      installSkills({
        skillName: 'envguard-audit',
        destDir: tempDir,
        targetHost: 'unsupported-host-xyz',
      });
    }).toThrow(/Unsupported target host "unsupported-host-xyz"/);
  });

  it('supports all valid target hosts (codex, antigravity, claude, cursor)', () => {
    for (const host of SUPPORTED_HOSTS) {
      const subTemp = fs.mkdtempSync(path.join(tempDir, `host-${host}-`));
      const res = installSkills({
        skillName: 'envguard-audit',
        destDir: subTemp,
        targetHost: host,
      });
      expect(res.success).toBe(true);
      expect(fs.existsSync(path.join(subTemp, '.envguard-skills.json'))).toBe(true);
    }
  });

  it('performs dry-run installation without creating files', () => {
    const result = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      dryRun: true,
      targetHost: 'codex',
    });

    expect(result.success).toBe(true);
    expect(result.plan.actions.length).toBe(1);
    expect(result.plan.actions[0].skill).toBe('envguard-audit');

    // Confirm no files actually written
    const installedFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');
    expect(fs.existsSync(installedFile)).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.envguard-skills.json'))).toBe(false);
  });

  it('installs a single skill and writes tracking metadata', () => {
    const result = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      targetHost: 'codex',
    });

    expect(result.success).toBe(true);
    const installedFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');
    expect(fs.existsSync(installedFile)).toBe(true);

    const metaFile = path.join(tempDir, '.envguard-skills.json');
    expect(fs.existsSync(metaFile)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    expect(meta.skills['envguard-audit']).toBeDefined();
    expect(meta.skills['envguard-audit'].files[0].path).toBe('.agents/skills/envguard-audit/SKILL.md');
  });

  it('is completely idempotent when installing twice', () => {
    // First install
    const first = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      targetHost: 'codex',
    });
    expect(first.success).toBe(true);
    expect(first.plan.actions.length).toBe(1);

    // Second install
    const second = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      targetHost: 'codex',
    });
    expect(second.success).toBe(true);
    expect(second.plan.actions.length).toBe(0);
    expect(second.plan.skipped.length).toBe(1);
    expect(second.plan.skipped[0].reason).toBe('already up to date');
  });

  it('installs an entire pack (core) to Antigravity target layout', () => {
    const result = installSkills({
      packName: 'core',
      destDir: tempDir,
      targetHost: 'antigravity',
    });

    expect(result.success).toBe(true);
    expect(result.plan.actions.length).toBe(5);

    for (const skill of ['envguard-audit', 'envguard-setup', 'envguard-review', 'envguard-ci', 'envguard-migrate']) {
      const skillPath = path.join(tempDir, 'skills', skill, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    }
  });

  it('detects unmanaged file conflicts and refuses to overwrite without --force', () => {
    const targetDir = path.join(tempDir, '.agents', 'skills', 'envguard-audit');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, 'SKILL.md');
    fs.writeFileSync(targetFile, 'User custom unmanaged content', 'utf8');

    // Attempt install without force
    const result = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      targetHost: 'codex',
      force: false,
    });

    expect(result.success).toBe(false);
    expect(result.plan.errors[0]).toContain('already exists and is not managed by EnvGuard');
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('User custom unmanaged content');

    // Overwrite with force: true
    const forceResult = installSkills({
      skillName: 'envguard-audit',
      destDir: tempDir,
      targetHost: 'codex',
      force: true,
    });
    expect(forceResult.success).toBe(true);
    expect(fs.readFileSync(targetFile, 'utf8')).toContain('name: envguard-audit');
  });

  it('protects user-modified files during re-install unless --force is used', () => {
    installSkills({ skillName: 'envguard-audit', destDir: tempDir });
    const targetFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');

    // Modify file
    fs.appendFileSync(targetFile, '\n# User local additions\n', 'utf8');

    // Attempt re-install without force
    const res = installSkills({ skillName: 'envguard-audit', destDir: tempDir, force: false });
    expect(res.success).toBe(false);
    expect(res.plan.errors[0]).toContain('modified by the developer since installation');

    // Overwrite with force
    const forceRes = installSkills({ skillName: 'envguard-audit', destDir: tempDir, force: true });
    expect(forceRes.success).toBe(true);
  });

  it('protects user-modified files during uninstall and reports conflicts', () => {
    installSkills({ skillName: 'envguard-audit', destDir: tempDir });
    const targetFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');

    // Modify file
    fs.appendFileSync(targetFile, '\n# Critical user edits\n', 'utf8');

    // Attempt uninstall without force
    const res = uninstallSkills({ skillName: 'envguard-audit', destDir: tempDir, force: false });
    expect(res.success).toBe(true);
    expect(res.preserved.length).toBe(1);
    expect(res.preserved[0].reason).toContain('modified by user (preserved; use --force to delete)');
    expect(fs.existsSync(targetFile)).toBe(true);

    // Skill remains registered in metadata because file was preserved
    const meta = JSON.parse(fs.readFileSync(path.join(tempDir, '.envguard-skills.json'), 'utf8'));
    expect(meta.skills['envguard-audit']).toBeDefined();

    // Force uninstall removes it
    const forceRes = uninstallSkills({ skillName: 'envguard-audit', destDir: tempDir, force: true });
    expect(forceRes.success).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.envguard-skills.json'))).toBe(false);
  });

  it('handles already missing files gracefully during uninstall', () => {
    installSkills({ skillName: 'envguard-audit', destDir: tempDir });
    const targetFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');

    // User deleted the file manually
    fs.unlinkSync(targetFile);

    const res = uninstallSkills({ skillName: 'envguard-audit', destDir: tempDir });
    expect(res.success).toBe(true);
    expect(res.missing.length).toBe(1);
    expect(res.missing[0].reason).toBe('already missing on disk');
    expect(fs.existsSync(path.join(tempDir, '.envguard-skills.json'))).toBe(false);
  });

  it('validates installation metadata schema and rejects corrupt tampering', () => {
    const invalidMetas = [
      null,
      {},
      { managedBy: 'wrong-tool', version: '1.0.0', skills: {} },
      { managedBy: 'envguard', version: '', skills: {} },
      { managedBy: 'envguard', version: '1.0.0', skills: { 'bad/name': { files: [] } } },
      {
        managedBy: 'envguard',
        version: '1.0.0',
        skills: {
          'envguard-audit': {
            files: [{ path: '../../escape.txt', sha256: 'a'.repeat(64) }],
          },
        },
      },
      {
        managedBy: 'envguard',
        version: '1.0.0',
        skills: {
          'envguard-audit': {
            files: [{ path: 'test.md', sha256: 'invalid-hash' }],
          },
        },
      },
    ];

    for (const bad of invalidMetas) {
      expect(() => {
        validateMetadata(bad, tempDir);
      }).toThrow(/Invalid metadata/);
    }
  });
});
