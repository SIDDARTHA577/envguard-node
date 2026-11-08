import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  runReadinessAudit,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('Full-Stack Monorepo with Mobile & Backend Applications', () => {
  const rootDir = path.resolve('.');
  const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'mobile', 'fullstack-mobile-monorepo');

  it('correctly discovers monorepo structure, mobile app, API backend, and shared library', () => {
    const graph = buildInventoryGraph(projectDir);

    expect(graph.repository.isMonorepo).toBe(true);
    expect(graph.repository.monorepoType).toBe('pnpm');
    expect(graph.applications.length).toBe(3);

    const mobileApp = graph.applications.find((a) => a.name === '@monorepo/mobile');
    expect(mobileApp).toBeDefined();
    expect(mobileApp?.type).toBe('mobile');
    expect(mobileApp?.frameworks).toContain('expo');
    expect(mobileApp?.frameworks).toContain('react-native');

    const apiApp = graph.applications.find((a) => a.name === '@monorepo/api');
    expect(apiApp).toBeDefined();
    expect(apiApp?.type).toBe('backend');
    expect(apiApp?.frameworks).toContain('express');

    const sharedLib = graph.applications.find((a) => a.name === '@monorepo/shared');
    expect(sharedLib).toBeDefined();
    expect(sharedLib?.type).toBe('library');
  });

  it('maps consumer dependency relationships from mobile and API to shared package', () => {
    const graph = buildInventoryGraph(projectDir);

    const mobileConsumesShared = graph.relationships.some(
      (r) => r.from === '@monorepo/mobile' && r.to === '@monorepo/shared'
    );
    expect(mobileConsumesShared).toBe(true);

    const apiConsumesShared = graph.relationships.some(
      (r) => r.from === '@monorepo/api' && r.to === '@monorepo/shared'
    );
    expect(apiConsumesShared).toBe(true);
  });

  it('runs complete multi-platform audit on full-stack monorepo without policy blockers', async () => {
    const report = await runReadinessAudit({
      projectDir,
      executeTests: false,
      trustProject: false,
    });

    expect(report.schemaVersion).toBe('1.1.0');
    expect(report.summary.fail).toBe(0);
    expect(report.policyEvaluation.blockerCount).toBe(0);
    expect(report.summary.pass).toBeGreaterThan(10);

    // Verify findings include both mobile and backend checks
    const checkIds = report.findings.map((f) => f.id);
    expect(checkIds.some((id) => id.startsWith('RN-'))).toBe(true);
    expect(checkIds.some((id) => id.startsWith('DISC-') || id.startsWith('ENV-'))).toBe(true);
  });
});
