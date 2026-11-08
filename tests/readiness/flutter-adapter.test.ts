import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  FlutterAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('Flutter & Dart Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'mobile');
  const adapter = new FlutterAdapter();

  describe('1. Adapter Contract & Capabilities', () => {
    it('declares correct identifier and metadata', () => {
      expect(adapter.id).toBe('flutter');
      expect(adapter.name).toContain('Flutter');
      expect(adapter.supportedLanguages).toContain('dart');
      expect(adapter.supportedFrameworks).toContain('flutter');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('flutter_discovery');
      expect(capabilities).toContain('masvs_storage_security');
      expect(capabilities).toContain('flutter_resource_disposal');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(11);
      expect(checks.some((c) => c.id === 'FLUTTER-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'FLUTTER-REL-001')).toBe(true);
      expect(checks.some((c) => c.id === 'FLUTTER-TEST-001')).toBe(true);
    });
  });

  describe('2. Detection', () => {
    it('detects healthy Flutter project with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-flutter');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.isFlutter).toBe(true);
    });

    it('rejects non-Flutter project', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Checks on Healthy Flutter Application', () => {
    const projectDir = path.join(fixturesDir, 'healthy-flutter');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies pubspec manifest, sound null safety, and lockfile', () => {
      expect(findings.find((f) => f.id === 'FLUTTER-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-DISC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-DISC-003')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-DISC-004')?.status).toBe('PASS');
    });

    it('verifies flutter_secure_storage and zero hardcoded secrets (MASVS-STORAGE)', () => {
      expect(findings.find((f) => f.id === 'FLUTTER-SEC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-SEC-002')?.status).toBe('PASS');
    });

    it('verifies controller disposal, global error boundary, and widget tests', () => {
      expect(findings.find((f) => f.id === 'FLUTTER-REL-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-REL-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'FLUTTER-TEST-001')?.status).toBe('PASS');
    });
  });

  describe('4. Static Checks on Defective Flutter Application', () => {
    const projectDir = path.join(fixturesDir, 'defective-flutter');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags cleartext SharedPreferences token storage as high failure (MASVS-STORAGE)', () => {
      const sec1 = findings.find((f) => f.id === 'FLUTTER-SEC-001');
      expect(sec1?.status).toBe('FAIL');
      expect(sec1?.severity).toBe('high');
    });

    it('flags hardcoded API secret in Dart code as critical failure', () => {
      const sec2 = findings.find((f) => f.id === 'FLUTTER-SEC-002');
      expect(sec2?.status).toBe('FAIL');
      expect(sec2?.severity).toBe('critical');
    });

    it('flags missing controller disposal as high warning', () => {
      const rel1 = findings.find((f) => f.id === 'FLUTTER-REL-001');
      expect(rel1?.status).toBe('WARNING');
      expect(rel1?.severity).toBe('high');
    });
  });

  describe('5. Full Pipeline Audit Integration', () => {
    it('classifies healthy-flutter as mobile application and passes policy gates', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-flutter');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('mobile');
      expect(graph.applications[0].languages).toContain('dart');
      expect(graph.applications[0].frameworks).toContain('flutter');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.blockerCount).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(4);
    });

    it('blocks release for defective-flutter with cleartext storage and hardcoded secrets', async () => {
      const projectDir = path.join(fixturesDir, 'defective-flutter');
      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBeGreaterThan(0);
      expect(report.policyEvaluation.outcome).toBe('BLOCKED');
      expect(report.policyEvaluation.blockerCount).toBeGreaterThan(0);
    });
  });
});
