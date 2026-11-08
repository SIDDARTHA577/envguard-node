/**
 * Failure Mode and Effects Analysis (FMEA) Engine for System Architecture.
 * Analyzes potential failure modes across persistence, compute, network,
 * queues, credentials, and deployments.
 */

export function analyzeFailureModes(inventory, requirements) {
  const failureModes = [];

  // 1. Single Point of Failure (SPOF) in Compute
  const isMultiInstance = inventory.components.some((c) => c.type === 'infrastructure' && c.technologies.includes('kubernetes'));
  failureModes.push({
    id: 'FMEA-001',
    category: 'compute',
    component: 'Application Compute Nodes',
    failureMode: 'Single Compute Instance Crash or Process OOM',
    severity: isMultiInstance ? 'medium' : 'high',
    likelihood: 'medium',
    impact: isMultiInstance ? 'Degraded capacity, remaining replicas absorb traffic' : 'Total service downtime until restart',
    mitigation: 'Deploy minimum 2 instances across distinct availability zones behind a health-checked load balancer with PM2 / Docker restart policies.',
    verificationState: isMultiInstance ? 'verified_fact' : 'unverified',
  });

  // 2. Primary Database Outage / Connection Exhaustion
  const hasDb = inventory.detectedTechnologies.includes('database');
  if (hasDb) {
    failureModes.push({
      id: 'FMEA-002',
      category: 'database',
      component: 'Primary Database',
      failureMode: 'Connection Pool Exhaustion under Traffic Burst',
      severity: 'critical',
      likelihood: 'medium',
      impact: 'HTTP 500 / 503 errors on all database-dependent endpoints; cascading connection queue timeouts.',
      mitigation: 'Configure explicit connection pool maximum limits (e.g. max: 20 per node) and deploy PgBouncer or managed connection poolers.',
      verificationState: 'unverified',
    });
  }

  // 3. Cache Failure / Stampede (Thundering Herd)
  const hasCache = inventory.detectedTechnologies.includes('cache');
  if (hasCache) {
    failureModes.push({
      id: 'FMEA-003',
      category: 'cache',
      component: 'Cache Layer (Redis / Memory)',
      failureMode: 'Cache Stampede / Sudden Eviction of Hot Keys',
      severity: 'high',
      likelihood: 'low',
      impact: 'Thousands of concurrent requests bypass cache and hit primary database simultaneously, causing database CPU spike and timeout cascade.',
      mitigation: 'Implement probabilistic early expiration (XFetch algorithm), mutex locks on cache misses, and randomized TTL jitter.',
      verificationState: 'unverified',
    });
  }

  // 4. Downstream API Network Timeout & Cascading Failure
  failureModes.push({
    id: 'FMEA-004',
    category: 'network',
    component: 'Outbound Third-Party Integrations',
    failureMode: 'Downstream HTTP Endpoint Hangs Indefinitely',
    severity: 'high',
    likelihood: 'medium',
    impact: 'Node.js event loop workers or request threads remain occupied waiting for socket response, exhausting server socket pool.',
    mitigation: 'Enforce strict request timeouts (AbortSignal.timeout(3000ms)), circuit breakers, and bounded retry policies with exponential backoff.',
    verificationState: 'unverified',
  });

  // 5. Asynchronous Queue Saturation / Poison Message Loop
  const hasQueue = inventory.detectedTechnologies.includes('message-queue');
  if (hasQueue) {
    failureModes.push({
      id: 'FMEA-005',
      category: 'messaging',
      component: 'Message Queue / Background Worker',
      failureMode: 'Poison Message Repeatedly Crashing Worker',
      severity: 'high',
      likelihood: 'medium',
      impact: 'Malformed message causes worker crash, message is re-queued immediately, worker restarts and crashes in endless loop.',
      mitigation: 'Configure Dead-Letter Queue (DLQ) with maxAttempts: 3; route failed messages to DLQ for manual inspection without blocking the queue.',
      verificationState: 'unverified',
    });
  }

  // 6. Credential Rotation & Secret Expiry
  failureModes.push({
    id: 'FMEA-006',
    category: 'security',
    component: 'Secrets & Cryptographic Keys',
    failureMode: 'Database Password or API Key Rotation without Zero-Downtime Rollover',
    severity: 'critical',
    likelihood: 'low',
    impact: 'Application fails startup or throws immediate authentication errors on all queries upon key revocation.',
    mitigation: 'Implement dual-credential overlap windows (supporting both active and pending keys during rotation) and externalized configuration reloads.',
    verificationState: 'unverified',
  });

  return failureModes;
}
