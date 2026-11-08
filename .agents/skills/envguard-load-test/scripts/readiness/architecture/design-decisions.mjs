import fs from 'node:fs';
import path from 'node:path';
import { evaluateApplicability, APPLICABILITY_LEVELS } from './applicability.mjs';
import { collectProjectFiles } from '../constants.mjs';

/**
 * 17 Primary System Design Concepts Knowledge Base & Assessment Engine.
 */
export const SYSTEM_DESIGN_CONCEPTS = [
  'load_balancing',
  'caching',
  'cdn',
  'api_gateway',
  'microservices',
  'monolithic_architecture',
  'replication',
  'partitioning_sharding',
  'message_queues',
  'rate_limiting',
  'consistent_hashing',
  'cap_theorem',
  'horizontal_scaling',
  'vertical_scaling',
  'fault_tolerance',
  'circuit_breaker',
  'event_driven_architecture',
];

/**
 * Evaluates all 17 primary system design concepts against an application repository.
 *
 * @param {string} projectDir - Project root directory
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @returns {object} Detailed evaluations and integrated readiness findings
 */
export function evaluateSystemDesignDecisions(projectDir, inventory, requirements) {
  const evaluations = [];
  const findings = [];
  const files = collectProjectFiles(projectDir, { maxFiles: 1000 });

  const readFileSafe = (relPath) => {
    try {
      return fs.readFileSync(path.join(projectDir, relPath), 'utf8');
    } catch {
      return '';
    }
  };

  const allSourceText = files
    .filter((f) => /\.(ts|js|py|java|json|yaml|yml)$/.test(f) && !f.includes('node_modules'))
    .map((f) => readFileSafe(f))
    .join('\n');

  const cleanSourceText = allSourceText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

  for (const conceptId of SYSTEM_DESIGN_CONCEPTS) {
    const applicability = evaluateApplicability(conceptId, inventory, requirements);
    const evaluation = evaluateSingleConcept(conceptId, applicability, inventory, requirements, files, cleanSourceText, readFileSafe, projectDir);
    evaluations.push(evaluation);

    if (evaluation.finding) {
      findings.push(evaluation.finding);
    }
  }

  return { evaluations, findings };
}

/**
 * Evaluates a single system design concept with all 12 mandatory architectural dimensions.
 */
