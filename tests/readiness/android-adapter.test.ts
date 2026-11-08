import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  AndroidAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('Android Native Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'mobile');
  const adapter = new AndroidAdapter();

  describe('1. Adapter Contract & Capabilities', () => {
    it('declares correct identifier and metadata', () => {
      expect(adapter.id).toBe('android');
      expect(adapter.name).toContain('Android');
      expect(adapter.supportedLanguages).toContain('kotlin');
      expect(adapter.supportedLanguages).toContain('java');
      expect(adapter.supportedFrameworks).toContain('android-native');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('android_discovery');
      expect(capabilities).toContain('masvs_platform_exported_components');
      expect(capabilities).toContain('masvs_network_cleartext_traffic');
      expect(capabilities).toContain('masvs_storage_backup_safety');
      expect(capabilities).toContain('masvs_storage_encrypted_prefs');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(11);
      expect(checks.some((c) => c.id === 'ANDROID-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'ANDROID-SEC-002')).toBe(true);
      expect(checks.some((c) => c.id === 'ANDROID-SEC-003')).toBe(true);
      expect(checks.some((c) => c.id === 'ANDROID-SEC-004')).toBe(true);
    });
  });

  describe('2. Detection', () => {
    it('detects healthy Android project with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-android');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
    });

    it('rejects non-Android project', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Checks on Healthy Android Project', () => {
    const projectDir = path.join(fixturesDir, 'healthy-android');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies AndroidManifest.xml and targetSdk >= 33', () => {
      expect(findings.find((f) => f.id === 'ANDROID-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-DISC-002')?.status).toBe('PASS');
    });

    it('verifies exported component boundaries, cleartext traffic blocked, and backup disabled', () => {
      expect(findings.find((f) => f.id === 'ANDROID-SEC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-SEC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-SEC-003')?.status).toBe('PASS');
    });

    it('verifies EncryptedSharedPreferences, ProGuard/R8 minification, and unit tests', () => {
      expect(findings.find((f) => f.id === 'ANDROID-SEC-004')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-SEC-005')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-SEC-006')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'ANDROID-TEST-001')?.status).toBe('PASS');
    });
  });

  describe('4. Static Checks on Defective Android Project', () => {
    const projectDir = path.join(fixturesDir, 'defective-android-permissions');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags unprotected exported service as high failure (MASVS-PLATFORM)', () => {
      const sec1 = findings.find((f) => f.id === 'ANDROID-SEC-001');
      expect(sec1?.status).toBe('FAIL');
      expect(sec1?.severity).toBe('high');
    });

    it('flags cleartext HTTP traffic as high failure (MASVS-NETWORK)', () => {
      const sec2 = findings.find((f) => f.id === 'ANDROID-SEC-002');
      expect(sec2?.status).toBe('FAIL');
      expect(sec2?.severity).toBe('high');
    });

    it('flags application backup enabled as medium failure (MASVS-STORAGE)', () => {
      const sec3 = findings.find((f) => f.id === 'ANDROID-SEC-003');
      expect(sec3?.status).toBe('FAIL');
      expect(sec3?.severity).toBe('medium');
    });

    it('flags hardcoded keystore signing password in build.gradle as critical failure', () => {
      const sec6 = findings.find((f) => f.id === 'ANDROID-SEC-006');
      expect(sec6?.status).toBe('FAIL');
      expect(sec6?.severity).toBe('critical');
    });
  });

  describe('5. Full Pipeline Audit Integration', () => {
    it('classifies healthy-android as mobile application and passes policy gates', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-android');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('mobile');
      expect(graph.applications[0].frameworks).toContain('android-native');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.blockerCount).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(5);
    });

    it('blocks release for defective-android with unprotected components and cleartext traffic', async () => {
      const projectDir = path.join(fixturesDir, 'defective-android-permissions');
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
