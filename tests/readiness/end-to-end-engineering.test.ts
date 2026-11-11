import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ENGINEERING_WORKFLOW_STEPS,
  runIntegratedEngineeringWorkflow,
  WORKFLOW_EVIDENCE_CLASSES,
} from '../../tools/readiness/orchestration/index.mjs';

interface WorkflowStep {
  id: string;
  status: string;
  details: Record<string, unknown>;
}

interface BenchmarkMetrics {
  totalRequests: number;
  successfulRequests: number;
  latency: { p95: number; avg: number };
  throughputRps: number;
  errorRatePercent: number;
}

interface WorkflowResult {
  projectRoot: string;
  steps: WorkflowStep[];
  stepCount: number;
  skillSelection: {
    selectedSkills: Array<{ name: string; priority: string }>;
    executionSequence: string[];
  };
  baselineReport: {
    findings: Array<{ id: string; status: string; targetPath?: string }>;
    summary: { fail: number; pass: number };
    policyEvaluation?: { outcome?: string };
  };
  followUpReport: {
    findings: Array<{ id: string; status: string; targetPath?: string }>;
    summary: { fail: number; pass: number };
    policyEvaluation?: { outcome?: string };
  };
  comparison: {
    statusTransition: {
      from: string;
      to: string;
      verdict: string;
      improved: boolean;
      regressed: boolean;
    };
    resolvedFindings: Array<{ id: string; targetPath?: string }>;
    regressedFindings: Array<{ id: string }>;
  };
  deploymentGate: {
    verdict: string;
    deployable: boolean;
    missingPrerequisites: Array<{ id: string }>;
    executionGuard: { autoDeployAllowed: boolean; policy: string };
  };
  dynamicTests: {
    targetCount: number;
    executed: boolean;
    allPassed: boolean;
    anyFailed: boolean;
  };
  beforeBenchmark: BenchmarkMetrics | null;
  afterBenchmark: BenchmarkMetrics | null;
  benchmarkDelta: {
    beforeP95Ms: number | null;
    afterP95Ms: number | null;
    beforeRps: number | null;
    afterRps: number | null;
  } | null;
  checkpoint: { id: string } | null;
  evidenceClassification: {
    staticAudit: string;
    dynamicTests: string;
    performanceBenchmark: string;
    autonomousProductionDeploy: string;
    disclosure: {
      autonomousDeploymentAllowed: boolean;
    };
  };
  reports: {
    engineeringReportMarkdown: string;
    comparisonMarkdown: string;
    writtenArtifacts: string[];
  };
}

