import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runReadinessAudit } from '../../tools/readiness-auditor.mjs';
import { installSkills, uninstallSkills } from '../../tools/skill-manager.mjs';

describe('Senior Engineer Review & Integrated Architecture Pipeline', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'senior-review');

  it('runs complete senior engineer review on healthy-monolith with zero release blockers', async () => {
    const projectDir = path.join(fixturesDir, 'healthy-monolith');
    const report = await runReadinessAudit({
      projectDir,
      includeArchitecture: true,
      allowExec: false,
      trustProject: false,
    });

    expect(report.schemaVersion).toBe('1.1.0');
    expect(report.summary.fail).toBe(0);
    expect(report.policyEvaluation.blockerCount).toBe(0);
    expect(report.architecture).toBeDefined();

    // Verify architecture payload structure
    const arch = report.architecture;
    expect(arch.inventory.topologyType).toBe('modular-monolith');
    expect(arch.evaluations.length).toBe(17);
    expect(arch.tradeoffs.length).toBeGreaterThanOrEqual(3);
    expect(arch.failureModes.length).toBeGreaterThanOrEqual(3);
    expect(arch.capacityModel.hypothetical10kScenario.parameters.virtualUsers).toBe(10000);
  });

  it('flags overengineered microservices architecture for small team with consolidation ADR', async () => {
    const projectDir = path.join(fixturesDir, 'overengineered-microservices');
    const report = await runReadinessAudit({
      projectDir,
      includeArchitecture: true,
      architectureRequirements: { teamSize: 'small (2 engineers)' },
      allowExec: false,
      trustProject: false,
    });

    expect(report.architecture.inventory.topologyType).toBe('microservices');
    const microFinding = report.findings.find((f: { id: string }) => f.id === 'ARCH-MICRO-001');
    expect(microFinding).toBeDefined();
    expect(microFinding?.severity).toBe('medium');

    const adrs = report.architecture.adrs;
    expect(adrs.some((a: { id: string }) => a.id.includes('MICROSERVICES'))).toBe(true);
  });

  it('identifies unbounded memory cache and missing fault tolerance in defective-architecture', async () => {
    const projectDir = path.join(fixturesDir, 'defective-architecture');
    const report = await runReadinessAudit({
      projectDir,
      includeArchitecture: true,
      architectureRequirements: { availability: { level: 'high_availability' } },
      allowExec: false,
      trustProject: false,
    });

    const checkIds = report.findings.map((f: { id: string }) => f.id);
    expect(checkIds).toContain('ARCH-CACHE-001'); // Unbounded memory cache
    expect(checkIds).toContain('ARCH-RATE-001'); // Missing rate limiting
    expect(checkIds).toContain('ARCH-FAULT-001'); // Missing SIGTERM handler

    // Verify ADR drafts generated for defects
    expect(report.architecture.adrs.length).toBeGreaterThanOrEqual(2);
  });

  it('installs and uninstalls envguard-senior-engineer-review and envguard-load-test cleanly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'senior-skill-test-'));
    try {
      // 1. Install senior-engineer-review skill
      const res = installSkills({
        skillName: 'envguard-senior-engineer-review',
        destDir: tempDir,
        targetHost: 'codex',
      });
      expect(res.success).toBe(true);

      const skillPath = path.join(tempDir, '.agents', 'skills', 'envguard-senior-engineer-review', 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);

      // 2. Install load-test skill
      const resLoad = installSkills({
        skillName: 'envguard-load-test',
        destDir: tempDir,
        targetHost: 'codex',
      });
      expect(resLoad.success).toBe(true);

      const loadPath = path.join(tempDir, '.agents', 'skills', 'envguard-load-test', 'SKILL.md');
      expect(fs.existsSync(loadPath)).toBe(true);

      // 3. Clean uninstall
      const uninstRes = uninstallSkills({
        skillName: 'envguard-senior-engineer-review',
        destDir: tempDir,
      });
      expect(uninstRes.success).toBe(true);
      expect(fs.existsSync(skillPath)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);
});
