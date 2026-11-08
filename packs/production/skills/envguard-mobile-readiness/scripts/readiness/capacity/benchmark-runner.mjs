import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { URL } from 'node:url';

/**
 * Valid loopback hostnames permitted without explicit remote staging authorization.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Hardened, safe local HTTP benchmark runner.
 * Executes controlled performance baselines against authorized localhost endpoints with strict timeouts,
 * zero third-party dependencies, safe memory streaming caps, and non-fabricating metric calculations.
 *
 * @param {object} options
 * @param {string} options.targetUrl - HTTP/HTTPS URL to benchmark (defaults to loopback-only)
 * @param {number} [options.durationMs=2000] - Benchmark test duration in ms (100 - 30,000)
 * @param {number} [options.concurrency=5] - Number of concurrent worker loops (1 - 50)
 * @param {number} [options.timeoutPerReqMs=2000] - Request socket timeout in ms (50 - 30,000)
 * @param {number} [options.p95ThresholdMs=250] - Maximum acceptable p95 latency in ms
 * @param {number} [options.maxErrorRatePercent=1.0] - Maximum acceptable error rate
 * @param {boolean} [options.allowExternalTarget=false] - Explicit flag to permit non-loopback URLs
 * @param {string[]} [options.authorizedHosts=[]] - Explicit allowlist of remote staging hostnames
 * @param {string} [options.method='GET'] - HTTP method (GET, HEAD permitted; others require allowUnsafeMethods)
 * @param {boolean} [options.allowUnsafeMethods=false] - Explicit flag to permit POST, PUT, DELETE
 * @param {number} [options.maxRequests=10000] - Hard cap on total request attempts across workers
 * @param {number} [options.maxResponseBytes=1048576] - Maximum response body bytes before aborting stream (1MB default)
 * @param {number} [options.minSamplesRequired=5] - Minimum successful samples needed before declaring threshold passed
 * @param {boolean} [options.followRedirects=false] - Whether to follow 3xx HTTP redirects
 * @param {AbortSignal} [options.abortSignal=null] - Optional AbortSignal for early cancellation
 * @param {object} [options.transport=null] - Custom HTTP transport for hermetic testing
 * @returns {Promise<object>} Empirical benchmark results with latency percentiles and safety metadata
 */