function writeFiles(baseDir: string, entries: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(entries)) {
    const full = path.join(baseDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

describe('Phase 16: End-to-End 20-Step Engineering Workflow & Demonstration Scenarios', () => {
  const tempDirs: string[] = [];
  const servers: http.Server[] = [];

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (servers.length > 0) {
      const srv = servers.pop();
      if (srv) {
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('enforces approval & non-deployment gates in dry-run mode across all 20 canonical steps', async () => {
    const projectDir = createTempDir('envguard-p16-dryrun-');
    writeFiles(projectDir, {
      'package.json': JSON.stringify({
        name: 'dryrun-app',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22.0.0' },
        dependencies: { express: '^4.21.0' },
      }),
      'src/app.mjs': 'export const port = process.env.PORT || 3000;\n',
    });

    const result = (await runIntegratedEngineeringWorkflow({
      projectDir,
      approveChanges: false,
      allowExec: false,
      trustProject: false,
    })) as WorkflowResult;

    expect(result.stepCount).toBe(20);
    expect(result.steps.map((s) => s.id)).toEqual(ENGINEERING_WORKFLOW_STEPS);
    expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(false);

    const step11 = result.steps.find((s) => s.id === '11_human_approval_gate');
    const step12 = result.steps.find((s) => s.id === '12_implementation_or_remediation');
    expect(step11?.status).toBe(WORKFLOW_EVIDENCE_CLASSES.PARTIALLY_VERIFIED);
    expect(step12?.status).toBe(WORKFLOW_EVIDENCE_CLASSES.NOT_VERIFIED);
    expect(result.evidenceClassification.disclosure.autonomousDeploymentAllowed).toBe(false);
    expect(result.deploymentGate.executionGuard.autoDeployAllowed).toBe(false);
  });

  it('Scenario A: delivers full-stack validation, API contract, PostgreSQL persistence, and passing unit/integration tests', async () => {
    const projectDir = createTempDir('envguard-p16-scenario-a-');
    const reportOutDir = createTempDir('envguard-p16-scenario-a-out-');

    writeFiles(projectDir, {
      'package.json': JSON.stringify({
        name: 'fullstack-task-tracker',
        private: true,
        version: '1.0.0',
        type: 'module',
      }),
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
      'apps/web/package.json': JSON.stringify({
        name: '@tasks/web',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22.0.0' },
        scripts: { build: 'node --check src/form.mjs', test: 'node --test' },
        dependencies: { react: '^18.3.1' },
      }),
      'apps/web/src/form.mjs': 'export function validateTaskInput() { return { ok: false }; }\n',
      'apps/web/tests/form.test.mjs':
        "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('placeholder web suite', () => { assert.ok(true); });\n",
      'apps/api/package.json': JSON.stringify({
        name: '@tasks/api',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22.0.0' },
        scripts: { build: 'node --check src/server.mjs', test: 'node --test' },
        dependencies: { express: '^4.21.0', pg: '^8.12.0' },
      }),
      'apps/api/migrations/001_tasks.sql':
        'CREATE TABLE tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, priority TEXT NOT NULL);\n',
      'apps/api/migrations/001_tasks.down.sql': 'DROP TABLE IF EXISTS tasks;\n',
      'apps/api/src/server.mjs': 'export const port = Number(process.env.API_PORT || 4000);\n',
      'apps/api/tests/tasks.test.mjs':
        "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('placeholder api suite', () => { assert.ok(true); });\n",
    });

    const result = (await runIntegratedEngineeringWorkflow({
      projectDir,
      requirements: {
        teamSize: 'small (3 engineers)',
        availability: { level: 'standard' },
      },
      approveChanges: true,
      allowExec: true,
      trustProject: true,
      outputDir: reportOutDir,
      implementationHook: async ({ projectDir: root }) => {
        writeFiles(root, {
          'apps/web/src/form.mjs': [
            'export function validateTaskInput(payload) {',
            '  const title = typeof payload?.title === "string" ? payload.title.trim() : "";',
            '  const priority = payload?.priority || "normal";',
            '  if (title.length < 3 || title.length > 120) {',
            '    return { valid: false, error: "Title must be between 3 and 120 characters." };',
            '  }',
            '  if (!["low", "normal", "high"].includes(priority)) {',
            '    return { valid: false, error: "Invalid priority value." };',
            '  }',
            '  return { valid: true, value: { title, priority } };',
            '}',
            '',
          ].join('\n'),
          'apps/web/tests/form.test.mjs': [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "import { validateTaskInput } from '../src/form.mjs';",
            '',
            "test('rejects short titles and accepts valid task form inputs', () => {",
            '  assert.equal(validateTaskInput({ title: "ab" }).valid, false);',
            '  assert.equal(validateTaskInput({ title: "Ship release", priority: "invalid" }).valid, false);',
            '  const ok = validateTaskInput({ title: "  Ship release  ", priority: "high" });',
            '  assert.equal(ok.valid, true);',
            '  assert.deepEqual(ok.value, { title: "Ship release", priority: "high" });',
            '});',
            '',
          ].join('\n'),
          'apps/api/src/server.mjs': [
            'export async function createTaskHandler(body, store) {',
            '  const title = typeof body?.title === "string" ? body.title.trim() : "";',
            '  const priority = body?.priority || "normal";',
            '  if (title.length < 3 || !["low", "normal", "high"].includes(priority)) {',
            '    return { status: 400, body: { type: "about:blank", title: "Validation Failed", status: 400 } };',
            '  }',
            '  const query = { text: "INSERT INTO tasks (title, priority) VALUES ($1, $2) RETURNING id", values: [title, priority] };',
            '  const saved = await store.execute(query);',
            '  return { status: 201, body: saved };',
            '}',
            '',
          ].join('\n'),
          'apps/api/tests/tasks.test.mjs': [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "import { createTaskHandler } from '../src/server.mjs';",
            '',
            "test('enforces API contract and parameterized persistence', async () => {",
            '  const calls = [];',
            '  const store = { execute: async (q) => { calls.push(q); return { id: 1, title: q.values[0] }; } };',
            '  const bad = await createTaskHandler({ title: "x" }, store);',
            '  assert.equal(bad.status, 400);',
            '  assert.equal(calls.length, 0);',
            '  const good = await createTaskHandler({ title: "Audit EnvGuard", priority: "high" }, store);',
            '  assert.equal(good.status, 201);',
            '  assert.ok(calls[0].text.includes("$1, $2"));',
            '});',
            '',
          ].join('\n'),
        });
        return {
          modifiedFiles: [
            'apps/web/src/form.mjs',
            'apps/web/tests/form.test.mjs',
            'apps/api/src/server.mjs',
            'apps/api/tests/tasks.test.mjs',
          ],
          notes: 'Implemented form validation, REST contract handler, and parameterized persistence.',
        };
      },
    })) as WorkflowResult;

    expect(result.stepCount).toBe(20);
    expect(result.skillSelection.executionSequence).toEqual(
      expect.arrayContaining([
        'envguard-production-readiness',
        'envguard-senior-engineer-review',
        'envguard-frontend',
        'envguard-backend',
        'envguard-api-design',
        'envguard-database',
        'envguard-fullstack-integration',
      ])
    );

    expect(result.dynamicTests.executed).toBe(true);
    expect(result.dynamicTests.allPassed).toBe(true);
    expect(result.dynamicTests.targetCount).toBe(2);
    expect(result.comparison.statusTransition.improved).toBe(true);
    expect(result.comparison.regressedFindings).toEqual([]);
    expect(result.reports.writtenArtifacts).toHaveLength(2);
    for (const filePath of result.reports.writtenArtifacts) {
      expect(fs.existsSync(filePath)).toBe(true);
    }
  }, 30000);

  it('Scenario B: remediates unsafe SQL and missing route auth with security regression tests and comparative proof', async () => {
    const projectDir = createTempDir('envguard-p16-scenario-b-');

    writeFiles(projectDir, {
      'package.json': JSON.stringify({
        name: 'secure-admin-api',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22.0.0' },
        scripts: { build: 'node --check src/routes/admin.mjs', test: 'node --test' },
        dependencies: { express: '^4.21.0', pg: '^8.12.0', helmet: '^8.0.0' },
      }),
      'migrations/001_users.sql': 'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, role TEXT);\n',
      'migrations/001_users.down.sql': 'DROP TABLE IF EXISTS users;\n',
      'src/routes/admin.mjs': [
        'const adminSecret = process.env.ADMIN_API_TOKEN;',
        'export async function listUsersUnsafe(pool, role) {',
        '  // Seeded vulnerability: unauthenticated caller & raw SQL string interpolation',
        '  return pool.query(`SELECT id, email FROM users WHERE role = \'${role}\'`);',
        '}',
        'export function getConfiguredToken() { return adminSecret; }',
        '',
      ].join('\n'),
      'tests/security.test.mjs':
        "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('baseline suite', () => { assert.ok(true); });\n",
    });

    const result = (await runIntegratedEngineeringWorkflow({
      projectDir,
      approveChanges: true,
      allowExec: true,
      trustProject: true,
      implementationHook: async ({ projectDir: root }) => {
        writeFiles(root, {
          'src/routes/admin.mjs': [
            'import crypto from "node:crypto";',
            'export function verifyAdminToken(providedToken, expectedToken = process.env.ADMIN_API_TOKEN) {',
            '  if (!providedToken || !expectedToken) return false;',
            '  const a = Buffer.from(providedToken, "utf8");',
            '  const b = Buffer.from(expectedToken, "utf8");',
            '  return a.length === b.length && crypto.timingSafeEqual(a, b);',
            '}',
            'export async function listUsersAuthorized(req, pool) {',
            '  if (!verifyAdminToken(req?.headers?.authorization?.replace(/^Bearer\\s+/i, ""))) {',
            '    return { status: 401, body: { error: "Unauthorized" } };',
            '  }',
            '  const role = String(req?.query?.role || "member");',
            '  if (!["member", "auditor", "admin"].includes(role)) {',
            '    return { status: 400, body: { error: "Invalid role filter" } };',
            '  }',
            '  const rows = await pool.query("SELECT id, email FROM users WHERE role = $1", [role]);',
            '  return { status: 200, body: rows };',
            '}',
            '',
          ].join('\n'),
          'tests/security.test.mjs': [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "import { listUsersAuthorized } from '../src/routes/admin.mjs';",
            '',
            "test('rejects missing bearer token, invalid roles, and parameterizes SQL query', async () => {",
            '  process.env.ADMIN_API_TOKEN = "test-admin-token-01";',
            '  const calls = [];',
            '  const mockPool = { query: async (sql, params) => { calls.push({ sql, params }); return []; } };',
            '  const unauth = await listUsersAuthorized({ headers: {}, query: { role: "member" } }, mockPool);',
            '  assert.equal(unauth.status, 401);',
            '  assert.equal(calls.length, 0);',
            '  const badRole = await listUsersAuthorized({ headers: { authorization: "Bearer test-admin-token-01" }, query: { role: "admin; DROP TABLE users" } }, mockPool);',
            '  assert.equal(badRole.status, 400);',
            '  const ok = await listUsersAuthorized({ headers: { authorization: "Bearer test-admin-token-01" }, query: { role: "auditor" } }, mockPool);',
            '  assert.equal(ok.status, 200);',
            '  assert.equal(calls[0].sql, "SELECT id, email FROM users WHERE role = $1");',
            '  assert.deepEqual(calls[0].params, ["auditor"]);',
            '});',
            '',
          ].join('\n'),
        });
        return { modifiedFiles: ['src/routes/admin.mjs', 'tests/security.test.mjs'] };
      },
    })) as WorkflowResult;

    const baselineDb004 = result.baselineReport.findings.find((f) => f.id === 'DB-004');
    expect(baselineDb004?.status).toBe('FAIL');

    const followUpDb004 = result.followUpReport.findings.find((f) => f.id === 'DB-004');
    expect(followUpDb004?.status).not.toBe('FAIL');
    expect(result.followUpReport.summary.fail).toBe(0);

    expect(result.dynamicTests.executed).toBe(true);
    expect(result.dynamicTests.allPassed).toBe(true);
    expect(result.comparison.statusTransition.improved).toBe(true);
    expect(result.comparison.regressedFindings).toEqual([]);
    expect(result.checkpoint).not.toBeNull();
  }, 30000);

  it('Scenario C: measures real localhost latency/throughput improvement and adds graceful shutdown & health probe', async () => {
    const projectDir = createTempDir('envguard-p16-scenario-c-');

    writeFiles(projectDir, {
      'package.json': JSON.stringify({
        name: 'perf-service-api',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22.0.0' },
        scripts: { build: 'node --check src/server.mjs', test: 'node --test' },
        dependencies: { express: '^4.21.0' },
      }),
      '.env.example': 'PORT=3000\n',
      '.gitignore': '.env\n.env.*\n!.env.example\nnode_modules/\n',
      'src/server.mjs': 'export function getCatalog() { return { items: [1, 2, 3] }; }\n',
      'tests/perf.test.mjs':
        "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { getCatalog } from '../src/server.mjs';\ntest('returns catalog items', () => { assert.equal(getCatalog().items.length, 3); });\n",
    });

    let optimized = false;
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"ok"}');
        return;
      }
      if (!optimized) {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ cached: false, count: 3 }));
        }, 35);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cached: true, count: 3 }));
      }
    });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    const targetUrl = `http://127.0.0.1:${address.port}/items`;

    let canConnectLoopback = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const probe = http.get(`http://127.0.0.1:${address.port}/health`, (res) => {
          res.resume();
          resolve();
        });
        probe.on('error', reject);
      });
    } catch {
      canConnectLoopback = false;
    }

    const fallbackTransport = canConnectLoopback
      ? null
      : {
          get(
            _url: string,
            _opts: unknown,
            cb: (res: { statusCode: number; resume: () => void }) => void
          ) {
            const emitter = {
              on: () => emitter,
              destroy: () => {},
            };
            setTimeout(() => {
              cb({ statusCode: 200, resume: () => {} });
            }, optimized ? 1 : 35);
            return emitter;
          },
        };

    const result = (await runIntegratedEngineeringWorkflow({
      projectDir,
      approveChanges: true,
      allowExec: true,
      trustProject: true,
      benchmarkUrl: targetUrl,
      benchmarkOptions: {
        durationMs: 450,
        concurrency: 4,
        p95ThresholdMs: 250,
        minSamplesRequired: 5,
        ...(fallbackTransport ? { transport: fallbackTransport } : {}),
      },
      implementationHook: async ({ projectDir: root }) => {
        optimized = true;
        writeFiles(root, {
          'src/server.mjs': [
            'const catalogCache = { items: [1, 2, 3], cachedAt: Date.now() };',
            'export function getCatalog() { return catalogCache; }',
            'export function handleHealth() { return { status: 200, path: "/health", body: { ok: true } }; }',
            'export function registerShutdown(srv) {',
            '  const shutdown = () => srv?.close?.();',
            '  process.on("SIGTERM", shutdown);',
            '  return shutdown;',
            '}',
            '',
          ].join('\n'),
          'tests/perf.test.mjs': [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "import { getCatalog, handleHealth } from '../src/server.mjs';",
            '',
            "test('serves cached catalog and exposes /health probe', () => {",
            '  assert.equal(getCatalog().items.length, 3);',
            '  assert.equal(handleHealth().status, 200);',
            '});',
            '',
          ].join('\n'),
        });
        return {
          modifiedFiles: ['src/server.mjs', 'tests/perf.test.mjs'],
          notes: 'Enabled response cache, /health readiness handler, and SIGTERM graceful shutdown.',
        };
      },
    })) as WorkflowResult;

    expect(result.beforeBenchmark).not.toBeNull();
    expect(result.afterBenchmark).not.toBeNull();
    expect(result.benchmarkDelta).not.toBeNull();
    expect(result.beforeBenchmark?.successfulRequests).toBeGreaterThanOrEqual(5);
    expect(result.afterBenchmark?.successfulRequests).toBeGreaterThanOrEqual(5);

    const beforeP95 = result.beforeBenchmark?.latency.p95 ?? 0;
    const afterP95 = result.afterBenchmark?.latency.p95 ?? Number.POSITIVE_INFINITY;
    const beforeRps = result.beforeBenchmark?.throughputRps ?? 0;
    const afterRps = result.afterBenchmark?.throughputRps ?? 0;

    expect(afterP95).toBeLessThan(beforeP95);
    expect(afterRps).toBeGreaterThan(beforeRps);
    expect(result.dynamicTests.executed).toBe(true);
    expect(result.dynamicTests.allPassed).toBe(true);
    expect(
      result.deploymentGate.missingPrerequisites.some((p) => p.id === 'PREREQ-GRACEFUL-SHUTDOWN')
    ).toBe(false);
    expect(result.deploymentGate.executionGuard.autoDeployAllowed).toBe(false);
  }, 30000);
});

