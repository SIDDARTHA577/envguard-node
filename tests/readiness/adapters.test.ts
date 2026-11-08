import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  runReadinessAudit,
  buildInventoryGraph,
  createDefaultRegistry,
  AdapterRegistry,
  BaseAdapter,
  GenericAdapter,
  NodeTypeScriptAdapter,
  NextJsReactAdapter,
  PythonAdapter,
  JavaSpringBootAdapter,
  ReactNativeAdapter,
  FlutterAdapter,
  AndroidAdapter,
  IosAdapter,
  evaluateReleasePolicy,
  POLICY_OUTCOMES,
} from '../../tools/readiness-auditor.mjs';

describe('EnvGuard Multi-Platform Assessment Engine & Adapters', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

  describe('1. Adapter Contract & Registry Architecture', () => {
    it('creates a default registry with all 9 core built-in adapters', () => {
      const registry = createDefaultRegistry();
      const adapters = registry.getAll();

      expect(adapters.length).toBe(9);
      expect(adapters.map((a) => a.id)).toEqual([
        'generic',
        'node-typescript',
        'nextjs-react',
        'python',
        'java-spring',
        'react-native',
        'flutter',
        'android',
        'ios',
      ]);
      expect(registry.get('generic')).toBeInstanceOf(GenericAdapter);
      expect(registry.get('node-typescript')).toBeInstanceOf(NodeTypeScriptAdapter);
      expect(registry.get('nextjs-react')).toBeInstanceOf(NextJsReactAdapter);
      expect(registry.get('python')).toBeInstanceOf(PythonAdapter);
      expect(registry.get('java-spring')).toBeInstanceOf(JavaSpringBootAdapter);
      expect(registry.get('react-native')).toBeInstanceOf(ReactNativeAdapter);
      expect(registry.get('flutter')).toBeInstanceOf(FlutterAdapter);
      expect(registry.get('android')).toBeInstanceOf(AndroidAdapter);
      expect(registry.get('ios')).toBeInstanceOf(IosAdapter);
    });

    it('validates adapter contract and rejects non-BaseAdapter instances', () => {
      const registry = new AdapterRegistry();
      expect(() => {
        // @ts-expect-error Invalid adapter registration test
        registry.register({ id: 'invalid-object' });
      }).toThrow(/must be an instance of BaseAdapter/);
    });

    it('rejects duplicate adapter IDs in registry', () => {
      const registry = new AdapterRegistry();
      registry.register(new GenericAdapter());
      expect(() => {
        registry.register(new GenericAdapter());
      }).toThrow(/already registered/);
    });

    it('BaseAdapter enforces id, name, and semantic version', () => {
      expect(() => {
        // @ts-expect-error Contract enforcement test
        new BaseAdapter({ name: 'test', version: '1.0.0' });
      }).toThrow(/requires a non-empty string id/);
      expect(() => {
        // @ts-expect-error Contract enforcement test
        new BaseAdapter({ id: 'test', version: '1.0.0' });
      }).toThrow(/requires a non-empty string name/);
      expect(() => {
        // @ts-expect-error Contract enforcement test
        new BaseAdapter({ id: 'test', name: 'test' });
      }).toThrow(/requires a semantic version string/);
    });
  });

  describe('2. Project Discovery & Inventory Graph Construction', () => {
    it('constructs an inventory graph for a standalone Express project (healthy-app)', () => {
      const projectDir = path.join(fixturesDir, 'healthy-app');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.repository.isMonorepo).toBe(false);
      expect(graph.repository.name).toBe('healthy-app');
      expect(graph.applications.length).toBe(1);

      const app = graph.applications[0];
      expect(app.id).toBe('healthy-app');
      expect(app.type).toBe('backend');
      expect(app.confidence).toBe('verified');
      expect(app.frameworks).toContain('express');
      expect(app.databases).toContain('postgresql');
      expect(app.deploymentTargets).toContain('docker');
    });

    it('constructs an inventory graph for a multi-application Monorepo (monorepo-app)', () => {
      const projectDir = path.join(fixturesDir, 'monorepo-app');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.repository.isMonorepo).toBe(true);
      expect(graph.repository.monorepoType).toBe('npm-yarn');
      expect(graph.applications.length).toBe(3);

      const appNames = graph.applications.map((a) => a.name);
      expect(appNames).toContain('@monorepo/web');
      expect(appNames).toContain('@monorepo/api');
      expect(appNames).toContain('@monorepo/shared');

      const webApp = graph.applications.find((a) => a.name === '@monorepo/web');
      expect(webApp?.type).toBe('frontend');
      expect(webApp?.frameworks).toContain('nextjs');
      expect(webApp?.frameworks).toContain('react');

      const apiApp = graph.applications.find((a) => a.name === '@monorepo/api');
      expect(apiApp?.type).toBe('backend');
      expect(apiApp?.frameworks).toContain('express');
      expect(apiApp?.databases).toContain('postgresql');

      const sharedLib = graph.applications.find((a) => a.name === '@monorepo/shared');
      expect(sharedLib?.type).toBe('library');

      // Verify dependency relationships (web and api depend on shared)
      expect(graph.relationships.length).toBeGreaterThanOrEqual(2);
      const sharedDeps = graph.relationships.filter((r) => r.to === '@monorepo/shared');
      expect(sharedDeps.length).toBe(2);
    });

    it('constructs an inventory graph for a pure library (library-only)', () => {
      const projectDir = path.join(fixturesDir, 'library-only');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.repository.isMonorepo).toBe(false);
      expect(graph.applications.length).toBe(1);

      const app = graph.applications[0];
      expect(app.type).toBe('library');
      expect(app.confidence).toBe('verified');
      expect(app.languages).toContain('typescript');
      expect(app.frameworks.length).toBe(0);
      expect(app.databases.length).toBe(0);
    });

    it('constructs an inventory graph for an unsupported repository (unsupported-repo)', () => {
      const projectDir = path.join(fixturesDir, 'unsupported-repo');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.repository.isMonorepo).toBe(false);
      expect(graph.applications.length).toBe(1);

      const app = graph.applications[0];
      expect(app.type).toBe('unknown');
      expect(app.confidence).toBe('uncertain');
      expect(app.uncertaintyReason).toContain('No package.json manifest found');
    });
  });

  describe('3. Next.js & React Web Application Adapter (NextJsReactAdapter)', () => {
    const projectDir = path.join(fixturesDir, 'nextjs-app');

    it('detects Next.js and React architecture accurately', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.projectMetadata.architecture).toBe('frontend');
      const archFinding = report.findings.find((f) => f.id === 'NEXT-001');
      expect(archFinding?.status).toBe('PASS');
      expect(archFinding?.title).toContain('Next.js & React Architecture');
      expect(archFinding?.explanation).toContain('app_router');
    });

    it('verifies client-server environment boundary security (NEXT-002 PASS)', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      const envBoundary = report.findings.find((f) => f.id === 'NEXT-002');
      expect(envBoundary?.status).toBe('PASS');
      expect(envBoundary?.title).toContain('Client-Server Environment Boundary Properly Enforced');
    });

    it('flags client components leaking server-only environment variables (NEXT-002 FAIL)', () => {
      const leakProject = path.join(fixturesDir, 'nextjs-leak');
      const report = runReadinessAudit({ projectDir: leakProject, allowExec: false });

      const leakFinding = report.findings.find((f) => f.id === 'NEXT-002');
      expect(leakFinding?.status).toBe('FAIL');
      expect(leakFinding?.severity).toBe('critical');
      expect(leakFinding?.title).toContain('Client Component Accessing Server-Only Environment Variable');
      expect(leakFinding?.explanation).toContain('DATABASE_URL');
      expect(leakFinding?.evidence?.snippet).toContain('DATABASE_URL');

      // Policy evaluation must block release due to critical leak
      expect(report.policyEvaluation.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(report.policyEvaluation.blockerCount).toBeGreaterThanOrEqual(1);
    });

    it('verifies TypeScript strictness, automated a11y tooling, core web vitals, and security headers', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      // NEXT-003: Strict TypeScript
      const strictTs = report.findings.find((f) => f.id === 'NEXT-003');
      expect(strictTs?.status).toBe('PASS');

      // NEXT-004: eslint-plugin-jsx-a11y
      const a11y = report.findings.find((f) => f.id === 'NEXT-004');
      expect(a11y?.status).toBe('PASS');

      // NEXT-005: next/image and next/font
      const webVitals = report.findings.find((f) => f.id === 'NEXT-005');
      expect(webVitals?.status).toBe('PASS');
      expect(webVitals?.explanation).toContain('next/image');

      // NEXT-006: @next/bundle-analyzer
      const bundleAnalyzer = report.findings.find((f) => f.id === 'NEXT-006');
      expect(bundleAnalyzer?.status).toBe('PASS');

      // NEXT-007: Security headers in next.config.js
      const secHeaders = report.findings.find((f) => f.id === 'NEXT-007');
      expect(secHeaders?.status).toBe('PASS');
      expect(secHeaders?.explanation).toContain('next.config.js');

      // NEXT-008: Manual review for keyboard & screen reader
      const manualReview = report.findings.find((f) => f.id === 'NEXT-008');
      expect(manualReview?.status).toBe('MANUAL_REVIEW');
    });
  });

  describe('4. Multi-Application Monorepo Assessment (monorepo-app)', () => {
    const projectDir = path.join(fixturesDir, 'monorepo-app');

    it('assesses all applications and tags findings with target paths', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.projectMetadata.architecture).toBe('monorepo');
      expect(report.projectMetadata.inventory.applications.length).toBe(3);

      const targetPaths = Array.from(new Set(report.findings.map((f) => f.targetPath)));
      expect(targetPaths).toContain('apps/web');
      expect(targetPaths).toContain('apps/api');
      expect(targetPaths).toContain('packages/shared');

      // apps/web findings include Next.js checks
      const webNextFinding = report.findings.find(
        (f) => f.targetPath === 'apps/web' && f.id === 'NEXT-001'
      );
      expect(webNextFinding?.status).toBe('PASS');

      // apps/api findings include Express/Node checks
      const apiFinding = report.findings.find(
        (f) => f.targetPath === 'apps/api' && f.id === 'DEP-002'
      );
      expect(apiFinding?.status).toBe('PASS'); // /health route found
    });
  });

  describe('5. Library-Only Repository Assessment (library-only)', () => {
    const projectDir = path.join(fixturesDir, 'library-only');

    it('marks server-specific checks as NOT_APPLICABLE with zero hard failures', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.summary.fail).toBe(0);

      // Server health endpoint check must be NOT_APPLICABLE
      const healthCheck = report.findings.find((f) => f.id === 'DEP-002');
      expect(healthCheck?.status).toBe('NOT_APPLICABLE');
      expect(healthCheck?.explanation.toLowerCase()).toContain('library package');

      // Graceful shutdown must be NOT_APPLICABLE
      const shutdownCheck = report.findings.find((f) => f.id === 'DEP-003');
      expect(shutdownCheck?.status).toBe('NOT_APPLICABLE');

      // Helmet security headers must be NOT_APPLICABLE
      const helmetCheck = report.findings.find((f) => f.id === 'SEC-003');
      expect(helmetCheck?.status).toBe('NOT_APPLICABLE');

      // OpenAPI spec must be NOT_APPLICABLE
      const openapiCheck = report.findings.find((f) => f.id === 'API-001');
      expect(openapiCheck?.status).toBe('NOT_APPLICABLE');

      // Library build and manifest checks must pass
      const manifestCheck = report.findings.find((f) => f.id === 'DISC-001');
      expect(manifestCheck?.status).toBe('PASS');

      const enginesCheck = report.findings.find((f) => f.id === 'DISC-002');
      expect(enginesCheck?.status).toBe('PASS');
    });
  });

  describe('6. Unsupported/Unknown Repository Assessment (unsupported-repo)', () => {
    const projectDir = path.join(fixturesDir, 'unsupported-repo');

    it('runs only generic repository hygiene checks and reports limitations accurately', () => {
      const report = runReadinessAudit({ projectDir, allowExec: false });

      expect(report.projectMetadata.architecture).toBe('unknown');
      expect(report.summary.fail).toBe(0); // No hard false-positive failures

      // Generic adapter checks run
      const gitignoreFinding = report.findings.find((f) => f.id === 'ENV-002');
      expect(gitignoreFinding?.status).toBe('PASS');

      // Limitations are documented
      expect(report.limitations.length).toBeGreaterThan(0);
      expect(report.policyEvaluation.outcome).toBeDefined();
    });
  });

  describe('7. Release Policy Evaluation Framework', () => {
    it('evaluates policy gates and produces BLOCKED on critical failures', () => {
      const mockFindings = [
        {
          id: 'ENV-004',
          status: 'FAIL',
          severity: 'critical',
          title: 'Sensitive .env File Tracked',
        },
      ];
      const mockSummary = { fail: 1, pass: 10, warning: 0, notRun: 0, manualReview: 0, notApplicable: 0, error: 0, totalChecks: 11 };
      const evalResult = evaluateReleasePolicy(mockFindings, mockSummary);

      expect(evalResult.outcome).toBe(POLICY_OUTCOMES.BLOCKED);
      expect(evalResult.blockerCount).toBe(1);
      expect(evalResult.gates.zeroBlockers).toBe(false);
    });

    it('produces INCOMPLETE_ASSESSMENT when critical tests are skipped in read-only mode', () => {
      const mockFindings = [
        {
          id: 'BUILD-002',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Test Script Not Run',
        },
      ];
      const mockSummary = { fail: 0, pass: 10, warning: 0, notRun: 1, manualReview: 0, notApplicable: 0, error: 0, totalChecks: 11 };
      const evalResult = evaluateReleasePolicy(mockFindings, mockSummary, { allowExec: false });

      expect(evalResult.outcome).toBe(POLICY_OUTCOMES.INCOMPLETE_ASSESSMENT);
      expect(evalResult.gates.testExecutionComplete).toBe(false);
    });

    it('produces MANUAL_REVIEW_REQUIRED when heuristics require human sign-off', () => {
      const mockFindings = [
        {
          id: 'A11Y-002',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Manual Keyboard Testing Required',
        },
      ];
      const mockSummary = { fail: 0, pass: 10, warning: 0, notRun: 0, manualReview: 1, notApplicable: 0, error: 0, totalChecks: 11 };
      const evalResult = evaluateReleasePolicy(mockFindings, mockSummary, { allowExec: true });

      expect(evalResult.outcome).toBe(POLICY_OUTCOMES.MANUAL_REVIEW_REQUIRED);
      expect(evalResult.gates.manualReviewsIdentified).toBe(true);
    });

    it('produces READY_FOR_HUMAN_RELEASE_REVIEW when all gates pass cleanly', () => {
      const mockFindings = [
        {
          id: 'BUILD-002',
          status: 'PASS',
          severity: 'info',
          title: 'Test Script Passed',
        },
      ];
      const mockSummary = { fail: 0, pass: 10, warning: 0, notRun: 0, manualReview: 0, notApplicable: 0, error: 0, totalChecks: 10 };
      const evalResult = evaluateReleasePolicy(mockFindings, mockSummary, { allowExec: true });

      expect(evalResult.outcome).toBe(POLICY_OUTCOMES.READY_FOR_REVIEW);
      expect(evalResult.gates.zeroBlockers).toBe(true);
      expect(evalResult.gates.testExecutionComplete).toBe(true);
    });
  });
});