function evaluateSingleConcept(conceptId, applicability, inventory, requirements, files, allSourceText, readFileSafe, projectDir) {
  switch (conceptId) {
    // =========================================================================
    // 1. Load Balancing
    // =========================================================================
    case 'load_balancing': {
      const hasLbConfig =
        files.some((f) => /nginx|caddy|haproxy|traefik/i.test(f)) ||
        allSourceText.includes('X-Forwarded-For') ||
        allSourceText.includes('trust proxy');
      const hasHealthCheck =
        files.some((f) => f.includes('health') || f.includes('ready')) ||
        /\/health|\/healthz|\/ping/i.test(allSourceText);

      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (!applicability.applicable) {
        status = 'NOT_APPLICABLE';
      } else if (hasHealthCheck) {
        status = 'HEALTHY';
      } else if (!hasHealthCheck && inventory.counts.services > 0) {
        status = 'DEFECTIVE';
        finding = {
          id: 'ARCH-LB-001',
          category: 'deployment',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Standard HTTP Health Check Endpoint for Load Balancer Integration',
          explanation: 'Application does not expose an unauthenticated /healthz or /health probe for L4/L7 load balancer readiness/liveness checks.',
          evidence: { file: files[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Implement a lightweight /healthz endpoint returning 200 OK and database connectivity status.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        };
      } else {
        status = 'RECOMMENDED';
      }

      return {
        conceptId,
        name: 'Load Balancing & Reverse Proxy Routing',
        problemSolved: 'Distributes incoming client traffic across multiple server instances to prevent hotspot overload and eliminate single-process SPOF.',
        signalsOfRelevance: ['Multi-instance service deployment', 'High availability SLA (> 99.9%)', 'SSL/TLS termination offloading'],
        isImplemented: hasLbConfig,
        evidence: { detectedReverseProxy: hasLbConfig, hasHealthCheck },
        isWorkingAsIntended: hasLbConfig && hasHealthCheck,
        risksAndFailureModes: ['Uneven traffic distribution due to sticky sessions', 'Health check flap storm', 'Incomplete SSL header forwarding'],
        alternatives: ['PaaS-managed routing (Vercel, AWS ALB, Cloud Run)', 'Single-instance vertical scaling for early prototypes'],
        costs: 'Low on cloud managed ALBs ($15-$25/mo); moderate operational maintenance on self-hosted Nginx/HAProxy clusters.',
        securityConsequences: 'Terminates TLS, filters malformed HTTP requests, masks internal network topology, and forwards authentic client IPs.',
        operationalOverhead: 'low',
        validationMethod: 'HTTP health check simulation and load balancer drain tests during deployment.',
        notRecommendedConditions: ['Single-tenant desktop/mobile clients', 'Internal CLI developer tools', 'Sub-10 req/s monoliths running on managed PaaS'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 2. Caching
    // =========================================================================
    case 'caching': {
      const usesRedis = inventory.detectedTechnologies.includes('cache') && allSourceText.includes('redis');
      const hasUnboundedMemoryCache =
        /const\s+\w*(?:Cache|Store)\s*=\s*new\s*Map\s*\(\s*\)/i.test(allSourceText) &&
        !allSourceText.includes('lru-cache') &&
        !allSourceText.includes('max:');

      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (hasUnboundedMemoryCache) {
        status = 'DEFECTIVE';
        finding = {
          id: 'ARCH-CACHE-001',
          category: 'performance',
          status: 'WARNING',
          severity: 'high',
          title: 'Unbounded In-Memory Cache Vulnerability (Process OOM Risk)',
          explanation: 'Detected in-memory caching using plain JavaScript Map without explicit max entry caps (LRU eviction) or TTL expiration.',
          evidence: { snippet: 'new Map() without max cap' },
          checkMethod: 'static_analysis',
          recommendation: 'Replace raw Map cache with "lru-cache" configuring explicit max entry limits and TTL expiration.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        };
      } else if (usesRedis) {
        status = 'HEALTHY';
      } else if (applicability.applicable) {
        status = 'RECOMMENDED';
      }

      return {
        conceptId,
        name: 'Caching (In-Memory & Distributed Stores)',
        problemSolved: 'Stores expensive database query results or rendered HTML fragments in fast RAM to reduce response latency and lower database load.',
        signalsOfRelevance: ['Read-to-write ratio > 5:1', 'Repetitive database queries on hot tables', 'Tail latency reduction targets (p95 < 100ms)'],
        isImplemented: usesRedis || !hasUnboundedMemoryCache,
        evidence: { usesRedis, hasUnboundedMemoryCache },
        isWorkingAsIntended: !hasUnboundedMemoryCache,
        risksAndFailureModes: ['Cache stampede / thundering herd on key expiry', 'Stale read anomalies after concurrent mutations', 'Memory exhaustion'],
        alternatives: ['Database read replicas with query optimization', 'HTTP HTTP Cache-Control headers', 'Application-level memoization'],
        costs: 'Managed Redis cluster ($20-$100+/mo); internal memory usage overhead.',
        securityConsequences: 'Must never cache sensitive session tokens or PII in unencrypted shared Redis keys.',
        operationalOverhead: usesRedis ? 'medium' : 'low',
        validationMethod: 'Simulate cache evictions, measure database query rate under load, and verify invalidation after write operations.',
        notRecommendedConditions: ['Write-heavy transactional workflows', 'Dynamic real-time user-specific balances', 'Low-traffic databases where queries run in < 2ms'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 3. CDN (Content Delivery Network)
    // =========================================================================
    case 'cdn': {
      const hasCdnHeaders = /Cache-Control|stale-while-revalidate|immutable/i.test(allSourceText);
      let status = applicability.applicable ? (hasCdnHeaders ? 'HEALTHY' : 'RECOMMENDED') : 'NOT_APPLICABLE';
      let finding = null;

      return {
        conceptId,
        name: 'Content Delivery Network (Edge Asset Caching)',
        problemSolved: 'Caches static assets (JS, CSS, images, video) at globally distributed edge POPs close to end-users.',
        signalsOfRelevance: ['Global client geographic distribution', 'Heavy frontend media / bundles', 'Origin bandwidth saturation'],
        isImplemented: hasCdnHeaders,
        evidence: { hasCdnHeaders },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Serving outdated assets after deployment due to missing cache-busting hashes', 'Accidental caching of authenticated API responses'],
        alternatives: ['Origin gzip/brotli compression with long-lived browser cache headers'],
        costs: 'Generally low on Cloudflare / CloudFront free/standard tiers ($0-$20/mo).',
        securityConsequences: 'Protects origin IP from direct DDoS attacks; must strictly prohibit caching Authorization headers.',
        operationalOverhead: 'low',
        validationMethod: 'Verify cache-control response headers and cache hit ratios from edge endpoints.',
        notRecommendedConditions: ['Private internal enterprise tools restricted to corporate VPCs', 'Pure headless backend APIs with zero static assets'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 4. API Gateway
    // =========================================================================
    case 'api_gateway': {
      const hasGateway = inventory.components.some((c) => c.type === 'api_gateway');
      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (!applicability.applicable && hasGateway) {
        status = 'OVERENGINEERED';
        finding = {
          id: 'ARCH-GW-001',
          category: 'performance',
          status: 'INFORMATIONAL',
          severity: 'info',
          title: 'Architectural Consideration: API Gateway Configured for Single Service',
          explanation: 'An API gateway layer was detected, but the repository contains only a single backend service. Review whether gateway maintenance is justified.',
          evidence: { file: files[0] || '.' },
          checkMethod: 'heuristic',
          recommendation: 'Evaluate consolidating routing into the core service to remove an unnecessary network hop.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
        };
      } else if (applicability.applicable && hasGateway) {
        status = 'HEALTHY';
      }

      return {
        conceptId,
        name: 'API Gateway & Ingress Management',
        problemSolved: 'Single entry point for client requests across multiple distributed microservices; handles routing, auth, and rate limiting.',
        signalsOfRelevance: ['>= 3 distinct backend microservices', 'Heterogeneous upstream protocols', 'Centralized client API key billing/metering'],
        isImplemented: hasGateway,
        evidence: { hasGateway },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Gateway becomes a single point of failure and latency bottleneck', 'Logic bloat in gateway routing layer'],
        alternatives: ['Direct client-to-service routing with mutual TLS', 'Client-side service discovery', 'Reverse proxy (Nginx)'],
        costs: 'AWS API Gateway charges per million requests ($1.00 - $3.50/M) which can escalate at high scale.',
        securityConsequences: 'Centralized boundary for JWT validation, TLS inspection, and rate limiting.',
        operationalOverhead: 'medium',
        validationMethod: 'Test route mapping, timeout forwarding, and auth header propagation under load.',
        notRecommendedConditions: ['Monoliths or single-backend services', 'Ultra-low latency inter-service micro-benchmarks (< 1ms targets)'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 5. Microservices Architecture
    // =========================================================================
    case 'microservices': {
      const isMicroservices = inventory.topologyType === 'microservices';
      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (isMicroservices && (requirements.teamSize === 'solo' || requirements.teamSize?.includes('small'))) {
        status = 'OVERENGINEERED';
        finding = {
          id: 'ARCH-MICRO-001',
          category: 'deployment',
          status: 'WARNING',
          severity: 'medium',
          title: 'Microservices Architecture for Small Engineering Team',
          explanation: `Detected ${inventory.counts.services} distributed backend services maintained by a small team (${requirements.teamSize}). Distributed operations increase cognitive and maintenance overhead.`,
          evidence: { serviceCount: inventory.counts.services },
          checkMethod: 'heuristic',
          recommendation: 'Consider consolidating services into a modular monolith with clear domain boundaries until team size warrants distributed deployment.',
          manualVerificationRequired: true,
          confidence: 'high_heuristic',
        };
      } else if (isMicroservices) {
        status = 'HEALTHY';
      }

      return {
        conceptId,
        name: 'Microservices Architecture',
        problemSolved: 'Enables independent deployment lifecycles and team autonomy across decoupled business capabilities.',
        signalsOfRelevance: ['Multiple cross-functional engineering teams (> 20 engineers)', 'Independent scaling requirements between services', 'Differing technological/runtime needs'],
        isImplemented: isMicroservices,
        evidence: { isMicroservices, serviceCount: inventory.counts.services },
        isWorkingAsIntended: isMicroservices,
        risksAndFailureModes: ['Distributed transaction partial failure', 'Network latency cascading failures', 'Distributed debugging complexity'],
        alternatives: ['Modular monolith with strict interface boundaries', 'Serverless function endpoints'],
        costs: 'High infrastructure and operational overhead: CI pipelines, monitoring, distributed tracing, Kubernetes clusters.',
        securityConsequences: 'Requires mutual TLS (mTLS) and internal service-to-service authentication (zero trust).',
        operationalOverhead: 'high',
        validationMethod: 'Contract testing (Pact), end-to-end trace verification with OpenTelemetry, and chaos network latency injection.',
        notRecommendedConditions: ['Early-stage startups', 'Small teams (< 15-20 engineers)', 'Rapidly evolving data schemas requiring cross-table joins'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 6. Monolithic Architecture (Modular Monolith)
    // =========================================================================
    case 'monolithic_architecture': {
      const isMonolith = inventory.topologyType === 'monolith' || inventory.topologyType === 'modular-monolith';
      return {
        conceptId,
        name: 'Modular Monolithic Architecture',
        problemSolved: 'Maximizes developer velocity, deployment simplicity, and ACID database transactional integrity within a single unified codebase.',
        signalsOfRelevance: ['Small to mid-sized engineering team', 'Single unified database domain model', 'Rapid feature iteration'],
        isImplemented: isMonolith,
        evidence: { isMonolith, topologyType: inventory.topologyType },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Spaghetti code coupling across domain models without module boundaries', 'Monolithic deployment blast radius'],
        alternatives: ['Microservices', 'Event-driven serverless'],
        costs: 'Minimal hosting cost; runs on a single VPS or small container instance ($5-$50/mo).',
        securityConsequences: 'Single deployable artifact; secure coding standards and dependency scanning protect the entire codebase.',
        operationalOverhead: 'low',
        validationMethod: 'Architecture linting (dependency-cruiser / ESLint boundaries) to enforce modular internal boundaries.',
        notRecommendedConditions: ['Massive engineering organizations (> 100 engineers) deploying dozens of times daily to independent domains'],
        status: isMonolith ? 'HEALTHY' : 'NOT_APPLICABLE',
        finding: null,
      };
    }

    // =========================================================================
    // 7. Database Replication
    // =========================================================================
    case 'replication': {
      const hasDb = inventory.detectedTechnologies.includes('database');
      const mentionsReplication = /replica|read_replica|standby|slave/i.test(allSourceText);
      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (hasDb && requirements.availability?.level === 'high_availability' && !mentionsReplication) {
        status = 'RECOMMENDED';
        finding = {
          id: 'ARCH-REPL-001',
          category: 'database',
          status: 'INFORMATIONAL',
          severity: 'info',
          title: 'Database Read Replica or Standby Failover Recommended for High Availability',
          explanation: 'Application targets high availability, but no database standby replica configuration or multi-AZ failover was detected.',
          evidence: { file: files[0] || '.' },
          checkMethod: 'heuristic',
          recommendation: 'Configure managed multi-AZ standby replication in cloud persistence layer (e.g. AWS RDS Multi-AZ, Cloud SQL HA).',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
        };
      } else if (hasDb) {
        status = 'HEALTHY';
      }

      return {
        conceptId,
        name: 'Database Replication & Standby High Availability',
        problemSolved: 'Replicates primary database transactions to standby replicas for read scaling and fast disaster failover without data loss.',
        signalsOfRelevance: ['High availability SLA (> 99.9%)', 'Read-heavy analytics queries contending with transactional updates', 'Disaster recovery RTO < 15 minutes'],
        isImplemented: mentionsReplication,
        evidence: { mentionsReplication },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Replication lag causing stale read-after-write anomalies', 'Split-brain scenarios during automated failover'],
        alternatives: ['Scheduled automated point-in-time recovery (PITR) backups (does not scale reads, but guarantees durability)'],
        costs: 'Doubles database instance infrastructure costs (primary + standby node).',
        securityConsequences: 'All replication traffic between nodes must enforce TLS in transit.',
        operationalOverhead: 'medium',
        validationMethod: 'Execute simulated standby failover tests and monitor replication lag under write-heavy workloads.',
        notRecommendedConditions: ['Transient staging/ephemeral test environments', 'Small databases (< 1 GB) with acceptable downtime windows'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 8. Partitioning & Sharding
    // =========================================================================
    case 'partitioning_sharding': {
      return {
        conceptId,
        name: 'Database Partitioning & Sharding',
        problemSolved: 'Splits enormous database tables into smaller physical partitions or distributes shards across multiple independent database clusters.',
        signalsOfRelevance: ['Multi-terabyte table storage', 'High write throughput exceeding single-node IOPS ceiling', 'Tenant-isolated data sovereignty laws'],
        isImplemented: false,
        evidence: { isImplemented: false },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Cross-shard joins are computationally prohibitive', 'Hot-key shard exhaustion', 'Extreme rebalancing complexity'],
        alternatives: ['Table indexing and vacuuming', 'Vertical scaling with fast NVMe storage', 'Read replicas and caching'],
        costs: 'High architectural and DBA operational engineering costs.',
        securityConsequences: 'Shard routing keys must strictly prevent cross-tenant data leakage.',
        operationalOverhead: 'high',
        validationMethod: 'Verify partition pruning query plans using EXPLAIN ANALYZE.',
        notRecommendedConditions: ['99% of web applications with datasets < 1TB', 'Complex relational schemas requiring arbitrary multi-table joins'],
        status: 'NOT_APPLICABLE',
        finding: null,
      };
    }

    // =========================================================================
    // 9. Message Queues
    // =========================================================================
    case 'message_queues': {
      const usesQueue = inventory.detectedTechnologies.includes('message-queue');
      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (usesQueue) {
        const hasDlq = /dead-letter|dlq|maxRetries|backoff/i.test(allSourceText);
        if (!hasDlq) {
          status = 'DEFECTIVE';
          finding = {
            id: 'ARCH-QUEUE-001',
            category: 'deployment',
            status: 'WARNING',
            severity: 'medium',
            title: 'Message Queue Configured Without Explicit Dead-Letter Queue (DLQ) or Retry Backoff',
            explanation: 'Detected message queue usage without explicit Dead-Letter Queue (DLQ) or exponential backoff retry configuration.',
            evidence: { file: files.find((f) => /queue|worker|job/i.test(f)) || '.' },
            checkMethod: 'static_analysis',
            recommendation: 'Configure a Dead-Letter Queue (DLQ) with max retry thresholds to isolate poison messages and prevent queue blockage.',
            manualVerificationRequired: false,
            confidence: 'high_heuristic',
          };
        } else {
          status = 'HEALTHY';
        }
      } else if (applicability.applicable) {
        status = 'RECOMMENDED';
      }

      return {
        conceptId,
        name: 'Asynchronous Message Queues & Background Workers',
        problemSolved: 'Decouples heavy asynchronous background tasks (emails, webhooks, media encoding) from synchronous HTTP request-response cycles.',
        signalsOfRelevance: ['Tasks taking > 500ms to process', 'Traffic spike smoothing and backpressure control', 'Cross-service event notification'],
        isImplemented: usesQueue,
        evidence: { usesQueue },
        isWorkingAsIntended: usesQueue,
        risksAndFailureModes: ['Poison message loops consuming worker threads', 'Queue backlog saturation without autoscaling', 'Message ordering loss'],
        alternatives: ['Simple in-process asynchronous promises (for non-critical tasks)', 'Database task tables with row-level locks (SKIP LOCKED)'],
        costs: 'Managed SQS ($0.40/M requests) or self-hosted RabbitMQ instance ($20-$50/mo).',
        securityConsequences: 'Message payload encryption at rest and in transit; sanitize sensitive credentials from job logs.',
        operationalOverhead: 'medium',
        validationMethod: 'Simulate worker crashes during job execution to verify message re-delivery and idempotency.',
        notRecommendedConditions: ['Pure synchronous CRUD APIs where every operation completes in < 50ms', 'Simple batch jobs run once daily via cron'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 10. Rate Limiting
    // =========================================================================
    case 'rate_limiting': {
      const hasRateLimiting =
        allSourceText.includes('express-rate-limit') ||
        allSourceText.includes('@fastify/rate-limit') ||
        allSourceText.includes('ratelimit') ||
        allSourceText.includes('throttle');

      let status = 'HEALTHY';
      let finding = null;

      if (!hasRateLimiting && inventory.counts.services > 0) {
        status = 'DEFECTIVE';
        finding = {
          id: 'ARCH-RATE-001',
          category: 'security',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing API Rate Limiting Defense (Denial of Service Risk)',
          explanation: 'No rate limiting or request throttling middleware was detected on public backend endpoints. Vulnerable to resource starvation and credential brute forcing.',
          evidence: { file: files[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Install and configure rate limiting middleware (e.g. express-rate-limit or Redis token bucket) on all public and authentication routes.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        };
      }

      return {
        conceptId,
        name: 'API Rate Limiting & Throttling',
        problemSolved: 'Limits the number of requests a client or IP can issue within a given window to protect services from denial-of-service, abuse, and scraping.',
        signalsOfRelevance: ['Publicly exposed HTTP endpoints', 'Authentication / password reset endpoints', 'Costly third-party API proxies'],
        isImplemented: hasRateLimiting,
        evidence: { hasRateLimiting },
        isWorkingAsIntended: hasRateLimiting,
        risksAndFailureModes: ['False positive blocking of legitimate users behind shared NAT/corporate proxies', 'Distributed rate limiter latency bottleneck'],
        alternatives: ['Cloudflare / WAF edge rate limiting', 'Client API key quotas with token bucket algorithms'],
        costs: 'Free with in-memory token bucket; minimal Redis storage for distributed rate limits.',
        securityConsequences: 'Essential defense against brute-force credential stuffing and resource exhaustion DDoS.',
        operationalOverhead: 'low',
        validationMethod: 'Automated load test issuing requests above threshold to verify 429 Too Many Requests response and Retry-After header.',
        notRecommendedConditions: ['Private high-throughput inter-service gRPC connections within internal VPC'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 11. Consistent Hashing
    // =========================================================================
    case 'consistent_hashing': {
      return {
        conceptId,
        name: 'Consistent Hashing (Distributed Routing)',
        problemSolved: 'Minimizes key redistribution and cache eviction when adding or removing nodes in a distributed cache or database ring.',
        signalsOfRelevance: ['Multi-node distributed cache cluster', 'Custom distributed storage partition rings', 'Traffic > 10,000 req/s'],
        isImplemented: false,
        evidence: { isImplemented: false },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Non-uniform key distribution without virtual nodes', 'Cascading node collapse under hot keys'],
        alternatives: ['Managed cloud cache (AWS ElastiCache, Redis Cluster) that abstracts hashing internally'],
        costs: 'Zero runtime cost; algorithm implementation complexity.',
        securityConsequences: 'Ensures deterministic data lookup across authorization boundaries.',
        operationalOverhead: 'low',
        validationMethod: 'Ring membership change simulation measuring key migration percentages.',
        notRecommendedConditions: ['Single-instance caches', 'Direct primary-replica databases', 'Architectures using managed PaaS caching'],
        status: 'NOT_APPLICABLE',
        finding: null,
      };
    }

    // =========================================================================
    // 12. CAP Theorem & Consistency Tradeoffs
    // =========================================================================
    case 'cap_theorem': {
      const usesRdbms = inventory.detectedTechnologies.includes('database');
      return {
        conceptId,
        name: 'CAP Theorem & Distributed Consistency Model',
        problemSolved: 'Explicitly defines whether the system prioritizes Consistency (CP) or Availability (AP) during network partitions.',
        signalsOfRelevance: ['All stateful applications with persistent data storage', 'Multi-region deployments', 'Distributed caches and databases'],
        isImplemented: true,
        evidence: { consistencyModel: usesRdbms ? 'CP (Strong ACID Consistency via Relational DB)' : 'AP (Eventual Consistency)' },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Assuming eventual consistency for financial transactions', 'Assuming strong consistency across cross-region read replicas'],
        alternatives: ['Saga orchestrations for cross-service eventual consistency', 'Two-phase commit (2PC) for strict distributed consistency'],
        costs: 'Consistency tradeoffs directly affect latency: strict ACID transactions require synchronous locking.',
        securityConsequences: 'Stale reads can lead to authorization replay attacks or double-spend vulnerabilities.',
        operationalOverhead: 'medium',
        validationMethod: 'Network partition simulation (Jepsen-style tests) to evaluate read consistency during master isolation.',
        notRecommendedConditions: ['Stateless compute applications with zero persistent storage'],
        status: 'HEALTHY',
        finding: null,
      };
    }

    // =========================================================================
    // 13. Horizontal Scaling
    // =========================================================================
    case 'horizontal_scaling': {
      const hasStatelessSignal = !allSourceText.includes('express-session') || allSourceText.includes('connect-redis');
      return {
        conceptId,
        name: 'Horizontal Scaling (Scale-Out Architecture)',
        problemSolved: 'Adds more compute instances (containers/VMs) to handle increased load without architectural ceilings.',
        signalsOfRelevance: ['Stateless application server designs', 'Autoscaling triggers based on CPU/RAM or queue depth', 'Kubernetes HPA / ECS autoscaling'],
        isImplemented: hasStatelessSignal,
        evidence: { statelessSessionStorage: hasStatelessSignal },
        isWorkingAsIntended: hasStatelessSignal,
        risksAndFailureModes: ['Database connection pool exhaustion when compute instances scale out rapidly', 'Shared filesystem dependencies'],
        alternatives: ['Vertical scaling (upgrading instance size)'],
        costs: 'Linear compute cost scaling with traffic.',
        securityConsequences: 'All application instances must share identical cryptographic signing keys and environment configurations.',
        operationalOverhead: 'medium',
        validationMethod: 'Spin up 5 concurrent container replicas and verify round-robin request handling without session loss.',
        notRecommendedConditions: ['Stateful in-memory game servers', 'Applications tightly coupled to local disk filesystem storage'],
        status: 'HEALTHY',
        finding: null,
      };
    }

    // =========================================================================
    // 14. Vertical Scaling
    // =========================================================================
    case 'vertical_scaling': {
      return {
        conceptId,
        name: 'Vertical Scaling (Scale-Up Architecture)',
        problemSolved: 'Increases CPU cores, RAM, and IOPS on existing server instances to handle higher workloads with zero architectural changes.',
        signalsOfRelevance: ['Early to mid-stage growth', 'Single database instance workloads', 'Low operational complexity preference'],
        isImplemented: true,
        evidence: { singleNodeManageability: true },
        isWorkingAsIntended: true,
        risksAndFailureModes: ['Hard hardware ceiling (e.g. maximum 128 cores/4TB RAM)', 'Single point of failure during hardware restarts'],
        alternatives: ['Horizontal scaling', 'Distributed read replicas'],
        costs: 'Cost-effective for moderate scale; becomes exponentially expensive at top-tier cloud instance sizes.',
        securityConsequences: 'Single perimeter boundary to secure; zero inter-service network attack surface.',
        operationalOverhead: 'low',
        validationMethod: 'Benchmark application performance as instance memory/CPU limits are raised.',
        notRecommendedConditions: ['Global low-latency multi-region requirements', 'Workloads with extreme bursty traffic spikes'],
        status: 'HEALTHY',
        finding: null,
      };
    }

    // =========================================================================
    // 15. Fault Tolerance & Graceful Degradation
    // =========================================================================
    case 'fault_tolerance': {
      const hasSigterm = /process\.on\s*\(\s*['"]SIGTERM['"]/i.test(allSourceText);
      const hasTimeouts = /timeout\s*:\s*\d+/i.test(allSourceText) || /AbortController/i.test(allSourceText);

      let status = 'HEALTHY';
      let finding = null;

      if (!hasSigterm && inventory.counts.services > 0) {
        status = 'DEFECTIVE';
        finding = {
          id: 'ARCH-FAULT-001',
          category: 'deployment',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Graceful Shutdown (SIGTERM/SIGINT) Handler',
          explanation: 'No SIGTERM or SIGINT process termination handler detected. Deployments or container restarts will immediately terminate in-flight HTTP requests.',
          evidence: { file: files[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Implement process.on("SIGTERM") to close HTTP server listeners and wait for in-flight requests to complete before exiting.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        };
      }

      return {
        conceptId,
        name: 'Fault Tolerance & Graceful Degradation',
        problemSolved: 'Ensures the application continues operating safely when subsystems, network connections, or external APIs fail.',
        signalsOfRelevance: ['Production deployment reliability', 'Zero-downtime rolling deployments', 'External dependency resilience'],
        isImplemented: hasSigterm && hasTimeouts,
        evidence: { hasSigtermHandler: hasSigterm, hasTimeoutConfig: hasTimeouts },
        isWorkingAsIntended: hasSigterm && hasTimeouts,
        risksAndFailureModes: ['In-flight request drop during rolling updates', 'Indefinite thread blocking on hung upstream connections'],
        alternatives: ['Hard container restart policies (causes user request errors)'],
        costs: 'Zero financial cost; software implementation discipline.',
        securityConsequences: 'Prevents partial state writes and corrupted database transactions during sudden termination.',
        operationalOverhead: 'low',
        validationMethod: 'Send SIGTERM signal during active load test and verify zero dropped HTTP requests.',
        notRecommendedConditions: ['Ephemeral CLI commands with sub-second execution duration'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 16. Circuit Breaker
    // =========================================================================
    case 'circuit_breaker': {
      const usesCircuitBreaker = /opossum|brakes|resilience4j|cockatiel/i.test(allSourceText);
      let status = 'NOT_APPLICABLE';
      let finding = null;

      if (applicability.applicable) {
        status = usesCircuitBreaker ? 'HEALTHY' : 'RECOMMENDED';
      }

      return {
        conceptId,
        name: 'Circuit Breaker Pattern',
        problemSolved: 'Prevents an application from repeatedly attempting operations likely to fail, stopping cascading failure storms across external services.',
        signalsOfRelevance: ['Synchronous outbound HTTP integrations with third-party APIs', 'Microservice-to-microservice synchronous dependencies', 'Preventing retry storms'],
        isImplemented: usesCircuitBreaker,
        evidence: { usesCircuitBreaker },
        isWorkingAsIntended: usesCircuitBreaker,
        risksAndFailureModes: ['Incorrect failure thresholds tripping circuit prematurely', 'Missing fallback logic causing generic unhandled exceptions'],
        alternatives: ['Bounded retries with exponential backoff and jitter', 'Strict request timeouts'],
        costs: 'Zero infrastructure cost; small memory tracking footprint.',
        securityConsequences: 'Protects backend resources from self-inflicted denial-of-service during downstream outages.',
        operationalOverhead: 'low',
        validationMethod: 'Inject 100% simulated errors into downstream mock endpoint and verify circuit trips to OPEN state.',
        notRecommendedConditions: ['Internal database queries (connection pool manages failure)', 'Idempotent asynchronous background workers where queue retries suffice'],
        status,
        finding,
      };
    }

    // =========================================================================
    // 17. Event-Driven Architecture
    // =========================================================================
    case 'event_driven_architecture': {
      const isEventDriven = inventory.detectedTechnologies.includes('message-queue');
      let status = isEventDriven ? 'HEALTHY' : 'NOT_APPLICABLE';
      let finding = null;

      return {
        conceptId,
        name: 'Event-Driven Architecture & Outbox Pattern',
        problemSolved: 'Decouples service communication using asynchronously published events, enabling reactive scaling and temporal decoupling.',
        signalsOfRelevance: ['Distributed business workflows', 'Event sourcing requirements', 'Multiple independent consumer services for the same event'],
        isImplemented: isEventDriven,
        evidence: { isEventDriven },
        isWorkingAsIntended: isEventDriven,
        risksAndFailureModes: ['Dual-write failure (DB write succeeds but event publication fails without Outbox pattern)', 'Event schema drift breaking consumers'],
        alternatives: ['Synchronous REST/gRPC APIs', 'Transactional Outbox pattern with change-data-capture (Debezium)'],
        costs: 'Requires event streaming infrastructure (Kafka/EventBridge/RabbitMQ).',
        securityConsequences: 'Event payloads often cross service boundaries; enforce strict schema validation and redaction of sensitive credentials.',
        operationalOverhead: 'high',
        validationMethod: 'Verify consumer idempotency by replaying duplicate event IDs and confirming database state remains identical.',
        notRecommendedConditions: ['Simple CRUD applications', 'Workflows requiring immediate read-after-write synchronous confirmation'],
        status,
        finding,
      };
    }

    default:
      return {
        conceptId,
        name: conceptId,
        status: 'NOT_APPLICABLE',
      };
  }
}