export async function runLocalBenchmark({
  targetUrl,
  durationMs = 2000,
  concurrency = 5,
  timeoutPerReqMs = 2000,
  p95ThresholdMs = 250,
  maxErrorRatePercent = 1.0,
  allowExternalTarget = false,
  authorizedHosts = [],
  method = 'GET',
  allowUnsafeMethods = false,
  maxRequests = 10000,
  maxResponseBytes = 1048576, // 1 MB cap
  minSamplesRequired = 5,
  followRedirects = false,
  abortSignal = null,
  transport = null,
} = {}) {
  // 1. Target URL Validation
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('targetUrl is required for benchmark execution.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Invalid target URL "${targetUrl}": ${err.message}`);
  }

  // Protocol Validation
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Safety guard: Unsupported URL protocol "${parsedUrl.protocol}". Only "http:" and "https:" are permitted.`
    );
  }

  // Reject Credentials in URL
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Security guard: Target URL must not contain embedded credentials (username/password).');
  }

  // Reject Ambiguous Wildcard Destination 0.0.0.0
  if (parsedUrl.hostname === '0.0.0.0') {
    throw new Error(
      'Safety guard: "0.0.0.0" is an ambiguous wildcard destination and is not permitted as a benchmark target.'
    );
  }

  // Host Scope Validation
  const isLocalhost = LOOPBACK_HOSTS.has(parsedUrl.hostname);

  if (!isLocalhost && !allowExternalTarget) {
    throw new Error(
      `Safety guard: Target "${parsedUrl.hostname}" is not localhost. Benchmarks against external or remote targets require explicit authorization (allowExternalTarget: true).`
    );
  }

  if (!isLocalhost && allowExternalTarget) {
    const isAuthorized = Array.isArray(authorizedHosts) && authorizedHosts.includes(parsedUrl.hostname);
    if (!isAuthorized) {
      throw new Error(
        `Safety guard: Target "${parsedUrl.hostname}" is not in the authorized target scope [${authorizedHosts.join(', ')}]. A simple boolean alone is not sufficient authorization.`
      );
    }
  }

  // 2. HTTP Method Validation
  const upperMethod = method.toUpperCase();
  const safeMethods = new Set(['GET', 'HEAD']);
  if (!safeMethods.has(upperMethod) && !allowUnsafeMethods) {
    throw new Error(
      `Safety guard: HTTP method "${upperMethod}" is not permitted without explicit allowUnsafeMethods: true.`
    );
  }

  // 3. Workload Parameters Clamping & Validation
  if (typeof concurrency !== 'number' || Number.isNaN(concurrency) || concurrency < 1) {
    throw new Error(`Invalid concurrency value: "${concurrency}". Must be a positive integer between 1 and 50.`);
  }
  const safeConcurrency = Math.min(Math.max(Math.floor(concurrency), 1), 50);

  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs < 100) {
    throw new Error(`Invalid durationMs value: "${durationMs}". Must be an integer between 100 and 30000 ms.`);
  }
  const safeDurationMs = Math.min(Math.max(Math.floor(durationMs), 100), 30000);

  if (typeof timeoutPerReqMs !== 'number' || Number.isNaN(timeoutPerReqMs) || timeoutPerReqMs < 50) {
    throw new Error(`Invalid timeoutPerReqMs value: "${timeoutPerReqMs}". Must be an integer between 50 and 30000 ms.`);
  }
  const safeTimeoutMs = Math.min(Math.max(Math.floor(timeoutPerReqMs), 50), 30000);

  const safeMaxRequests = Math.max(1, Math.min(maxRequests, 100000));
  const safeMaxBytes = Math.max(1024, maxResponseBytes);

  // 4. Execution State
  const client = transport || (parsedUrl.protocol === 'https:' ? https : http);
  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let timeouts = 0;
  const httpErrors = {};
  const networkErrors = {};
  const errorDetails = [];
  let totalAttempts = 0;
  let wasAborted = false;

  const stopTime = Date.now() + safeDurationMs;

  // Single HTTP Request Dispatcher with stream limits and abort support
  function dispatchRequest(requestUrl) {
    return new Promise((resolve, reject) => {
      if (abortSignal && abortSignal.aborted) {
        wasAborted = true;
        return reject(new Error('Benchmark cancelled by AbortSignal'));
      }

      const reqUrlObj = new URL(requestUrl);
      const reqOptions = {
        method: upperMethod,
        timeout: safeTimeoutMs,
        headers: {
          'User-Agent': 'EnvGuard-Benchmark/1.0',
          Accept: '*/*',
        },
      };

      const resHandler = (res) => {
        // Handle redirects if configured
        const isRedirect = res.statusCode >= 300 && res.statusCode < 400 && res.headers?.location;
        if (isRedirect && followRedirects) {
          const redirectLocation = new URL(res.headers.location, requestUrl).toString();
          const redirectParsed = new URL(redirectLocation);
          // Enforce redirect destination security (cannot escape localhost in loopback mode)
          if (isLocalhost && !LOOPBACK_HOSTS.has(redirectParsed.hostname)) {
            req.destroy?.();
            return reject(
              new Error(`Security guard: Redirect to external location "${redirectLocation}" blocked in localhost mode.`)
            );
          }
          res.resume?.();
          return dispatchRequest(redirectLocation).then(resolve, reject);
        }

        if (typeof res.on === 'function') {
          let bytesConsumed = 0;
          res.on('data', (chunk) => {
            bytesConsumed += chunk.length;
            if (bytesConsumed > safeMaxBytes) {
              req.destroy?.(new Error(`Response size limit exceeded (> ${safeMaxBytes} bytes)`));
            }
          });
        }

        res.resume?.();

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      };

      let req;
      if (typeof client.get === 'function' && (upperMethod === 'GET' || transport)) {
        req = client.get(transport ? requestUrl : reqUrlObj, reqOptions, resHandler);
      } else if (typeof client.request === 'function') {
        req = client.request(reqUrlObj, reqOptions, resHandler);
        req.end?.();
      } else {
        return reject(new Error('HTTP transport does not support request or get'));
      }

      req.on?.('error', reject);
      req.on?.('timeout', () => {
        timeouts++;
        req.destroy?.(new Error('Socket timeout'));
      });

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          wasAborted = true;
          req.destroy?.(new Error('Benchmark cancelled by AbortSignal'));
        }, { once: true });
      }
    });
  }

  // Worker loop
  async function worker() {
    while (Date.now() < stopTime && totalAttempts < safeMaxRequests) {
      if (abortSignal && abortSignal.aborted) {
        wasAborted = true;
        break;
      }

      totalAttempts++;
      const start = process.hrtime.bigint();
      try {
        await dispatchRequest(targetUrl);
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        latencies.push(elapsedMs);
        successfulRequests++;
      } catch (err) {
        failedRequests++;
        const errMsg = err.message || 'Unknown network error';
        if (errMsg.startsWith('HTTP ')) {
          const code = errMsg.slice(5);
          httpErrors[code] = (httpErrors[code] || 0) + 1;
        } else {
          const key = err.code || errMsg.slice(0, 40);
          networkErrors[key] = (networkErrors[key] || 0) + 1;
        }

        if (errorDetails.length < 5) {
          // Sanitize error details
          const sanitized = errMsg.replace(/(?:password|token|secret|key)=[^\s&]+/gi, '$1=[REDACTED]');
          errorDetails.push(sanitized.slice(0, 120));
        }
      }
    }
  }

  const startTime = Date.now();
  const workerPromises = Array.from({ length: safeConcurrency }, () => worker());
  await Promise.all(workerPromises);
  const actualDurationMs = Date.now() - startTime;

  const actualDurationSec = actualDurationMs / 1000;
  const throughputRps = actualDurationSec > 0 ? Math.round((successfulRequests / actualDurationSec) * 10) / 10 : 0;
  const errorRatePercent = totalAttempts > 0 ? Math.round((failedRequests / totalAttempts) * 1000) / 10 : 0;

  // Latency percentiles calculation (nearest-rank methodology)
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

  // Threshold verification & sample sufficiency check
  const thresholdViolations = [];
  const hasSufficientSamples = successfulRequests >= minSamplesRequired;

  if (!hasSufficientSamples) {
    thresholdViolations.push(
      `Insufficient latency samples collected (${successfulRequests}/${minSamplesRequired}) to declare latency threshold passed.`
    );
  } else {
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
  }

  const thresholdPassed = hasSufficientSamples && thresholdViolations.length === 0;

  return {
    targetUrl,
    isLocalhost,
    durationMs: actualDurationMs,
    concurrency: safeConcurrency,
    totalRequests: totalAttempts,
    successfulRequests,
    failedRequests,
    timeouts,
    httpErrors,
    networkErrors,
    throughputRps,
    errorRatePercent,
    errors: errorDetails,
    aborted: wasAborted,
    latencySampleCount: latencies.length,
    percentileMethodology: 'nearest_rank',
    latency: {
      min,
      p50,
      p90,
      p95,
      p99,
      max,
      avg,
    },
    thresholds: {
      passed: thresholdPassed,
      sampleSufficiency: hasSufficientSamples ? 'SUFFICIENT_SAMPLES' : 'INSUFFICIENT_SAMPLES',
      p95ThresholdMs,
      maxErrorRatePercent,
      violations: thresholdViolations,
    },
    evidenceMetadata: {
      targetEnvironment: isLocalhost ? 'localhost_loopback' : 'authorized_remote_staging',
      toolVersion: '1.0.0',
      workloadParameters: {
        concurrency: safeConcurrency,
        plannedDurationMs: safeDurationMs,
        actualDurationMs,
        timeoutPerReqMs: safeTimeoutMs,
        maxRequests: safeMaxRequests,
        method: upperMethod,
      },
      executionTimestamp: new Date().toISOString(),
      hostPlatform: `${os.platform()} ${os.arch()}`,
      resultLimitations:
        'Empirical local baseline; does not reflect multi-region production network conditions, browser DOM rendering, or sustained database concurrency.',
    },
  };
}
