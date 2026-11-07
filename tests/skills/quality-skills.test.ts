import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadSkills,
  loadPacks,
  verifySkills,
  parseFrontmatter,
  REQUIRED_SECTIONS,
} from '../../tools/skill-manager.mjs';

interface TokenSpec {
  tokens?: {
    spacing?: { base?: number; scale?: Record<string, string> };
    color?: { semantic?: Record<string, string>; surface?: Record<string, string> };
    breakpoints?: Record<string, string>;
    typography?: { fontSize?: Record<string, { size?: string; lineHeight?: string }> };
  };
}

interface OpenApiSpec {
  openapi?: string;
  paths?: Record<string, Record<string, { responses?: Record<string, { description?: string }> }>>;
  components?: { schemas?: Record<string, unknown> };
}

describe('Phase 2B Engineering Quality Skills & Fixture Evaluations', () => {
  const rootDir = path.resolve('.');
  const qualitySkills = [
    'envguard-ui-design',
    'envguard-api-design',
    'envguard-code-review',
    'envguard-accessibility',
  ];

  it('verifies that all 4 Phase 2B skills are registered in catalog/skills.json and catalog/packs.json', () => {
    const skills = loadSkills(rootDir);
    const packs = loadPacks(rootDir);

    const fullstackPack = packs.find((p) => p.id === 'fullstack');
    expect(fullstackPack).toBeDefined();

    for (const skillName of qualitySkills) {
      const found = skills.find((s) => s.name === skillName);
      expect(found).toBeDefined();
      expect(found?.pack).toBe('fullstack');
      expect(fullstackPack?.skills).toContain(skillName);
      expect(Array.isArray(found?.triggers.when)).toBe(true);
      expect(Array.isArray(found?.triggers.whenNot)).toBe(true);
      expect(Array.isArray(found?.triggers.suggestedPrompts)).toBe(true);
    }
  });

  it('validates that each canonical skill file exists, has valid frontmatter, and all 11 required sections', () => {
    const skills = loadSkills(rootDir);

    for (const skillName of qualitySkills) {
      const skillMeta = skills.find((s) => s.name === skillName);
      expect(skillMeta).toBeDefined();

      const skillFilePath = path.join(rootDir, skillMeta!.canonicalDir, 'SKILL.md');
      expect(fs.existsSync(skillFilePath)).toBe(true);

      const content = fs.readFileSync(skillFilePath, 'utf8');
      const parsed = parseFrontmatter(content);
      expect(parsed).not.toBeNull();
      expect(parsed?.frontmatter.name).toBe(skillName);

      const descLen = parsed?.frontmatter.description?.length ?? 0;
      expect(descLen).toBeGreaterThanOrEqual(20);
      expect(descLen).toBeLessThanOrEqual(500);

      // Verify all 11 required sections are present
      for (const section of REQUIRED_SECTIONS) {
        expect(content).toContain(`## ${section}`);
      }

      // Check synchronization with .agents/skills/
      const syncedPath = path.join(rootDir, '.agents', 'skills', skillName, 'SKILL.md');
      expect(fs.existsSync(syncedPath)).toBe(true);
      const syncedContent = fs.readFileSync(syncedPath, 'utf8');
      expect(syncedContent.replace(/\r\n/g, '\n').trim()).toBe(content.replace(/\r\n/g, '\n').trim());
    }
  });

  it('runs verifySkills() and reports 100% validity with zero errors across all registered skills', () => {
    const result = verifySkills(rootDir);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.skillCount).toBeGreaterThanOrEqual(14);
  });

  describe('Positive and Negative Trigger Routing Evaluations', () => {
    const skills = loadSkills(rootDir);

    it('correctly routes UI design queries and rejects backend database migration tasks', () => {
      const skill = skills.find((s) => s.name === 'envguard-ui-design')!;
      const positiveQuery = 'Defining, auditing, or refactoring design tokens';
      const negativeQuery = 'Writing backend Express routes or SQL database queries';

      expect(skill.triggers.when.some((t) => t.includes(positiveQuery))).toBe(true);
      expect(skill.triggers.whenNot.some((t) => t.includes(negativeQuery))).toBe(true);
    });

    it('correctly routes API design queries and rejects client-side JSX styling tasks', () => {
      const skill = skills.find((s) => s.name === 'envguard-api-design')!;
      expect(skill.triggers.when.some((t) => t.includes('RESTful API endpoints'))).toBe(true);
      expect(skill.triggers.whenNot.some((t) => t.includes('frontend CSS layouts'))).toBe(true);
    });

    it('correctly routes Code Review queries and rejects initial architecture planning tasks', () => {
      const skill = skills.find((s) => s.name === 'envguard-code-review')!;
      expect(skill.triggers.when.some((t) => t.includes('Reviewing pull requests'))).toBe(true);
      expect(skill.triggers.whenNot.some((t) => t.includes('Drafting initial system architecture'))).toBe(true);
    });

    it('correctly routes Accessibility queries and rejects server-side business logic tasks', () => {
      const skill = skills.find((s) => s.name === 'envguard-accessibility')!;
      expect(skill.triggers.when.some((t) => t.includes('WCAG 2.1/2.2 AA compliance'))).toBe(true);
      expect(skill.triggers.whenNot.some((t) => t.includes('server-side Node.js business logic'))).toBe(true);
    });
  });

  describe('UI Design Fixture Evaluation (envguard-ui-design)', () => {
    const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'quality', 'ui-design');

    function auditTokens(tokenObj: TokenSpec): { valid: boolean; issues: string[] } {
      const issues: string[] = [];
      const tokens = tokenObj.tokens;
      if (!tokens) {
        issues.push('Missing root tokens object');
        return { valid: false, issues };
      }

      // Check modular spacing scale
      if (!tokens.spacing || !tokens.spacing.scale || !tokens.spacing.base) {
        issues.push('Missing modular spacing scale with defined base unit');
      }

      // Check semantic color mappings
      if (!tokens.color || !tokens.color.semantic || !tokens.color.surface) {
        issues.push('Missing semantic intent or surface tokens');
      }

      // Check responsive breakpoints
      if (!tokens.breakpoints || !tokens.breakpoints.sm || !tokens.breakpoints.lg) {
        issues.push('Missing standardized responsive breakpoints (sm, lg)');
      }

      // Check typography line-height pairing
      if (tokens.typography?.fontSize) {
        for (const [key, val] of Object.entries(tokens.typography.fontSize)) {
          if (!val.size || !val.lineHeight) {
            issues.push(`Typography scale "${key}" missing paired lineHeight`);
          }
        }
      } else {
        issues.push('Missing typography font size scale');
      }

      return { valid: issues.length === 0, issues };
    }

    it('evaluates correct tokens fixture and confirms comprehensive design tokens', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'tokens.correct.json'), 'utf8')) as TokenSpec;
      const result = auditTokens(raw);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('evaluates defective tokens fixture and flags missing scale, surface, and breakpoints', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'tokens.defective.json'), 'utf8')) as TokenSpec;
      const result = auditTokens(raw);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing modular spacing scale with defined base unit');
      expect(result.issues).toContain('Missing semantic intent or surface tokens');
      expect(result.issues).toContain('Missing standardized responsive breakpoints (sm, lg)');
    });
  });

  describe('API Design Fixture Evaluation (envguard-api-design)', () => {
    const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'quality', 'api-design');

    function auditApiContract(spec: OpenApiSpec): { valid: boolean; violations: string[] } {
      const violations: string[] = [];

      if (!spec.openapi || !spec.paths) {
        violations.push('Invalid OpenAPI document structure');
        return { valid: false, violations };
      }

      // Check path naming for action verbs
      for (const p of Object.keys(spec.paths)) {
        if (/get|create|delete|update|find/i.test(p)) {
          violations.push(`RPC action verb found in REST path: "${p}"`);
        }
      }

      // Check RFC 7807 problem details in components
      const schemas = spec.components?.schemas || {};
      const hasProblemDetails = Object.keys(schemas).some(
        (key) => key.toLowerCase().includes('problemdetail') || key.toLowerCase().includes('error')
      );
      if (!hasProblemDetails) {
        violations.push('Missing RFC 7807 Problem Details schema in components');
      }

      // Check 200 responses for anti-pattern error descriptions
      for (const [pathStr, methods] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          const resp200 = op.responses?.['200'];
          if (resp200?.description && /error|failed/i.test(resp200.description)) {
            violations.push(`Path "${pathStr}" [${method}] returns errors within 200 OK`);
          }
        }
      }

      return { valid: violations.length === 0, violations };
    }

    it('evaluates correct OpenAPI contract and confirms standard REST semantics', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'contract.correct.json'), 'utf8')) as OpenApiSpec;
      const result = auditApiContract(raw);
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('evaluates defective API contract and flags action verbs, missing RFC 7807, and 200 error payloads', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'contract.defective.json'), 'utf8')) as OpenApiSpec;
      const result = auditApiContract(raw);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('RPC action verb found in REST path'))).toBe(true);
      expect(result.violations).toContain('Missing RFC 7807 Problem Details schema in components');
      expect(result.violations.some((v) => v.includes('returns errors within 200 OK'))).toBe(true);
    });
  });

  describe('Code Review Fixture Evaluation (envguard-code-review)', () => {
    const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'quality', 'code-review');

    function auditCodeSource(source: string): { clean: boolean; findings: string[] } {
      const findings: string[] = [];

      // Check for raw SQL injection string concatenation
      if (/(WHERE|SELECT|INSERT|UPDATE).*\+.*['"]/i.test(source) || /raw\(.*query.*\)/i.test(source)) {
        findings.push('SQL Injection Risk: unparameterized query concatenation detected');
      }

      // Check for ReDoS regex
      if (/(\([a-zA-Z0-9_\-+*]+\)\+)+/.test(source) || /\(\[a-zA-Z0-9\]\+\)\+/.test(source)) {
        findings.push('ReDoS Vulnerability: nested quantifiers detected in regular expression');
      }

      // Check for unhandled async in Array.forEach
      if (/forEach\(\s*async/i.test(source)) {
        findings.push('Unhandled Promise / Concurrency Hazard: async callback inside forEach');
      }

      // Check for unbounded global cache
      if (/globalCache:\s*Record<string,\s*any>\s*=\s*\{\}/i.test(source) && !/evict|MAX_CACHE_SIZE|delete/i.test(source)) {
        findings.push('Memory Leak Risk: unbounded module-level cache without eviction');
      }

      return { clean: findings.length === 0, findings };
    }

    it('evaluates clean service code and finds zero high-severity issues', () => {
      const source = fs.readFileSync(path.join(fixtureDir, 'service.correct.ts'), 'utf8');
      const result = auditCodeSource(source);
      expect(result.clean).toBe(true);
      expect(result.findings).toEqual([]);
    });

    it('evaluates defective service code and catches SQL injection, ReDoS, memory leak, and async forEach', () => {
      const source = fs.readFileSync(path.join(fixtureDir, 'service.defective.txt'), 'utf8');
      const result = auditCodeSource(source);
      expect(result.clean).toBe(false);
      expect(result.findings).toContain('SQL Injection Risk: unparameterized query concatenation detected');
      expect(result.findings).toContain('ReDoS Vulnerability: nested quantifiers detected in regular expression');
      expect(result.findings).toContain('Unhandled Promise / Concurrency Hazard: async callback inside forEach');
      expect(result.findings).toContain('Memory Leak Risk: unbounded module-level cache without eviction');
    });
  });

  describe('Accessibility Fixture Evaluation (envguard-accessibility)', () => {
    const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'quality', 'accessibility');

    function auditAccessibility(jsxSource: string): { compliant: boolean; violations: string[] } {
      const violations: string[] = [];

      // Check for unsemantic div onClick without role="button" or tabIndex
      if (/<div[^>]*onClick(?![^>]*role=["']button["'])/i.test(jsxSource)) {
        violations.push('WCAG 2.1 4.1.2: Interactive <div> element missing role="button" or tabIndex');
      }

      // Check for inputs without associated labels or aria-label
      if (/<input(?![^>]*(id|aria-label|aria-labelledby))[^>]*>/i.test(jsxSource)) {
        violations.push('WCAG 2.1 1.3.1 / 4.1.2: Input element missing accessible label or id');
      }

      // Check for outline: none without replacement focus ring
      if (/outline:\s*['"]none['"]/i.test(jsxSource) && !/focus-visible:ring/i.test(jsxSource)) {
        violations.push('WCAG 2.1 2.4.7: Removed focus outline without replacement indicator');
      }

      // Check for low-contrast hex colors (#999999 text on white fails 4.5:1)
      if (/#999999/i.test(jsxSource)) {
        violations.push('WCAG 2.1 1.4.3: Low contrast text ratio (2.8:1 fails 4.5:1 minimum)');
      }

      // Check for aria-hidden on interactive buttons
      if (/<button[^>]*aria-hidden=["']true["']/i.test(jsxSource)) {
        violations.push('WCAG 2.1 4.1.2: Actionable button incorrectly hidden from assistive tech');
      }

      return { compliant: violations.length === 0, violations };
    }

    it('evaluates accessible dialog component and confirms WCAG AA alignment', () => {
      const source = fs.readFileSync(path.join(fixtureDir, 'dialog.correct.tsx'), 'utf8');
      const result = auditAccessibility(source);
      expect(result.compliant).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('evaluates defective dialog component and flags click-divs, unlabelled inputs, outline:none, and low contrast', () => {
      const source = fs.readFileSync(path.join(fixtureDir, 'dialog.defective.tsx'), 'utf8');
      const result = auditAccessibility(source);
      expect(result.compliant).toBe(false);
      expect(result.violations).toContain('WCAG 2.1 4.1.2: Interactive <div> element missing role="button" or tabIndex');
      expect(result.violations).toContain('WCAG 2.1 1.3.1 / 4.1.2: Input element missing accessible label or id');
      expect(result.violations).toContain('WCAG 2.1 2.4.7: Removed focus outline without replacement indicator');
      expect(result.violations).toContain('WCAG 2.1 1.4.3: Low contrast text ratio (2.8:1 fails 4.5:1 minimum)');
      expect(result.violations).toContain('WCAG 2.1 4.1.2: Actionable button incorrectly hidden from assistive tech');
    });
  });
});
