/**
 * Failure Mode and Effects Analysis (FMEA) Engine for System Architecture.
 * Analyzes potential failure modes across compute, database, cache, network,
 * queues, credentials, health checks, migrations, and deployment rollbacks.
 *
 * Enforces the core engineering principle:
 * "Never equate configuration detection with operational reliability.
 * Kubernetes detected does not prove multi-instance reliability (e.g. replicas: 1).
 * Replication detected does not prove disaster recovery.
 * Retry configured does not prove resilience (may cause retry storms).
 * A health endpoint declared does not prove operational health.
 * Backup configuration does not prove verified restore capability."
 */

export function analyzeFailureModes(inventory, _requirements) {
  const failureModes = [];
  const infraComp = inventory.components.find((c) => c.type === 'infrastructure');
  const hasK8s = infraComp?.technologies?.includes('kubernetes');
  const hasSingleReplicaK8s = infraComp?.hasSingleReplicaK8s;
  const isMultiInstance = (hasK8s && !hasSingleReplicaK8s) || infraComp?.technologies?.includes('managed-paas');

  // 1. Single Point of Failure (SPOF) in Compute
  failureModes.push({
    id: 'FMEA-001',
    category: 'compute',
    component: 'Application Compute Nodes',
    failureMode: hasSingleReplicaK8s
      ? 'Kubernetes Single-Replica Deployment Pod Rescheduling Outage'
      : 'Single Compute Instance Crash or Process OOM',
    isHypothetical: true,
    severity: isMultiInstance ? 'medium' : 'high',
    likelihood: 'unverified_estimate',
    impact: isMultiInstance
      ? 'Degraded capacity, remaining replicas absorb traffic behind load balancer'
      : 'Total service downtime until manual restart or container respawn',
    configurationEvidence: hasSingleReplicaK8s
      ? 'Kubernetes manifest specifies replicas: 1 (single-instance SPOF)'
      : hasK8s
      ? 'Kubernetes manifests present in repository'
      : 'Single instance configuration detected',
    verifiedOperationalBehavior: isMultiInstance
      ? 'Multi-replica configuration detected; requires simulated node drain test to verify seamless traffic shift'
      : 'Unverified single-process runtime without verified multi-AZ failover',
    mitigationState: isMultiInstance ? 'configured_unverified' : 'missing',
    mitigation:
      'Deploy minimum 2 instances across distinct availability zones behind a health-checked reverse proxy or load balancer with automated restart policies.',
    recommendedVerification: 'Execute node drain / pod termination chaos test during active load testing.',
  });

  // 2. Primary Database Outage / Connection Pool Exhaustion
  const hasDb = inventory.detectedTechnologies.includes('database');
  if (hasDb) {
    failureModes.push({
      id: 'FMEA-002',
      category: 'database',
      component: 'Primary Database',
      failureMode: 'Connection Pool Exhaustion under Traffic Burst',
      isHypothetical: true,
      severity: 'critical',
      likelihood: 'unverified_estimate',
      impact: 'HTTP 500 / 503 errors on all database-dependent endpoints; cascading connection queue timeouts.',
      configurationEvidence: 'Database connection configuration detected in codebase',
      verifiedOperationalBehavior: 'Connection pooling library present; runtime pool exhaustion behavior unverified',
      mitigationState: 'configured_unverified',
      mitigation:
        'Configure explicit connection pool maximum limits (e.g. max: 20 per node) and deploy PgBouncer or managed connection poolers.',
      recommendedVerification: 'Benchmark with concurrency 2x higher than pool size to verify graceful rejection instead of socket hang.',
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
      isHypothetical: true,
      severity: 'high',
      likelihood: 'unverified_estimate',
      impact:
        'Thousands of concurrent requests bypass cache and hit primary database simultaneously, causing database CPU spike and timeout cascade.',
      configurationEvidence: 'Caching mechanism detected in source files',
      verifiedOperationalBehavior: 'Cache lookup logic present; early expiration or mutex lock unverified',
      mitigationState: 'configured_unverified',
      mitigation:
        'Implement probabilistic early expiration (XFetch algorithm), mutex locks on cache misses, and randomized TTL jitter.',
      recommendedVerification: 'Simulate cache key eviction under 1,000 req/s load to verify database does not crash.',
    });
  }

  // 4. Downstream API Network Timeout & Cascading Failure
  failureModes.push({
    id: 'FMEA-004',
    category: 'network',
    component: 'Outbound Third-Party Integrations',
    failureMode: 'Downstream HTTP Endpoint Hangs Indefinitely',
    isHypothetical: true,
    severity: 'high',
    likelihood: 'unverified_estimate',
    impact: 'Node.js event loop workers or request threads remain occupied waiting for socket response, exhausting server socket pool.',
    configurationEvidence: 'Outbound network calls present in application services',
    verifiedOperationalBehavior: 'Request timeout configuration varies by endpoint; circuit breaker unverified',
    mitigationState: 'configured_unverified',
    mitigation:
      'Enforce strict request timeouts (AbortSignal.timeout(3000ms)), circuit breakers, and bounded retry policies with exponential backoff.',
    recommendedVerification: 'Inject 10-second artificial latency on mock downstream endpoint and verify client request fails fast.',
  });

  // 5. Asynchronous Queue Saturation / Poison Message Loop
  const hasQueue = inventory.detectedTechnologies.includes('message-queue');
  if (hasQueue) {
    failureModes.push({
      id: 'FMEA-005',
      category: 'messaging',
      component: 'Message Queue / Background Worker',
      failureMode: 'Poison Message Repeatedly Crashing Worker',
      isHypothetical: true,
      severity: 'high',
      likelihood: 'unverified_estimate',
      impact: 'Malformed message causes worker crash, message is re-queued immediately, worker restarts and crashes in endless loop.',
      configurationEvidence: 'Message queue consumer configured in codebase',
      verifiedOperationalBehavior: 'Queue processing detected; dead-letter queue routing unverified',
      mitigationState: 'configured_unverified',
      mitigation:
        'Configure Dead-Letter Queue (DLQ) with maxAttempts: 3; route failed messages to DLQ for manual inspection without blocking the queue.',
      recommendedVerification: 'Publish invalid JSON payload into queue and confirm worker routes to DLQ within 3 attempts without process exit.',
    });
  }

  // 6. Credential Rotation & Secret Expiry
  failureModes.push({
    id: 'FMEA-006',
    category: 'security',
    component: 'Secrets & Cryptographic Keys',
    failureMode: 'Database Password or API Key Rotation without Zero-Downtime Rollover',
    isHypothetical: true,
    severity: 'critical',
    likelihood: 'unverified_estimate',
    impact: 'Application fails startup or throws immediate authentication errors on all queries upon key revocation.',
    configurationEvidence: 'Environment variables used for secrets',
    verifiedOperationalBehavior: 'Static secret loading on process startup; dynamic dual-credential rotation unverified',
    mitigationState: 'unverified',
    mitigation:
      'Implement dual-credential overlap windows (supporting both active and pending keys during rotation) and externalized configuration reloads.',
    recommendedVerification: 'Simulate credential rotation by changing database password in staging without dropping active user connections.',
  });

  // 7. Downstream Retry Storms & Self-Inflicted Denial of Service
  failureModes.push({
    id: 'FMEA-007',
    category: 'network',
    component: 'Client & Service Retry Mechanisms',
    failureMode: 'Uncoordinated Retry Storms Overwhelming Recovering Service',
    isHypothetical: true,
    severity: 'high',
    likelihood: 'unverified_estimate',
    impact:
      'Aggressive immediate retries from multiple clients multiply traffic volume against an already degraded downstream dependency, preventing recovery.',
    configurationEvidence: 'Retry logic detected in network or client callers',
    verifiedOperationalBehavior: 'Configured retry does not prove resilience; exponential backoff with full jitter unverified',
    mitigationState: 'configured_unverified',
    mitigation:
      'Enforce exponential backoff with full jitter (Decorrelated Jitter algorithm), circuit breakers, and bounded retry caps (max 2-3 retries).',
    recommendedVerification: 'Simulate 503 Service Unavailable and inspect client request arrival distribution over time.',
  });

  // 8. Misconfigured Deep Health Checks
  failureModes.push({
    id: 'FMEA-008',
    category: 'deployment',
    component: 'Load Balancer Health Probes',
    failureMode: 'Deep Health Check Hammering Database and Triggering Cascading Node De-registration',
    isHypothetical: true,
    severity: 'high',
    likelihood: 'unverified_estimate',
    impact:
      'Health check executes heavy database queries; when database latency spikes, all health checks fail simultaneously, causing load balancer to take all instances offline.',
    configurationEvidence: 'Health endpoint route detected in service definition',
    verifiedOperationalBehavior: 'Health route declared; distinction between shallow liveness probe and deep readiness probe unverified',
    mitigationState: 'configured_unverified',
    mitigation:
      'Separate shallow /healthz (checks process event loop responsiveness) from /readyz (checks database connection). Protect /readyz with internal caching or rate limiting.',
    recommendedVerification: 'Simulate 1-second database query pause and ensure load balancer does not terminate healthy Node.js process.',
  });

  // 9. Database Failover & Replica Lag
  if (hasDb) {
    failureModes.push({
      id: 'FMEA-009',
      category: 'database',
      component: 'Database Replication & Standby Node',
      failureMode: 'Replication Lag Leading to Stale Read-After-Write and Split-Brain Failover',
      isHypothetical: true,
      severity: 'high',
      likelihood: 'unverified_estimate',
      impact:
        'Users read immediately after write and observe stale data. Under automated failover, un-replicated write transactions may be lost.',
      configurationEvidence: 'Database replication or read replica configuration referenced',
      verifiedOperationalBehavior: 'Replication configuration detected; replication lag monitoring unverified',
      mitigationState: 'unverified',
      mitigation:
        'Enforce read-after-write routing to primary database for mutating sessions; monitor replication lag in milliseconds with alerts.',
      recommendedVerification: 'Measure replica lag during 1,000 write ops/sec and verify primary routing for write-then-read user sessions.',
    });
  }

  // 10. Non-Reversible Database Migration Rollback Failures
  if (hasDb) {
    failureModes.push({
      id: 'FMEA-010',
      category: 'database',
      component: 'Database Migrations & Schema DDL',
      failureMode: 'Destructive Schema Change Preventing Deployment Rollback',
      isHypothetical: true,
      severity: 'critical',
      likelihood: 'unverified_estimate',
      impact:
        'A migration drops a column or alters data types; rolling back application code fails because previous code relies on deleted schema elements.',
      configurationEvidence: 'Database migration directory or ORM configuration present',
      verifiedOperationalBehavior: 'Migration files detected; backward-compatible multi-phase deploy strategy unverified',
      mitigationState: 'configured_unverified',
      mitigation:
        'Follow Expand/Contract pattern: (1) Add nullable column, (2) Deploy code writing to both, (3) Backfill, (4) Deploy code reading new, (5) Drop old column.',
      recommendedVerification: 'Verify every migration file includes an automated down/reverse script tested against production-like schemas.',
    });
  }

  // 11. Failed Database Restore Verification & Silent Backup Corruption
  if (hasDb) {
    failureModes.push({
      id: 'FMEA-011',
      category: 'database',
      component: 'Backup & Disaster Recovery Infrastructure',
      failureMode: 'Unverified Automated Backups Failing During Critical Disaster Recovery',
      isHypothetical: true,
      severity: 'critical',
      likelihood: 'unverified_estimate',
      impact: 'Database snapshots are taken but never restored; during disaster, backup restore fails due to corruption or permission errors, causing permanent data loss.',
      configurationEvidence: 'Cloud backup policies or snapshot scripts referenced in documentation',
      verifiedOperationalBehavior: 'Backup scheduling present; periodic automated restore verification into test database unverified',
      mitigationState: 'unverified',
      mitigation:
        'Implement automated weekly restore drills into ephemeral test database to verify backup integrity, schema completeness, and measure real RTO.',
      recommendedVerification: 'Restore the latest snapshot into an isolated staging instance and run automated integrity assertion tests.',
    });
  }

  return failureModes;
}
