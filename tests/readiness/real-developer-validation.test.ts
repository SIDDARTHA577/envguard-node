import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  PROJECT_ARCHETYPES,
  AGENT_HOSTS,
  generateArchetypeFixture,
  formatEvidenceMatrixMarkdown,
  runReadinessAudit,
  validateReportSchema,
  executeRemediationWorkflow,
  REMEDIATION_STATUSES,
} from '../../tools/readiness/index.mjs';
import { installSkills, uninstallSkills, resolveTargetDirForHost } from '../../tools/skill-manager.mjs';

describe('Phase 13 — Independent Developer & Agent Testing', () => {
  let tempBaseDir: string;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-real-dev-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('13.1: 12-Archetype Independent Application Evaluations', () => {
    for (const archetype of PROJECT_ARCHETYPES) {
      it(`evaluates independent disposable project for ${archetype.name} [${archetype.id}]`, () => {
        const projectDir = path.join(tempBaseDir, archetype.id);
        generateArchetypeFixture(archetype.id, projectDir, { healthy: true });

        // Run full readiness audit against the independent external project
        const report = runReadinessAudit({
          projectDir,
          allowExec: false,
        });

        // 1. Schema must be 100% valid
        expect(validateReportSchema(report)).toBe(true);

        // 2. Report metadata must accurately reflect independent project
        expect(report.projectRoot).toBe(path.basename(projectDir));
        expect(report.findings.length).toBeGreaterThan(0);

        // 3. Platform detection must match archetype category
        const detectedArch = report.projectMetadata.architecture;
        if (archetype.category === 'mobile') {
          expect(['mobile', 'fullstack_monorepo', 'monorepo']).toContain(detectedArch);
        } else if (archetype.category === 'frontend') {
          expect(['frontend', 'web', 'monorepo']).toContain(detectedArch);
        } else if (archetype.category === 'backend') {
          expect(['backend', 'monorepo']).toContain(detectedArch);
        } else if (archetype.category === 'monorepo') {
          expect(report.projectMetadata.inventory.repository.isMonorepo).toBe(true);
        }

        // 4. Summary counts must be consistent and non-negative
        expect(report.summary.totalChecks).toBeGreaterThan(0);
        expect(report.summary.pass + report.summary.fail + report.summary.warning + report.summary.notRun + report.summary.notApplicable + report.summary.manualReview).toBe(report.summary.totalChecks);
      }, 15000);
    }
  });

  describe('13.2: Defective vs Remediated End-to-End Workflow on Independent App', () => {
    it('executes full audit, reviewable patch formulation, and retesting on defective application', () => {
      const projectDir = path.join(tempBaseDir, 'defective-vite-app');
      // Generate defective fixture without .env.example or .gitignore
      generateArchetypeFixture('react-vite', projectDir, { healthy: false });

      // Step 1: Initial audit detects blockers
      const initialReport = runReadinessAudit({ projectDir });
      expect(initialReport.policyEvaluation.outcome).toBe('BLOCKED');
      expect(initialReport.findings.some((f: any) => f.id === 'ENV-001' && f.status === 'FAIL')).toBe(true);
      expect(initialReport.findings.some((f: any) => f.id === 'ENV-002' && f.status === 'FAIL')).toBe(true);

      // Step 2: Formulate reviewable patches in dry-run mode
      const dryRun = executeRemediationWorkflow({
        projectDir,
        applyFix: false,
      });
      expect(dryRun.status).toBe(REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL);
      expect(dryRun.diffPreview).toContain('+++ b/.env.example');
      expect(dryRun.diffPreview).toContain('+++ b/.gitignore');
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(false);

      // Step 3: Apply fix with checkpoint and retest
      const applied = executeRemediationWorkflow({
        projectDir,
        applyFix: true,
      });
      expect(applied.status).toBe(REMEDIATION_STATUSES.REMEDIATED_AND_VERIFIED);
      expect(applied.verdict).toBe('IMPROVED');
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true);

      // Step 4: Verify post-remediation report confirms resolved findings
      expect(applied.afterReport.findings.find((f: any) => f.id === 'ENV-001')?.status).toBe('PASS');
      expect(applied.afterReport.findings.find((f: any) => f.id === 'ENV-002')?.status).toBe('PASS');
    }, 20000);
  });

  describe('13.3: Agent Host Skill Installation & Portability Across Layouts', () => {
    const testHosts = [
      { host: 'antigravity', expectedSubdir: path.join('skills', 'envguard-production-readiness') },
      { host: 'claude-code', expectedSubdir: path.join('.claude', 'skills', 'envguard-production-readiness') },
      { host: 'cursor', expectedSubdir: path.join('.cursor', 'skills', 'envguard-production-readiness') },
      { host: 'codex', expectedSubdir: path.join('.agents', 'skills', 'envguard-production-readiness') },
    ];

    for (const { host, expectedSubdir } of testHosts) {
      it(`installs and verifies skill pack portability for host target "${host}"`, () => {
        const hostProjectDir = path.join(tempBaseDir, `host-${host}`);
        fs.mkdirSync(hostProjectDir, { recursive: true });

        // Verify directory resolution
        const targetRel = resolveTargetDirForHost('envguard-production-readiness', host);
        expect(targetRel).toBe(expectedSubdir);

        // Install pack into the independent host project
        const installResult = installSkills({
          packName: 'production',
          destDir: hostProjectDir,
          targetHost: host,
        });
        expect(installResult.success).toBe(true);

        // Verify SKILL.md exists and contains valid frontmatter in destination
        const destSkillMd = path.join(hostProjectDir, expectedSubdir, 'SKILL.md');
        expect(fs.existsSync(destSkillMd)).toBe(true);
        const content = fs.readFileSync(destSkillMd, 'utf8');
        expect(content.startsWith('---')).toBe(true);
        expect(content).toContain('name: envguard-production-readiness');

        // Uninstall cleanly
        const uninstallResult = uninstallSkills({
          packName: 'production',
          destDir: hostProjectDir,
          targetHost: host,
        });
        expect(uninstallResult.success).toBe(true);
        expect(fs.existsSync(destSkillMd)).toBe(false);
      }, 25000);
    }
  });

  describe('13.4: Evidence Matrix & Host Capability Reporting', () => {
    it('generates Markdown evidence table covering all 12 archetypes and 4 agent hosts', () => {
      const md = formatEvidenceMatrixMarkdown();
      expect(md).toContain('# EnvGuard Real-World Developer & Agent Validation Evidence Matrix');
      expect(md).toContain('React 18 + Vite (TypeScript)');
      expect(md).toContain('Next.js 14 (App Router)');
      expect(md).toContain('Python Django 5.x Web Application');
      expect(md).toContain('Java Spring Boot 3.x (Maven)');
      expect(md).toContain('Flutter & Dart Mobile App');
      expect(md).toContain('Native Android (Kotlin / Gradle)');
      expect(md).toContain('Native iOS (Swift / Xcode)');
      expect(md).toContain('Polyglot Monorepo (Web, API & Mobile)');
      expect(md).toContain('Google Antigravity');
      expect(md).toContain('Claude Code');
      expect(md).toContain('Cursor IDE');
      expect(md).toContain('OpenAI Codex');
      expect(md).toContain('Honest Adoption Disclosure');
      expect(md).toContain('DIRECTORY_COMPATIBLE');
    });

    it('verifies agent host metadata distinguishes native execution from directory compatibility', () => {
      for (const host of AGENT_HOSTS) {
        expect(['NATIVE_VERIFIED', 'DIRECTORY_COMPATIBLE', 'UNSUPPORTED']).toContain(host.executionStatus);
        expect(host.skillFormat).toContain('Agent Skill');
      }
    });
  });
});
