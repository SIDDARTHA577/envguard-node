import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadSkills,
  loadPacks,
  verifySkills,
  parseFrontmatter,
  syncSkills,
} from '../../tools/skill-manager.mjs';

describe('Skill Quality & Catalog Verification', () => {
  const rootDir = path.resolve('.');

  it('verifies that all registered packs in catalog/packs.json are valid', () => {
    const packs = loadPacks();
    expect(packs.length).toBeGreaterThan(0);

    const ids = new Set();
    for (const pack of packs) {
      expect(typeof pack.id).toBe('string');
      expect(pack.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(pack.id)).toBe(false);
      ids.add(pack.id);
      expect(typeof pack.name).toBe('string');
      expect(typeof pack.description).toBe('string');
      expect(Array.isArray(pack.skills)).toBe(true);
    }
  });

  it('verifies that all registered skills in catalog/skills.json are valid', () => {
    const skills = loadSkills();
    const packs = loadPacks();
    const packIds = new Set(packs.map((p) => p.id));
    const skillNames = new Set();

    expect(skills.length).toBeGreaterThanOrEqual(5);

    for (const skill of skills) {
      expect(typeof skill.name).toBe('string');
      expect(skill.name).toMatch(/^envguard-[a-z0-9-]+$/);
      expect(skillNames.has(skill.name)).toBe(false);
      skillNames.add(skill.name);

      expect(packIds.has(skill.pack)).toBe(true);
      expect(typeof skill.description).toBe('string');
      expect(typeof skill.canonicalDir).toBe('string');
      expect(typeof skill.version).toBe('string');
      expect(Array.isArray(skill.supportedHosts)).toBe(true);
      expect(skill.supportedHosts.length).toBeGreaterThan(0);

      // Verify triggers
      expect(typeof skill.triggers).toBe('object');
      expect(Array.isArray(skill.triggers.when)).toBe(true);
      expect(Array.isArray(skill.triggers.whenNot)).toBe(true);
      expect(Array.isArray(skill.triggers.suggestedPrompts)).toBe(true);
      expect(skill.triggers.suggestedPrompts.length).toBeGreaterThan(0);
    }
  });

  it('runs verifySkills() tool and passes all checks with zero errors', () => {
    const result = verifySkills(rootDir);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.skillCount).toBeGreaterThanOrEqual(5);
  });

  it('validates that every canonical skill has valid YAML frontmatter and required sections', () => {
    const skills = loadSkills();
    const requiredSections = [
      'When to Trigger',
      'When NOT to Trigger',
      'Supported Projects & Environments',
      'Required Tools & Permissions',
      'Expected Inputs',
      'Step-by-Step Workflow',
      'Validation Steps',
      'Expected Outputs',
      'Failure Handling',
      'Safety & Privacy Boundaries',
      'Example User Prompts',
    ];

    for (const skill of skills) {
      const skillPath = path.join(rootDir, skill.canonicalDir, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, 'utf8');
      const parsed = parseFrontmatter(content);
      expect(parsed).not.toBeNull();
      expect(parsed?.frontmatter.name).toBe(skill.name);
      expect(parsed?.frontmatter.description).toBeTruthy();

      for (const section of requiredSections) {
        expect(content).toContain(section);
      }
    }
  });

  it('ensures no hardcoded developer absolute paths or credentials in skill documentation', () => {
    const skills = loadSkills();
    for (const skill of skills) {
      const skillPath = path.join(rootDir, skill.canonicalDir, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');

      // Check for user directory paths
      expect(content).not.toMatch(/[A-Za-z]:\\Users\\[^\s\\]+/);
      expect(content).not.toMatch(/\/home\/[a-zA-Z0-9_-]+\//);

      // Check for real secret patterns (unredacted high-entropy keys)
      expect(content).not.toMatch(/ghp_[A-Za-z0-9_]{30,}/);
      expect(content).not.toMatch(/gho_[A-Za-z0-9_]{30,}/);
      expect(content).not.toMatch(/sk_live_[A-Za-z0-9_]{20,}/);
    }
  });

  it('parses complex frontmatter with multiline folded strings and colons correctly', () => {
    const testYaml = `---
name: envguard-test-complex
description: >
  This is a multiline description that spans across several lines
  and contains: colons, "quotes", and complex formatting.
tags:
  - security
  - configuration
---

# Test Body
`;
    const parsed = parseFrontmatter(testYaml);
    expect(parsed).not.toBeNull();
    expect(parsed?.frontmatter.name).toBe('envguard-test-complex');
    expect(parsed?.frontmatter.description).toContain('contains: colons, "quotes"');
    expect(parsed?.frontmatter.tags).toEqual(['security', 'configuration']);
    expect(parsed?.body).toBe('# Test Body');
  });

  it('detects and throws informative errors on invalid YAML frontmatter syntax', () => {
    const invalidYaml = `---
name: envguard-broken
description: [unclosed array
---

# Broken Body
`;
    expect(() => {
      parseFrontmatter(invalidYaml);
    }).toThrow(/YAML frontmatter syntax error/);
  });

  it('verifies that syncSkills in checkOnly mode succeeds on synchronized repository', () => {
    const res = syncSkills({ repoRoot: rootDir, checkOnly: true });
    expect(res.valid).toBe(true);
    expect(res.issues).toEqual([]);
  });
});
