import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runReadinessAudit,
  compareReadinessReports,
  formatComparisonMarkdown,
  generateProfessionalEngineeringReport,
  main as runAuditorCli,
  EXIT_CODES,
} from '../../tools/readiness-auditor.mjs';
import {
  installSkills,
  SUPPORTED_HOSTS,
  resolveTargetDirForHost,
  loadPacks,
} from '../../tools/skill-manager.mjs';

const rootDir = path.resolve('.');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

describe('Phase 8 — Real-World Developer Product Validation & Public Release Readiness', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-dev-exp-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // safe cleanup
    }
  });

  // =========================================================================
  // 1. Clear Installation Experience & Agent Host Integration
  // =========================================================================
  describe('8.1 & 8.2: Installation Experience & Multi-Host Agent Integration', () => {
    it('supports all 4 primary AI coding agent host layouts cleanly', () => {
      for (const host of ['codex', 'antigravity', 'claude-code', 'cursor']) {
        expect(SUPPORTED_HOSTS).toContain(host === 'claude-code' ? 'claude-code' : host);
        const resolved = resolveTargetDirForHost('envguard-audit', host);
        expect(resolved).toBeTruthy();

        if (host === 'codex') {
          expect(resolved).toBe(path.join('.agents', 'skills', 'envguard-audit'));
        } else if (host === 'antigravity') {
          expect(resolved).toBe(path.join('skills', 'envguard-audit'));
        } else if (host === 'claude-code') {
          expect(resolved).toBe(path.join('.claude', 'skills', 'envguard-audit'));
        } else if (host === 'cursor') {
          expect(resolved).toBe(path.join('.cursor', 'skills', 'envguard-audit'));
        }
      }
    });

    it('installs all 3 packs (core, fullstack, production) from local source into clean directory without symlink breaks', () => {
      const packs = loadPacks(rootDir);
      expect(packs.map((p) => p.id)).toEqual(['core', 'fullstack', 'production']);

      for (const pack of packs) {
        const dest = path.join(tempDir, `pack-${pack.id}`);
        fs.mkdirSync(dest, { recursive: true });

        const result = installSkills({
          packName: pack.id,
          destDir: dest,
          targetHost: 'codex',
          repoRoot: rootDir,
        });

        expect(result.success).toBe(true);
        expect(result.plan.actions.length).toBeGreaterThanOrEqual(pack.skills.length);

        // Verify each skill was written to .agents/skills/<skill>/SKILL.md
        for (const skillName of pack.skills) {
          const skillFile = path.join(dest, '.agents', 'skills', skillName, 'SKILL.md');
          expect(fs.existsSync(skillFile)).toBe(true);
          const stat = fs.lstatSync(skillFile);
          expect(stat.isSymbolicLink()).toBe(false); // real regular file, not broken symlink
        }

        // Verify installation metadata tracking file
        const metaFile = path.join(dest, '.envguard-skills.json');
        expect(fs.existsSync(metaFile)).toBe(true);
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        expect(meta.managedBy).toBe('envguard');
        for (const skillName of pack.skills) {
          expect(meta.skills[skillName]).toBeDefined();
        }
      }
    });

    it('installs to Claude Code target layout (.claude/skills/) correctly', () => {
      const dest = path.join(tempDir, 'claude-project');
      fs.mkdirSync(dest, { recursive: true });

      const result = installSkills({
        packName: 'core',
        destDir: dest,
        targetHost: 'claude-code',
        repoRoot: rootDir,
      });

      expect(result.success).toBe(true);
      const auditSkill = path.join(dest, '.claude', 'skills', 'envguard-audit', 'SKILL.md');
      expect(fs.existsSync(auditSkill)).toBe(true);
    });

    it('installs to Cursor target layout (.cursor/skills/) correctly', () => {
      const dest = path.join(tempDir, 'cursor-project');
      fs.mkdirSync(dest, { recursive: true });

      const result = installSkills({
        packName: 'core',
        destDir: dest,
        targetHost: 'cursor',
        repoRoot: rootDir,
      });

      expect(result.success).toBe(true);
      const auditSkill = path.join(dest, '.cursor', 'skills', 'envguard-audit', 'SKILL.md');
      expect(fs.existsSync(auditSkill)).toBe(true);
    });
  });

  // =========================================================================
  // 2. Golden-Path Developer Workflow: Compare, Report & Verify
  // =========================================================================
  describe('8.3 & 8.6: Golden-Path Developer Workflow & Report Comparison', () => {
    it('compares before vs after reports and correctly tracks resolved findings', () => {
      const disposableDir = path.join(tempDir, 'disposable-workflow-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), disposableDir, { recursive: true });

      const beforeReport = runReadinessAudit({
        projectDir: disposableDir,
      });

      // Remediate missing env.example and missing gitignore in the same application
      fs.writeFileSync(
        path.join(disposableDir, '.env.example'),
        'PORT=3000\nDATABASE_URL=postgres://localhost:5432/db\nAPI_KEY=your_key_here\n'
      );
      fs.writeFileSync(
        path.join(disposableDir, '.gitignore'),
        '.env\n.env.*\nnode_modules\n'
      );

      const afterReport = runReadinessAudit({
        projectDir: disposableDir,
        allowExec: true,
        trustProject: true,
      });

      const comparison = compareReadinessReports(beforeReport, afterReport);

      expect(comparison).toBeDefined();
      expect(comparison.projectIdentity.projectMismatch).toBe(false);
      expect(comparison.statusTransition.from).toBe('BLOCKED');
      expect(comparison.statusTransition.to).not.toBe('BLOCKED');
      expect(comparison.statusTransition.improved).toBe(true);
      expect(comparison.statusTransition.regressed).toBe(false);

      // Verify resolved findings
      expect(comparison.resolvedFindings.length).toBeGreaterThan(0);
      const resolvedEnv = comparison.resolvedFindings.find((r) => r.id === 'ENV-001' || r.id === 'ENV-002');
      expect(resolvedEnv).toBeDefined();
      expect(resolvedEnv?.beforeStatus).toBe('FAIL');
      expect(resolvedEnv?.afterStatus).toBe('PASS');

      // Verify summary delta
      expect(comparison.summaryDelta.fail).toBeLessThan(0); // Fail count decreased

      // Verify Markdown rendering
      const md = formatComparisonMarkdown(comparison);
      expect(md).toContain('# EnvGuard Production Readiness Verification & Comparison Report');
      expect(md).toContain('## 1. Summary of Assessment Deltas');
      expect(md).toContain('## 2. Remediated & Resolved Findings');
      expect(md).toContain('IMPROVED');
    });

    it('detects regressions when a previously passing check fails in follow-up assessment', () => {
      const disposableDir = path.join(tempDir, 'disposable-regression-app');
      fs.cpSync(path.join(fixturesDir, 'healthy-app'), disposableDir, { recursive: true });

      const beforeReport = runReadinessAudit({
        projectDir: disposableDir,
      });

      // Introduce a regression by removing .env.example
      fs.rmSync(path.join(disposableDir, '.env.example'), { force: true });

      const afterReport = runReadinessAudit({
        projectDir: disposableDir,
      });

      const comparison = compareReadinessReports(beforeReport, afterReport);

      expect(comparison.statusTransition.regressed).toBe(true);
      expect(comparison.statusTransition.improved).toBe(false);
      expect(comparison.regressedFindings.length).toBeGreaterThan(0);

      const md = formatComparisonMarkdown(comparison);
      expect(md).toContain('REGRESSION DETECTED');
      expect(md).toContain('## 3. Regressions Detected');
    });

    it('executes CLI with --compare and emits comparison reports', () => {
      const disposableDir = path.join(tempDir, 'disposable-cli-compare-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), disposableDir, { recursive: true });

      const beforeReport = runReadinessAudit({
        projectDir: disposableDir,
      });

      // Remediate
      fs.writeFileSync(
        path.join(disposableDir, '.env.example'),
        'PORT=3000\nDATABASE_URL=postgres://localhost:5432/db\nAPI_KEY=your_key_here\n'
      );
      fs.writeFileSync(
        path.join(disposableDir, '.gitignore'),
        '.env\n.env.*\nnode_modules\n'
      );

      const afterReport = runReadinessAudit({
        projectDir: disposableDir,
        allowExec: true,
        trustProject: true,
      });

      const beforePath = path.join(tempDir, 'before.json');
      const afterPath = path.join(tempDir, 'after.json');
      const outDir = path.join(tempDir, 'comparison-out');

      fs.writeFileSync(beforePath, JSON.stringify(beforeReport, null, 2));
      fs.writeFileSync(afterPath, JSON.stringify(afterReport, null, 2));

      const exitCode = runAuditorCli([
        '--compare',
        beforePath,
        afterPath,
        '--output-dir',
        outDir,
        '--format',
        'both',
      ]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
      expect(fs.existsSync(path.join(outDir, 'readiness-comparison.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'readiness-comparison.md'))).toBe(true);

      const comparison = JSON.parse(fs.readFileSync(path.join(outDir, 'readiness-comparison.json'), 'utf8'));
      expect(comparison.statusTransition.improved).toBe(true);
    });

    it('returns EXIT_CODES.POLICY_BLOCKERS when after report still contains blockers in --compare', () => {
      const beforePath = path.join(tempDir, 'before.json');
      const afterPath = path.join(tempDir, 'after.json');

      const blockedReport = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'missing-env'),
      });

      fs.writeFileSync(beforePath, JSON.stringify(blockedReport, null, 2));
      fs.writeFileSync(afterPath, JSON.stringify(blockedReport, null, 2));

      const exitCode = runAuditorCli(['--compare', beforePath, afterPath]);
      expect(exitCode).toBe(EXIT_CODES.POLICY_BLOCKERS);
    });
  });

  // =========================================================================
  // 3. Professional Engineering Report (All 12 Sections)
  // =========================================================================
  describe('8.5: Professional Engineering Report (12 Sections Coverage)', () => {
    it('generates professional report with all 12 required sections explicitly populated', () => {
      const report = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'healthy-app'),
      });

      const md = generateProfessionalEngineeringReport(report);

      expect(md).toContain('# EnvGuard Professional Engineering Assessment Report');
      expect(md).toContain('## 1. Project Overview & Topology');
      expect(md).toContain('## 2. Architecture & System Design');
      expect(md).toContain('## 3. Code Quality & Test Coverage');
      expect(md).toContain('## 4. Security Posture & Secrets Management');
      expect(md).toContain('## 5. Database Persistence & Migrations');
      expect(md).toContain('## 6. Frontend, UI & Accessibility');
      expect(md).toContain('## 7. Mobile Engineering Readiness');
      expect(md).toContain('## 8. Performance & Capacity Modeling');
      expect(md).toContain('## 9. Reliability, Resilience & Failure Modes');
      expect(md).toContain('## 10. Priority Recommendations (P0 Blocker, P1 Critical, P2 Improvement)');
      expect(md).toContain('## 11. Evidence & Provenance');
      expect(md).toContain('## 12. Formal Release Recommendation');

      // Release gate outcome should be clearly stated
      expect(md).toContain('### Release Gate Outcome:');
    });

    it('populates structured sections object in JSON report', () => {
      const report = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'healthy-app'),
      });

      expect(report.sections).toBeDefined();
      expect(report.sections.projectOverview).toBeDefined();
      expect(report.sections.architecture).toBeDefined();
      expect(report.sections.codeQuality).toBeDefined();
      expect(report.sections.security).toBeDefined();
      expect(report.sections.database).toBeDefined();
      expect(report.sections.frontend).toBeDefined();
      expect(report.sections.mobile).toBeDefined();
      expect(report.sections.performance).toBeDefined();
      expect(report.sections.reliability).toBeDefined();
      expect(report.sections.priorityRecommendations).toBeDefined();
      expect(report.sections.evidence).toBeDefined();
      expect(report.sections.releaseRecommendation).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Independent Project Evaluation Suite (10 Archetypes)
  // =========================================================================
  describe('8.4: Independent Project Archetype Evaluations', () => {
    it('Archetype 1: React / Vite Web Application (healthy vs defective)', () => {
      // 1. Healthy React/Vite
      const healthyReport = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'react-vite', 'healthy-react-vite'),
      });
      expect(healthyReport.projectMetadata.inventory.applications[0].type).toBe('frontend');
      expect(healthyReport.summary.fail).toBe(0);

      // 2. Defective React/Vite
      const defectiveReport = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'react-vite', 'defective-react-vite'),
      });
      expect(defectiveReport.summary.fail).toBeGreaterThan(0);
      expect(defectiveReport.findings.some((f) => f.id === 'ENV-001' && f.status === 'FAIL')).toBe(true);
      expect(defectiveReport.policyEvaluation.outcome).toBe('BLOCKED');
    });

    it('Archetype 2: Next.js Full-Stack Application (healthy vs leaking)', () => {
      const healthyNext = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'nextjs-app'),
      });
      expect(healthyNext.projectMetadata.inventory.applications[0].frameworks).toContain('nextjs');
      expect(healthyNext.summary.fail).toBe(0);

      const leakingNext = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'nextjs-leak'),
      });
      expect(leakingNext.summary.fail).toBeGreaterThan(0);
      expect(leakingNext.findings.some((f) => f.category === 'security' && f.status === 'FAIL')).toBe(true);
    });

    it('Archetype 3: Node.js / Express API Service (healthy vs defective)', () => {
      const healthyExpress = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'healthy-app'),
      });
      expect(healthyExpress.summary.fail).toBe(0);

      const defectiveBackend = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'deep-defective-backend'),
      });
      expect(defectiveBackend.summary.fail).toBeGreaterThan(0);
    });

    it('Archetype 4: Full-Stack Monorepo (discovers multi-app architecture)', () => {
      const monorepoReport = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'monorepo-app'),
      });
      expect(monorepoReport.projectMetadata.inventory.repository.isMonorepo).toBe(true);
      expect(monorepoReport.projectMetadata.inventory.applications.length).toBeGreaterThanOrEqual(2);
    });

    it('Archetype 5: Python Django Backend (healthy vs defective SQLi)', () => {
      const healthyDjango = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'python', 'healthy-django'),
      });
      expect(healthyDjango.projectMetadata.inventory.applications[0].frameworks).toContain('django');
      expect(healthyDjango.summary.fail).toBe(0);

      const sqliDjango = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'python', 'defective-sqli-python'),
      });
      expect(sqliDjango.summary.fail).toBeGreaterThan(0);
      expect(sqliDjango.findings.some((f) => f.id === 'PY-SEC-004' && f.status === 'FAIL')).toBe(true);
    });

    it('Archetype 6: Python FastAPI Backend (healthy)', () => {
      const fastapiReport = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'python', 'healthy-fastapi'),
      });
      expect(fastapiReport.projectMetadata.inventory.applications[0].frameworks).toContain('fastapi');
      expect(fastapiReport.summary.fail).toBe(0);
    });

    it('Archetype 7: Java Spring Boot Backend (healthy vs defective JPA)', () => {
      const healthySpring = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'java', 'healthy-spring-boot-maven'),
      });
      expect(healthySpring.projectMetadata.inventory.applications[0].languages).toContain('java');
      expect(healthySpring.summary.fail).toBe(0);

      const defectiveSpring = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'java', 'defective-spring-boot'),
      });
      expect(defectiveSpring.summary.fail).toBeGreaterThan(0);
    });

    it('Archetype 8: React Native / Expo Mobile App (healthy vs defective)', () => {
      const healthyExpo = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'healthy-expo'),
      });
      expect(healthyExpo.projectMetadata.inventory.applications[0].frameworks).toContain('expo');
      expect(healthyExpo.summary.fail).toBe(0);

      const defectiveExpo = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'defective-expo'),
      });
      expect(defectiveExpo.summary.fail).toBeGreaterThan(0);
    });

    it('Archetype 9: Flutter Mobile App (healthy vs defective)', () => {
      const healthyFlutter = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'healthy-flutter'),
      });
      expect(healthyFlutter.projectMetadata.inventory.applications[0].frameworks).toContain('flutter');
      expect(healthyFlutter.summary.fail).toBe(0);

      const defectiveFlutter = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'defective-flutter'),
      });
      expect(defectiveFlutter.summary.fail).toBeGreaterThan(0);
    });

    it('Archetype 10: Native Android / Kotlin App (healthy vs defective permissions)', () => {
      const healthyAndroid = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'healthy-android'),
      });
      expect(healthyAndroid.projectMetadata.inventory.applications[0].frameworks).toContain('android-native');
      expect(healthyAndroid.summary.fail).toBe(0);

      const defectiveAndroid = runReadinessAudit({
        projectDir: path.join(fixturesDir, 'mobile', 'defective-android-permissions'),
      });
      expect(defectiveAndroid.summary.fail).toBeGreaterThan(0);
    });
  });
});
