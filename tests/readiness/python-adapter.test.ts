import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  PythonAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('Python Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'python');
  const adapter = new PythonAdapter();

  describe('1. Adapter Contract & Metadata', () => {
    it('declares correct adapter identifier and metadata', () => {
      expect(adapter.id).toBe('python');
      expect(adapter.name).toContain('Python');
      expect(adapter.supportedLanguages).toContain('python');
      expect(adapter.supportedFrameworks).toEqual(['django', 'fastapi', 'flask']);
      expect(adapter.requiredTools).toContain('python');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('django_readiness');
      expect(capabilities).toContain('fastapi_readiness');
      expect(capabilities).toContain('python_sql_injection');
      expect(capabilities).toContain('python_env_secrets');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(13);
      expect(checks.some((c) => c.id === 'PY-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'PY-SEC-004')).toBe(true);
      expect(checks.some((c) => c.id === 'PY-SEC-006')).toBe(true);
    });

    it('exposes documented limitations', () => {
      const limitations = adapter.getLimitations();
      expect(limitations.length).toBeGreaterThan(0);
      expect(limitations.some((l) => l.includes('static analysis'))).toBe(true);
    });
  });

  describe('2. Platform Detection', () => {
    it('detects healthy Django application with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-django');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.frameworks).toContain('django');
    });

    it('detects healthy FastAPI application with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-fastapi');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.frameworks).toContain('fastapi');
    });

    it('detects ambiguous Python script with heuristic confidence', () => {
      const projectDir = path.join(fixturesDir, 'ambiguous-python');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(0.7);
    });

    it('rejects non-Python project', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Readiness Checks on Healthy Django Application', () => {
    const projectDir = path.join(fixturesDir, 'healthy-django');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies packaging, runtime constraint, and lockfile', () => {
      const disc1 = findings.find((f) => f.id === 'PY-DISC-001');
      expect(disc1?.status).toBe('PASS');

      const disc2 = findings.find((f) => f.id === 'PY-DISC-002');
      expect(disc2?.status).toBe('PASS');

      const disc3 = findings.find((f) => f.id === 'PY-DISC-003');
      expect(disc3?.status).toBe('PASS');
    });

    it('verifies environment configuration and template', () => {
      const envFinding = findings.find((f) => f.id === 'PY-ENV-001');
      expect(envFinding?.status).toBe('PASS');
    });

    it('verifies Django security settings (DEBUG, SECRET_KEY, ALLOWED_HOSTS, Cookies, CSRF, CORS)', () => {
      const sec1 = findings.find((f) => f.id === 'PY-SEC-001');
      expect(sec1?.status).toBe('PASS');

      const sec2 = findings.find((f) => f.id === 'PY-SEC-002');
      expect(sec2?.status).toBe('PASS');

      const sec3 = findings.find((f) => f.id === 'PY-SEC-003');
      expect(sec3?.status).toBe('PASS');

      const sec5 = findings.find((f) => f.id === 'PY-SEC-005');
      expect(sec5?.status).toBe('PASS');

      const sec6 = findings.find((f) => f.id === 'PY-SEC-006');
      expect(sec6?.status).toBe('PASS');
    });

    it('verifies parameterized database queries, migrations, tests, and WSGI deployment', () => {
      const dbSql = findings.find((f) => f.id === 'PY-SEC-004');
      expect(dbSql?.status).toBe('PASS');

      const dbMig = findings.find((f) => f.id === 'PY-DB-001');
      expect(dbMig?.status).toBe('PASS');

      const testFinding = findings.find((f) => f.id === 'PY-TEST-001');
      expect(testFinding?.status).toBe('PASS');

      const deployFinding = findings.find((f) => f.id === 'PY-DEPLOY-001');
      expect(deployFinding?.status).toBe('PASS');
    });
  });

  describe('4. Static Readiness Checks on Defective Django Application', () => {
    const projectDir = path.join(fixturesDir, 'defective-django');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags hardcoded secret key and DEBUG mode as critical failures', () => {
      const sec1 = findings.find((f) => f.id === 'PY-SEC-001');
      expect(sec1?.status).toBe('FAIL');
      expect(sec1?.severity).toBe('critical');
    });

    it('flags wildcard ALLOWED_HOSTS as a high severity failure', () => {
      const sec2 = findings.find((f) => f.id === 'PY-SEC-002');
      expect(sec2?.status).toBe('FAIL');
      expect(sec2?.severity).toBe('high');
    });

    it('flags insecure cookie settings as a failure', () => {
      const sec3 = findings.find((f) => f.id === 'PY-SEC-003');
      expect(sec3?.status).toBe('FAIL');
    });

    it('flags raw f-string SQL query as a critical SQL injection failure', () => {
      const sec4 = findings.find((f) => f.id === 'PY-SEC-004');
      expect(sec4?.status).toBe('FAIL');
      expect(sec4?.severity).toBe('critical');
    });

    it('flags missing CSRF middleware as a high severity failure', () => {
      const sec5 = findings.find((f) => f.id === 'PY-SEC-005');
      expect(sec5?.status).toBe('FAIL');
      expect(sec5?.severity).toBe('high');
    });

    it('flags insecure CORS wildcard origin with credentials as a failure', () => {
      const sec6 = findings.find((f) => f.id === 'PY-SEC-006');
      expect(sec6?.status).toBe('FAIL');
    });
  });

  describe('5. Static Readiness Checks on FastAPI & SQL Injection Target', () => {
    it('verifies healthy FastAPI service passes security and deployment checks', () => {
      const projectDir = path.join(fixturesDir, 'healthy-fastapi');
      const files = collectProjectFiles(projectDir);
      const target = { absPath: projectDir, path: '.', manifest: null };
      const findings = adapter.runStaticChecks(target, { projectDir, files });

      expect(findings.find((f) => f.id === 'PY-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-DISC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-DISC-003')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-ENV-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-SEC-006')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-DB-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-TEST-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'PY-DEPLOY-001')?.status).toBe('PASS');
    });

    it('detects f-string SQL injection in defective-sqli-python', () => {
      const projectDir = path.join(fixturesDir, 'defective-sqli-python');
      const files = collectProjectFiles(projectDir);
      const target = { absPath: projectDir, path: '.', manifest: null };
      const findings = adapter.runStaticChecks(target, { projectDir, files });

      const sqli = findings.find((f) => f.id === 'PY-SEC-004');
      expect(sqli?.status).toBe('FAIL');
      expect(sqli?.severity).toBe('critical');

      const cors = findings.find((f) => f.id === 'PY-SEC-006');
      expect(cors?.status).toBe('FAIL');
    });
  });

  describe('6. Full Pipeline Audit Integration', () => {
    it('runs full readiness audit on healthy-django and classifies project as python backend', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-django');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('backend');
      expect(graph.applications[0].languages).toContain('python');
      expect(graph.applications[0].frameworks).toContain('django');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.schemaVersion).toBe('1.1.0');
      expect(report.summary.fail).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(5);
      expect(report.policyEvaluation.blockerCount).toBe(0);
    });

    it('runs full readiness audit on defective-django and rejects release', async () => {
      const projectDir = path.join(fixturesDir, 'defective-django');
      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBeGreaterThan(0);
      expect(report.policyEvaluation.blockerCount).toBeGreaterThan(0);
      expect(report.policyEvaluation.outcome).toBe('BLOCKED');
    });
  });
});

