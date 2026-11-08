import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  ReactNativeAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('React Native & Expo Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'mobile');
  const adapter = new ReactNativeAdapter();

  describe('1. Adapter Contract & Capabilities', () => {
    it('declares correct identifier and metadata', () => {
      expect(adapter.id).toBe('react-native');
      expect(adapter.name).toContain('React Native');
      expect(adapter.supportedFrameworks).toContain('expo');
      expect(adapter.supportedFrameworks).toContain('react-native');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('expo_configuration');
      expect(capabilities).toContain('masvs_storage_security');
      expect(capabilities).toContain('mobile_secret_safety');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(12);
      expect(checks.some((c) => c.id === 'RN-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'RN-SEC-002')).toBe(true);
      expect(checks.some((c) => c.id === 'RN-REL-001')).toBe(true);
    });
  });

  describe('2. Detection', () => {
    it('detects healthy Expo project with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-expo');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.isExpo).toBe(true);
    });

    it('rejects non-mobile project (e.g. healthy-app Express)', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Checks on Healthy Expo Application', () => {
    const projectDir = path.join(fixturesDir, 'healthy-expo');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies manifest, bundle identifier, and SDK version', () => {
      expect(findings.find((f) => f.id === 'RN-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-DISC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-DISC-003')?.status).toBe('PASS');
    });

    it('verifies secure token storage via SecureStore and zero hardcoded secrets', () => {
      expect(findings.find((f) => f.id === 'RN-SEC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-SEC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-SEC-005')?.status).toBe('PASS');
    });

    it('verifies error boundary, NetInfo offline monitoring, AppState lifecycle, and tests', () => {
      expect(findings.find((f) => f.id === 'RN-REL-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-REL-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-REL-003')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'RN-TEST-001')?.status).toBe('PASS');
    });
  });

  describe('4. Static Checks on Defective Expo Application', () => {
    const projectDir = path.join(fixturesDir, 'defective-expo');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags hardcoded API secret as critical failure', () => {
      const sec1 = findings.find((f) => f.id === 'RN-SEC-001');
      expect(sec1?.status).toBe('FAIL');
      expect(sec1?.severity).toBe('critical');
    });

    it('flags cleartext AsyncStorage token storage as high failure (MASVS-STORAGE)', () => {
      const sec2 = findings.find((f) => f.id === 'RN-SEC-002');
      expect(sec2?.status).toBe('FAIL');
      expect(sec2?.severity).toBe('high');
    });

    it('flags sensitive token logging in client build as high failure', () => {
      const sec5 = findings.find((f) => f.id === 'RN-SEC-005');
      expect(sec5?.status).toBe('FAIL');
      expect(sec5?.severity).toBe('high');
    });

    it('flags missing error boundary as high warning', () => {
      const rel1 = findings.find((f) => f.id === 'RN-REL-001');
      expect(rel1?.status).toBe('WARNING');
      expect(rel1?.severity).toBe('high');
    });
  });

  describe('5. Full Pipeline Audit Integration', () => {
    it('classifies healthy-expo as mobile application and passes policy gates', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-expo');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('mobile');
      expect(graph.applications[0].frameworks).toContain('expo');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.blockerCount).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(5);
    });

    it('blocks release for defective-expo due to hardcoded secrets and cleartext storage', async () => {
      const projectDir = path.join(fixturesDir, 'defective-expo');
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
