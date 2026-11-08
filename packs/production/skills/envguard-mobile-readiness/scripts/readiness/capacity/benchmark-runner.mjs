import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

/**
 * Safe local HTTP benchmark runner.
 * Executes controlled performance baselines against localhost endpoints with strict timeouts,
 * zero third-party dependencies, and non-fabricating metric calculations.
 *
 * @param {object} options
 * @param {string} options.targetUrl - HTTP URL to benchmark (defaults to localhost-only)
 * @param {number} [options.durationMs=2000] - Benchmark test duration in ms (capped at 30,000)
 * @param {number} [options.concurrency=5] - Number of concurrent worker loops (capped at 50)
 * @param {number} [options.timeoutPerReqMs=2000] - Request socket timeout in ms
 * @param {number} [options.p95ThresholdMs=250] - Maximum acceptable p95 latency in ms
 * @param {number} [options.maxErrorRatePercent=1.0] - Maximum acceptable error rate
 * @param {boolean} [options.allowExternalTarget=false] - Explicit flag to permit non-localhost URLs
 * @returns {Promise<object>} Empirical benchmark results with latency percentiles
 */
export async function runLocalBenchmark({
  targetUrl,
  durationMs = 2000,
  concurrency = 5,
  timeoutPerReqMs = 2000,
  p95ThresholdMs = 250,
  maxErrorRatePercent = 1.0,
  allowExternalTarget = false,
  transport = null,
} = {}) {
  if (!targetUrl) {
    throw new Error('targetUrl is required for benchmark execution.');
  }

  const parsedUrl = new URL(targetUrl);
  const isLocalhost =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '::1' ||
    parsedUrl.hostname === '0.0.0.0';

  if (!isLocalhost && !allowExternalTarget) {
    throw new Error(
      `Safety guard: Target "${parsedUrl.hostname}" is not localhost. Benchmarks against external or remote targets require explicit authorization (allowExternalTarget: true).`
    );
  }

  // Safety clamps
  const safeDurationMs = Math.min(Math.max(durationMs, 500), 30000);
  const safeConcurrency = Math.min(Math.max(concurrency, 1), 50);

  const client = transport || (parsedUrl.protocol === 'https:' ? https : http);
  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  const errorDetails = [];

  const stopTime = Date.now() + safeDurationMs;
  let activeWorkers = 0;

  async function worker() {
    activeWorkers++;
    while (Date.now() < stopTime) {
      const start = process.hrtime.bigint();
      try {
        await new Promise((resolve, reject) => {
          const req = client.get(
            targetUrl,
            { timeout: timeoutPerReqMs, headers: { 'User-Agent': 'EnvGuard-Benchmark/1.0' } },
            (res) => {
              res.resume(); // Consume stream
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode}`));
              }
            }
          );
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy(new Error('Socket timeout'));
          });
        });
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        latencies.push(elapsedMs);
        successfulRequests++;
      } catch (err) {
        failedRequests++;
        if (errorDetails.length < 5) {
          errorDetails.push(err.message);
        }
      }
    }
    activeWorkers--;
  }

  const startTime = Date.now();
  const workerPromises = Array.from({ length: safeConcurrency }, () => worker());
  await Promise.all(workerPromises);
  const actualDurationMs = Date.now() - startTime;

  const totalRequests = successfulRequests + failedRequests;
  const actualDurationSec = actualDurationMs / 1000;
  const throughputRps = actualDurationSec > 0 ? Math.round((successfulRequests / actualDurationSec) * 10) / 10 : 0;
  const errorRatePercent = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

  // Compute Latency Percentiles
  latencies.sort((a, b) => a - b);
  const getPercentile = (p) => {
    if (latencies.length === 0) return 0;
    const index = Math.ceil((p / 100) * latencies.length) - 1;
    return Math.round(latencies[Math.max(0, index)] * 100) / 100;
  };

  const p50 = getPercentile(50);
  const p90 = getPercentile(90);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);
  const min = latencies.length > 0 ? Math.round(latencies[0] * 100) / 100 : 0;
  const max = latencies.length > 0 ? Math.round(latencies[latencies.length - 1] * 100) / 100 : 0;
  const avg =
    latencies.length > 0
      ? Math.round((latencies.reduce((sum, v) => sum + v, 0) / latencies.length) * 100) / 100
      : 0;

  const thresholdViolations = [];
  if (p95 > p95ThresholdMs) {
    thresholdViolations.push(
      `p95 latency of ${p95}ms exceeded threshold of ${p95ThresholdMs}ms.`
    );
  }
  if (errorRatePercent > maxErrorRatePercent) {
    thresholdViolations.push(
      `Error rate of ${errorRatePercent.toFixed(1)}% exceeded threshold of ${maxErrorRatePercent}%.`
    );
  }

  return {
    targetUrl,
    isLocalhost,
    durationMs: actualDurationMs,
    concurrency: safeConcurrency,
    totalRequests,
    successfulRequests,
    failedRequests,
    throughputRps,
    errorRatePercent: Math.round(errorRatePercent * 100) / 100,
    errors: errorDetails,
    latency: {
      p50,
      p90,
      p95,
      p99,
      min,
      max,
      avg,
    },
    thresholds: {
      p95ThresholdMs,
      maxErrorRatePercent,
      violations: thresholdViolations,
      passed: thresholdViolations.length === 0,
    },
    confidence: 'verified_fact',
  };
}
