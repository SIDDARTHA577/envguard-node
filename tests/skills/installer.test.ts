import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  installSkills,
  uninstallSkills,
  assertSafeDestination,
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

  it('safely uninstalls managed skills and cleans up empty directories', () => {
    // Install two skills
    installSkills({ skillName: 'envguard-audit', destDir: tempDir });
    installSkills({ skillName: 'envguard-setup', destDir: tempDir });

    const auditFile = path.join(tempDir, '.agents', 'skills', 'envguard-audit', 'SKILL.md');
    const setupFile = path.join(tempDir, '.agents', 'skills', 'envguard-setup', 'SKILL.md');
    expect(fs.existsSync(auditFile)).toBe(true);
    expect(fs.existsSync(setupFile)).toBe(true);

    // Uninstall single skill
    const uninstOne = uninstallSkills({ skillName: 'envguard-audit', destDir: tempDir });
    expect(uninstOne.success).toBe(true);
    expect(fs.existsSync(auditFile)).toBe(false);
    expect(fs.existsSync(setupFile)).toBe(true);

    // Uninstall all remaining
    const uninstAll = uninstallSkills({ all: true, destDir: tempDir });
    expect(uninstAll.success).toBe(true);
    expect(fs.existsSync(setupFile)).toBe(false);

    // Metadata file should be cleanly deleted when all skills removed
    expect(fs.existsSync(path.join(tempDir, '.envguard-skills.json'))).toBe(false);
  });
});

