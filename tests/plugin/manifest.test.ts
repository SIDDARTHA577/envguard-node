import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('EnvGuard Agent Skills Plugin & Manifest Consistency', () => {
  const rootDir = path.resolve('.');
  const packageJsonPath = path.join(rootDir, 'package.json');
  const canonicalPluginPath = path.join(rootDir, 'plugin.json');
  const claudePluginPath = path.join(rootDir, '.claude-plugin', 'plugin.json');
  const agentsManifestPath = path.join(rootDir, '.agents', 'agent.json');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  it('validates canonical Antigravity plugin.json manifest structure', () => {
    expect(fs.existsSync(canonicalPluginPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(canonicalPluginPath, 'utf8'));

    expect(manifest.name).toBe('envguard');
    expect(manifest.version).toBe(packageJson.version);
    expect(Array.isArray(manifest.suggestedPrompts)).toBe(true);
    expect(manifest.suggestedPrompts.length).toBeGreaterThan(0);
    expect(manifest.skills).toHaveLength(5);

    for (const skillDir of manifest.skills) {
      const resolved = path.resolve(rootDir, skillDir);
      expect(fs.existsSync(resolved)).toBe(true);
      const skillFile = path.join(resolved, 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
    }
  });

  it('validates Claude Code plugin manifest and prevents metadata drift', () => {
    expect(fs.existsSync(claudePluginPath)).toBe(true);
    const claudeManifest = JSON.parse(fs.readFileSync(claudePluginPath, 'utf8'));

    expect(claudeManifest.name).toBe('envguard');
    expect(claudeManifest.version).toBe(packageJson.version);
    expect(claudeManifest.skills).toHaveLength(5);

    for (const skillRel of claudeManifest.skills) {
      const resolved = path.resolve(rootDir, skillRel, 'SKILL.md');
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });

  it('validates OpenAI Codex / Agents manifest and prevents metadata drift', () => {
    expect(fs.existsSync(agentsManifestPath)).toBe(true);
    const agentsManifest = JSON.parse(fs.readFileSync(agentsManifestPath, 'utf8'));

    expect(agentsManifest.name).toBe('envguard');
    expect(agentsManifest.version).toBe(packageJson.version);
    expect(agentsManifest.skills).toHaveLength(5);

    for (const item of agentsManifest.skills) {
      const resolved = path.resolve(rootDir, item.path);
      expect(fs.existsSync(resolved)).toBe(true);
      expect(typeof item.name).toBe('string');
      expect(typeof item.description).toBe('string');
    }
  });

  it('validates that every SKILL.md file has well-formed YAML frontmatter', () => {
    const skillsDir = path.join(rootDir, 'skills');
    const skillFolders = fs.readdirSync(skillsDir);

    expect(skillFolders).toHaveLength(5);

    for (const folder of skillFolders) {
      const skillMdPath = path.join(skillsDir, folder, 'SKILL.md');
      expect(fs.existsSync(skillMdPath)).toBe(true);

      const content = fs.readFileSync(skillMdPath, 'utf8');
      expect(content.startsWith('---')).toBe(true);

      const secondDashes = content.indexOf('---', 3);
      expect(secondDashes).toBeGreaterThan(3);

      const frontmatter = content.slice(3, secondDashes);
      expect(frontmatter).toContain(`name: ${folder}`);
      expect(frontmatter).toContain('description:');
    }
  });

  it('verifies that .agents/skills/ is byte-synchronized with canonical skills/', () => {
    const canonicalDir = path.join(rootDir, 'skills');
    const codexSkillsDir = path.join(rootDir, '.agents', 'skills');

    expect(fs.existsSync(codexSkillsDir)).toBe(true);
    const canonicalFolders = fs.readdirSync(canonicalDir);

    for (const folder of canonicalFolders) {
      const canonicalFile = path.join(canonicalDir, folder, 'SKILL.md');
      const codexFile = path.join(codexSkillsDir, folder, 'SKILL.md');

      expect(fs.existsSync(codexFile)).toBe(true);

      const canonicalContent = fs.readFileSync(canonicalFile, 'utf8');
      const codexContent = fs.readFileSync(codexFile, 'utf8');

      expect(codexContent).toBe(canonicalContent);
    }
  });
});
