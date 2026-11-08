import { describe, it, expect } from 'vitest';
import { runLocalBenchmark } from '../../tools/readiness-auditor.mjs';

describe('Phase 7.4 — Hardened Localhost Benchmark Runner Safety Guardrails', () => {
  interface MockResponse {
    statusCode: number;
    headers?: Record<string, string>;
    resume?: () => void;
    on?: (event: string, handler: (chunk?: Buffer | Error) => void) => void;
  }
  interface MockEmitter {
    on?: (event: string, handler: (err?: Error) => void) => MockEmitter;
    destroy?: (err?: Error) => void;
    end?: () => void;
  }
  interface MockTransport {
    get: (url: string, opts: unknown, cb: (res: MockResponse) => void) => MockEmitter;
    request?: (url: unknown, opts: unknown, cb: (res: MockResponse) => void) => MockEmitter;
  }

  const createInstantTransport = (statusCode = 200, headers: Record<string, string> = {}): MockTransport => ({
    get(_url: string, _opts: unknown, cb: (res: MockResponse) => void) {
      const emitter: MockEmitter = {
        on: () => emitter,
        destroy: () => {},
        end: () => {},
      };
      setTimeout(() => {
        cb({
          statusCode,
          headers,
          resume: () => {},
          on: (_event: string, handler: () => void) => {
            if (_event === 'end') setTimeout(handler, 1);
          },
        });
      }, 2);
      return emitter;
    },
  });

  describe('1. Target URL & Destination Security', () => {
    it('rejects missing or empty targetUrl', async () => {
      await expect(runLocalBenchmark({ targetUrl: '' })).rejects.toThrow('targetUrl is required');
    });

    it('rejects invalid or malformed target URLs', async () => {
      await expect(runLocalBenchmark({ targetUrl: 'not_a_valid_url' })).rejects.toThrow('Invalid target URL');
    });

    it('rejects unsupported URL protocols (ftp, file, javascript)', async () => {
      await expect(runLocalBenchmark({ targetUrl: 'ftp://localhost:8080/file' })).rejects.toThrow(
        'Safety guard: Unsupported URL protocol "ftp:". Only "http:" and "https:" are permitted.'
      );
      await expect(runLocalBenchmark({ targetUrl: 'file:///etc/passwd' })).rejects.toThrow('Unsupported URL protocol');
    });

    it('rejects URLs containing embedded credentials (user:pass)', async () => {
      await expect(runLocalBenchmark({ targetUrl: 'http://admin:secret123@localhost:3000/' })).rejects.toThrow(
        'Security guard: Target URL must not contain embedded credentials (username/password).'
      );
    });

    it('rejects ambiguous wildcard destination 0.0.0.0', async () => {
      await expect(runLocalBenchmark({ targetUrl: 'http://0.0.0.0:8080/health' })).rejects.toThrow(
        'Safety guard: "0.0.0.0" is an ambiguous wildcard destination and is not permitted as a benchmark target.'
      );
    });

    it('blocks non-localhost external targets when allowExternalTarget is false', async () => {
      await expect(runLocalBenchmark({ targetUrl: 'http://api.production-server.com/v1' })).rejects.toThrow(
        'Safety guard: Target "api.production-server.com" is not localhost. Benchmarks against external or remote targets require explicit authorization (allowExternalTarget: true).'
      );
    });

    it('blocks external targets when allowExternalTarget is true but host is not in authorizedHosts allowlist', async () => {
      await expect(
        runLocalBenchmark({
          targetUrl: 'http://staging-server.internal.net:8080/api',
          allowExternalTarget: true,
          authorizedHosts: ['qa-server.internal.net'], // Does not include staging-server
        })
      ).rejects.toThrow(
        'Safety guard: Target "staging-server.internal.net" is not in the authorized target scope [qa-server.internal.net]. A simple boolean alone is not sufficient authorization.'
      );
    });

    it('permits authorized remote staging target when both flag and authorizedHosts match', async () => {
      const mockTransport = createInstantTransport(200);
      const result = await runLocalBenchmark({
        targetUrl: 'http://staging-server.internal.net:8080/api',
        allowExternalTarget: true,
        authorizedHosts: ['staging-server.internal.net'],
        durationMs: 200,
        concurrency: 1,
        transport: mockTransport,
      });

      expect(result.successfulRequests).toBeGreaterThan(0);
      expect(result.isLocalhost).toBe(false);
      expect(result.evidenceMetadata.targetEnvironment).toBe('authorized_remote_staging');
    });
  });

  describe('2. HTTP Method & Unsafe Operations Protection', () => {
    it('permits GET and HEAD methods by default', async () => {
      const mockTransport = createInstantTransport(200);
      const result = await runLocalBenchmark({
        targetUrl: 'http://localhost:3000/health',
        method: 'HEAD',
        durationMs: 200,
        concurrency: 1,
        transport: mockTransport,
      });
      expect(result.successfulRequests).toBeGreaterThan(0);
    });

    it('rejects mutating HTTP methods (POST, DELETE, PUT) unless allowUnsafeMethods is true', async () => {
      await expect(
        runLocalBenchmark({
          targetUrl: 'http://localhost:3000/orders',
          method: 'POST',
        })
      ).rejects.toThrow('Safety guard: HTTP method "POST" is not permitted without explicit allowUnsafeMethods: true.');

      await expect(
        runLocalBenchmark({
          targetUrl: 'http://localhost:3000/records/1',
          method: 'DELETE',
        })
      ).rejects.toThrow('Safety guard: HTTP method "DELETE" is not permitted without explicit allowUnsafeMethods: true.');
    });
  });

  describe('3. Concurrency, Duration & Numeric Validation Clamping', () => {
    it('rejects invalid, negative, or zero concurrency', async () => {
      await expect(
        runLocalBenchmark({ targetUrl: 'http://localhost:3000/', concurrency: 0 })
      ).rejects.toThrow('Invalid concurrency value');
      await expect(
        runLocalBenchmark({ targetUrl: 'http://localhost:3000/', concurrency: -5 })
      ).rejects.toThrow('Invalid concurrency value');
      await expect(
        runLocalBenchmark({ targetUrl: 'http://localhost:3000/', concurrency: NaN })
      ).rejects.toThrow('Invalid concurrency value');
    });

    it('rejects invalid duration values below 100ms', async () => {
      await expect(
        runLocalBenchmark({ targetUrl: 'http://localhost:3000/', durationMs: 50 })
      ).rejects.toThrow('Invalid durationMs value');
      await expect(
        runLocalBenchmark({ targetUrl: 'http://localhost:3000/', durationMs: -100 })
      ).rejects.toThrow('Invalid durationMs value');
    });
  });

  describe('4. Sample Sufficiency, Abort Controls & Response Limits', () => {
    it('reports INSUFFICIENT_SAMPLES and fails threshold when sample count is below minimum required', async () => {
      // Mock transport that only returns 2 responses
      let callCount = 0;
      const limitedTransport: MockTransport = {
        get(_url: string, _opts: unknown, cb: (res: MockResponse) => void) {
          const emitter: MockEmitter = {
            on: () => emitter,
            destroy: () => {},
          };
          if (callCount < 2) {
            callCount++;
            setTimeout(() => {
              cb({ statusCode: 200, resume: () => {} });
            }, 5);
          } else {
            setTimeout(() => {
              cb({ statusCode: 500, resume: () => {} });
            }, 5);
          }
          return emitter;
        },
      };

      const result = await runLocalBenchmark({
        targetUrl: 'http://127.0.0.1:3000/limited',
        durationMs: 200,
        concurrency: 1,
        minSamplesRequired: 10,
        transport: limitedTransport,
      });

      expect(result.thresholds.sampleSufficiency).toBe('INSUFFICIENT_SAMPLES');
      expect(result.thresholds.passed).toBe(false);
      expect(result.thresholds.violations.some((v: string) => v.includes('Insufficient latency samples'))).toBe(true);
    });

    it('supports AbortSignal to cancel running benchmark cleanly', async () => {
      const abortController = new AbortController();
      const mockTransport = createInstantTransport(200);

      // Trigger abort after 100ms
      setTimeout(() => abortController.abort(), 100);

      const result = await runLocalBenchmark({
        targetUrl: 'http://127.0.0.1:3000/abort-test',
        durationMs: 3000,
        concurrency: 2,
        abortSignal: abortController.signal,
        transport: mockTransport,
      });

      expect(result.aborted).toBe(true);
      expect(result.durationMs).toBeLessThan(2500);
    });

    it('blocks redirects to external locations when benchmarking in localhost mode', async () => {
      const redirectTransport: MockTransport = {
        get(_url: string, _opts: unknown, cb: (res: MockResponse) => void) {
          const emitter: MockEmitter = {
            on: () => emitter,
            destroy: () => {},
          };
          setTimeout(() => {
            // Returns 302 redirecting to external site
            cb({
              statusCode: 302,
              headers: { location: 'http://attacker-site.com/steal-traffic' },
              resume: () => {},
            });
          }, 2);
          return emitter;
        },
      };

      const result = await runLocalBenchmark({
        targetUrl: 'http://localhost:3000/redirect',
        durationMs: 300,
        concurrency: 1,
        followRedirects: true,
        transport: redirectTransport,
      });

      expect(result.failedRequests).toBeGreaterThan(0);
      expect(result.errors.some((e: string) => e.includes('Redirect to external location'))).toBe(true);
    });

    it('records detailed HTTP and network error breakdowns', async () => {
      const errorTransport: MockTransport = {
        get(_url: string, _opts: unknown, _cb: (res: MockResponse) => void) {
          const emitter: MockEmitter = {
            on: (_event: string, handler: (err?: Error) => void) => {
              if (_event === 'error') {
                setTimeout(() => handler(new Error('ECONNREFUSED connect 127.0.0.1:9999')), 2);
              }
              return emitter;
            },
            destroy: () => {},
          };
          return emitter;
        },
      };

      const result = await runLocalBenchmark({
        targetUrl: 'http://127.0.0.1:9999/down',
        durationMs: 250,
        concurrency: 1,
        transport: errorTransport,
      });

      expect(result.failedRequests).toBeGreaterThan(0);
      expect(result.successfulRequests).toBe(0);
      expect(result.errorRatePercent).toBe(100);
      expect(result.thresholds.passed).toBe(false);
      expect(result.evidenceMetadata.toolVersion).toBe('1.0.0');
    });
  });
});
