import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import {
  buildInventoryGraph,
  buildArchitectureInventory,
  discoverArchitectureRequirements,
  buildCapacityModel,
  generate10kVirtualUserScenario,
  runLocalBenchmark,
} from '../../tools/readiness-auditor.mjs';

describe('Capacity Planning, Workload Scenarios & Performance Engine', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'senior-review');

  describe('1. Capacity Planning & Hypothetical 10k-VU Modeling', () => {
    it('generates clearly labeled hypothetical 10,000-VU workload scenario', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);

      const scenario = generate10kVirtualUserScenario(arch);
      expect(scenario.parameters.virtualUsers).toBe(10000);
      expect(scenario.parameters.projectedPeakRps).toBe(1500);
      expect(scenario.disclaimer).toContain('A 10,000-VU synthetic load configuration does not certify');
      expect(scenario.k6ScriptTemplate).toContain("duration: '5m', target: 10000");
    });

    it('differentiates user-provided metrics from hypothetical models', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const model = buildCapacityModel(arch, reqs);
      expect(model.workloadState).toBe('HYPOTHETICAL_SCENARIO_ONLY');
      expect(model.observedMetrics.isMeasuredInProduction).toBe(false);
      expect(model.observedMetrics.dailyActiveUsers).toBeNull();
      expect(model.prerequisitesForExecution.length).toBeGreaterThanOrEqual(4);
    });

    it('calculates database connection pool limits and compute replicas for provided workload', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir, {
        traffic: { requestsPerSecondPeak: 800, dailyActiveUsers: 50000, status: 'PROVIDED' },
      });

      const model = buildCapacityModel(arch, reqs);
      expect(model.workloadState).toBe('USER_PROVIDED');
      expect(model.resourceProjections.recommendedDatabasePoolSize?.perInstanceMax).toBe(20);
      expect(model.resourceProjections.recommendedComputeReplicas).toBeGreaterThanOrEqual(3);
    });
  });

  describe('2. Safe Localhost Performance Benchmarking (runLocalBenchmark)', () => {
    interface MockResponse {
      statusCode: number;
      resume: () => void;
    }
    interface MockEmitter {
      on: (event: string, handler: (err?: Error) => void) => MockEmitter;
      destroy: (err?: Error) => void;
    }
    interface MockTransport {
      get: (url: string, opts: unknown, cb: (res: MockResponse) => void) => MockEmitter;
    }

    let server: http.Server;
    let localPort: number;
    let fallbackTransport: MockTransport | null = null;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/healthz') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ slow: true }));
          }, 30);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (address && typeof address !== 'string') {
            localPort = address.port;
          }
          resolve();
        });
      });

      // Probe whether localhost socket connections are permitted in current environment (sandbox check)
      let canConnect = true;
      try {
        await new Promise<void>((resolve, reject) => {
          const probe = http.get(`http://127.0.0.1:${localPort}/healthz`, (res) => {
            res.resume();
            resolve();
          });
          probe.on('error', reject);
        });
      } catch {
        canConnect = false;
      }

      if (!canConnect) {
        // In sandboxed environments without loopback socket access, provide mock transport to exercise calculations
        fallbackTransport = {
          get(url: string, _opts: unknown, cb: (res: MockResponse) => void) {
            const isSlow = url.includes('/slow');
            const emitter: MockEmitter = {
              on: () => emitter,
              destroy: () => {},
            };
            setTimeout(() => {
              const resEmitter: MockResponse = {
                statusCode: 200,
                resume: () => {},
              };
              cb(resEmitter);
            }, isSlow ? 30 : 2);
            return emitter;
          },
        };
      }
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('measures throughput and computes latency percentiles against localhost endpoint', async () => {
      const targetUrl = `http://127.0.0.1:${localPort}/healthz`;
      const result = await runLocalBenchmark({
        targetUrl,
        durationMs: 1000,
        concurrency: 4,
        p95ThresholdMs: 500,
        transport: fallbackTransport,
      });

      expect(result.totalRequests).toBeGreaterThan(10);
      expect(result.successfulRequests).toBe(result.totalRequests);
      expect(result.failedRequests).toBe(0);
      expect(result.throughputRps).toBeGreaterThan(0);
      expect(result.latency.p50).toBeGreaterThanOrEqual(0);
      expect(result.latency.p95).toBeGreaterThanOrEqual(result.latency.p50);
      expect(result.latency.p99).toBeGreaterThanOrEqual(result.latency.p95);
      expect(result.thresholds.passed).toBe(true);
      expect(result.thresholds.violations.length).toBe(0);
    });

    it('detects threshold violations when latency exceeds defined threshold', async () => {
      const targetUrl = `http://127.0.0.1:${localPort}/slow`;
      const result = await runLocalBenchmark({
        targetUrl,
        durationMs: 800,
        concurrency: 2,
        p95ThresholdMs: 5, // Unrealistically low threshold (5ms) for a 30ms artificial delay
        transport: fallbackTransport,
      });

      expect(result.totalRequests).toBeGreaterThan(0);
      expect(result.thresholds.passed).toBe(false);
      expect(result.thresholds.violations.length).toBeGreaterThan(0);
      expect(result.thresholds.violations[0]).toContain('exceeded threshold of 5ms');
    });

    it('blocks non-localhost remote targets unless allowExternalTarget is explicitly true', async () => {
      await expect(
        runLocalBenchmark({
          targetUrl: 'http://example.com/api',
          durationMs: 500,
        })
      ).rejects.toThrow('Safety guard: Target "example.com" is not localhost');
    });
  });
});
