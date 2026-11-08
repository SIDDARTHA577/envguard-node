import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  IosAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('iOS & Apple Native Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'mobile');
  const adapter = new IosAdapter();

  describe('1. Adapter Contract & Capabilities', () => {
    it('declares correct identifier and metadata', () => {
      expect(adapter.id).toBe('ios');
      expect(adapter.name).toContain('iOS');
      expect(adapter.supportedLanguages).toContain('swift');
      expect(adapter.supportedFrameworks).toContain('ios-native');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('ios_discovery');
      expect(capabilities).toContain('masvs_network_app_transport_security');
      expect(capabilities).toContain('masvs_storage_keychain_services');
      expect(capabilities).toContain('masvs_privacy_manifest');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(9);
      expect(checks.some((c) => c.id === 'IOS-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'IOS-SEC-002')).toBe(true);
      expect(checks.some((c) => c.id === 'IOS-SEC-003')).toBe(true);
    });
  });

  describe('2. Detection', () => {
    it('detects healthy iOS project with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-ios');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
    });

    it('rejects non-iOS project', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Checks on Healthy iOS Project', () => {
    const projectDir = path.join(fixturesDir, 'healthy-ios');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies Xcode project descriptor and deployment target >= 15.0', () => {
      expect(findings.find((f) => f.id === 'IOS-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'IOS-DISC-002')?.status).toBe('PASS');
    });

    it('verifies App Transport Security (ATS) enforced by default (MASVS-NETWORK)', () => {
      expect(findings.find((f) => f.id === 'IOS-SEC-001')?.status).toBe('PASS');
    });

    it('verifies Keychain usage, Privacy Manifest present, and XCTest suite', () => {
      expect(findings.find((f) => f.id === 'IOS-SEC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'IOS-SEC-003')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'IOS-TEST-001')?.status).toBe('PASS');
    });
  });

  describe('4. Static Checks on Defective iOS Project', () => {
    const projectDir = path.join(fixturesDir, 'defective-ios');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags NSAllowsArbitraryLoads = true as high failure (MASVS-NETWORK)', () => {
      const sec1 = findings.find((f) => f.id === 'IOS-SEC-001');
      expect(sec1?.status).toBe('FAIL');
      expect(sec1?.severity).toBe('high');
    });

    it('flags cleartext UserDefaults token persistence as high failure (MASVS-STORAGE)', () => {
      const sec2 = findings.find((f) => f.id === 'IOS-SEC-002');
      expect(sec2?.status).toBe('FAIL');
      expect(sec2?.severity).toBe('high');
    });

    it('flags missing PrivacyInfo.xcprivacy as warning (MASVS-PRIVACY)', () => {
      const sec3 = findings.find((f) => f.id === 'IOS-SEC-003');
      expect(sec3?.status).toBe('WARNING');
      expect(sec3?.severity).toBe('medium');
    });
  });

  describe('5. Platform Constraint Transparency & Dynamic Execution', () => {
    it('evaluates native compilation to NOT_RUN with explicit message on non-macOS hosts', () => {
      const projectDir = path.join(fixturesDir, 'healthy-ios');
      const target = { absPath: projectDir, path: '.' };
      const findings = adapter.runDynamicChecks(target, { projectDir, allowExec: false }, () => {});

      if (process.platform !== 'darwin') {
        const dynFinding = findings.find((f) => f.id === 'IOS-TEST-002');
        expect(dynFinding?.status).toBe('NOT_RUN');
        expect(dynFinding?.explanation).toContain('macOS');
      }
    });
  });

  describe('6. Full Pipeline Audit Integration', () => {
    it('classifies healthy-ios as mobile application and passes policy gates', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-ios');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('mobile');
      expect(graph.applications[0].frameworks).toContain('ios-native');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBe(0);
      expect(report.policyEvaluation.blockerCount).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(3);
    });

    it('blocks release for defective-ios with disabled ATS and cleartext UserDefaults', async () => {
      const projectDir = path.join(fixturesDir, 'defective-ios');
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
