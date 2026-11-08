/**
 * Architectural Pattern Applicability Evaluator.
 * Determines whether a system design concept or infrastructure component is
 * genuinely relevant and justified for a given application's scope, requirements,
 * and verified operational evidence.
 *
 * Enforces the core engineering principle:
 * "A small application should not fail simply because it does not use Kubernetes, Redis, Kafka, microservices, or a CDN.
 * Every recommendation must consider application requirements, evidence, tradeoffs, cost, complexity, and uncertainty."
 */

export const APPLICABILITY_LEVELS = {
  NOT_APPLICABLE: 'not_applicable',
  NOT_RECOMMENDED: 'not_recommended',
  OPTIONAL: 'optional',
  RECOMMENDED: 'recommended',
  ESSENTIAL: 'essential',
};

/**
 * Evaluates the applicability of a primary system design concept based on
 * contextual application requirements and verified workload evidence.
 *
 * @param {string} conceptId - One of the 17 primary system design concepts
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @returns {object} Applicability evaluation result
 */
export function evaluateApplicability(conceptId, inventory, requirements) {
  const isSmallTeam = requirements.teamSize === 'solo' || requirements.teamSize?.includes('small') || requirements.teamSize === '2-5';
  const isTeamUnknown = !requirements.teamSize || requirements.teamSize === 'unknown' || requirements.profile?.properties?.teamSize?.status === 'UNKNOWN';
  const isMonolith = inventory.topologyType === 'monolith' || inventory.topologyType === 'modular-monolith';
  const hasMultipleServices = inventory.counts.services > 1;
  const isLibrary = inventory.topologyType === 'library';

  if (isLibrary) {
    return {
      conceptId,
      level: APPLICABILITY_LEVELS.NOT_APPLICABLE,
      applicable: false,
      reason: 'Application is a reusable library package; operational infrastructure concerns are managed by consuming applications.',
      riskIfMissing: 'none',
      confidence: 'high',
    };
  }

  switch (conceptId) {
    // =========================================================================
    // 1. Load Balancing
    // =========================================================================
    case 'load_balancing': {
      const isRelaxedAvailability = requirements.availability?.target && (
        parseFloat(requirements.availability.target) < 99.9 ||
        requirements.availability?.level === 'relaxed' ||
        requirements.availability?.level === 'standard_business_low'
      );

      if (isRelaxedAvailability && !hasMultipleServices) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.OPTIONAL,
          applicable: false,
          reason: 'Single-instance deployment is adequate for internal or relaxed-availability workloads (SLA <= 99.0%); load balancing is optional until multi-instance redundancy is required.',
          riskIfMissing: 'low',
          confidence: 'high',
        };
      }

      if (requirements.availability?.level === 'high_availability' || !isSmallTeam || hasMultipleServices) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'High availability target requires multi-instance deployment behind a reverse proxy or load balancer to eliminate single-process SPOF.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }

      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: true,
        reason: 'Single-instance deployment is adequate for early-stage or low-traffic services; can scale vertically or introduce PaaS load balancing as traffic increases.',
        riskIfMissing: 'low',
        confidence: 'medium',
      };
    }

    // =========================================================================
    // 2. Caching
    // =========================================================================
    case 'caching': {
      const hasDb = inventory.detectedTechnologies.includes('database');
      const isReadHeavy =
        requirements.traffic?.readWriteRatio?.includes('Read Heavy') ||
        (requirements.traffic?.requestsPerSecondPeak && requirements.traffic.requestsPerSecondPeak >= 500) ||
        (requirements.latencyTarget?.p95Ms && requirements.latencyTarget.p95Ms < 100);
      const hasExplicitCacheBenefit = requirements.hasMeasuredCacheBenefit || requirements.hasReadBottleneck;

      if (hasDb && (isReadHeavy || hasExplicitCacheBenefit)) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Measured read-heavy query profile or sub-100ms latency target justifies caching hot keys to protect primary database throughput.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }

      if (hasDb) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.OPTIONAL,
          applicable: false,
          reason: 'A database alone does not prove caching is needed. For small monoliths with modest or unmeasured read volume, direct indexed database queries are simpler and avoid cache invalidation bugs.',
          riskIfMissing: 'none',
          confidence: 'medium',
        };
      }

      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'No heavy database read bottlenecks identified. Introducing caching prematurely introduces cache invalidation complexity.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 3. CDN (Content Delivery Network)
    // =========================================================================
    case 'cdn': {
      const hasWebFrontend = inventory.detectedTechnologies.includes('web-frontend');
      const isGlobal = requirements.geographicDistribution === 'global' || requirements.geographicDistribution === 'multi-region';
      const isInternalOrLocal = requirements.geographicDistribution === 'single-region' || requirements.isInternalApp;

      if (hasWebFrontend && isGlobal) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Global client distribution requires edge CDN delivery to cache static bundles and optimize First Contentful Paint.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }

      if (hasWebFrontend && isInternalOrLocal) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.OPTIONAL,
          applicable: false,
          reason: 'A web frontend does not always require a CDN. Single-region or internal application origin delivery is sufficient until global latency or high asset bandwidth warrants CDN caching.',
          riskIfMissing: 'low',
          confidence: 'high',
        };
      }

      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: hasWebFrontend,
        reason: 'Direct web server or PaaS origin delivery is sufficient for localized audiences; CDN is optional until bandwidth or geographic latency warrants it.',
        riskIfMissing: 'low',
        confidence: 'medium',
      };
    }

    // =========================================================================
    // 4. API Gateway
    // =========================================================================
    case 'api_gateway': {
      if (hasMultipleServices && inventory.counts.services >= 3) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Multi-service architecture benefits from centralized routing, rate limiting, and unified authentication enforcement.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
        applicable: false,
        reason: 'Single backend service or modular monolith does not justify an API gateway layer; reverse proxies or direct app routing avoid unnecessary network hops.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 5. Microservices
    // =========================================================================
    case 'microservices': {
      // Small team with monolith: monolith is preferred
      if (isSmallTeam && isMonolith) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
          applicable: false,
          reason: 'Small engineering team (<= 5 engineers) should NOT adopt microservices. Microservices introduce distributed tracing, network failures, data consistency, and operational complexity that outweigh decoupling benefits for single teams.',
          riskIfMissing: 'none',
          confidence: 'high',
        };
      }

      // Small team with multiple services: check if independent operational requirements justify them
      if (isSmallTeam && hasMultipleServices) {
        const hasIndependentOpsRationale =
          requirements.hasExplicitMicroservicesRationale ||
          requirements.requiresIndependentScaling ||
          requirements.hasSeparateComplianceBoundaries ||
          inventory.counts.services <= 3;

        if (hasIndependentOpsRationale) {
          return {
            conceptId,
            level: APPLICABILITY_LEVELS.RECOMMENDED,
            applicable: true,
            reason: 'Microservices architecture justified by independent operational requirements (such as isolated scaling or separate data compliance boundaries). Ensure explicit contract tests and distributed observability.',
            riskIfMissing: 'medium',
            confidence: 'high',
          };
        }

        // Overengineered microservices without justification
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
          applicable: false,
          reason: 'Overengineered microservices architecture detected. Managing 4+ microservices with a small team without distinct operational or scaling requirements introduces excessive cognitive and operational overhead.',
          riskIfMissing: 'none',
          confidence: 'high',
        };
      }

      if (isTeamUnknown) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.OPTIONAL,
          applicable: hasMultipleServices,
          reason: 'Team size is unknown. Microservices are justified only when independent teams own distinct service lifecycle domains.',
          riskIfMissing: 'low',
          confidence: 'low',
        };
      }

      return {
        conceptId,
        level: hasMultipleServices ? APPLICABILITY_LEVELS.RECOMMENDED : APPLICABILITY_LEVELS.OPTIONAL,
        applicable: hasMultipleServices,
        reason: hasMultipleServices
          ? 'Multiple independent services detected; ensure explicit service boundaries, contract tests, and distributed observability.'
          : 'Monolithic architecture is suitable for current team size and domain complexity.',
        riskIfMissing: 'low',
        confidence: 'medium',
      };
    }

    // =========================================================================
    // 6. Monolithic Architecture
    // =========================================================================
    case 'monolithic_architecture': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.ESSENTIAL,
        applicable: true,
        reason: 'Well-structured modular monolith is the gold standard for developer velocity, transactional simplicity, and operational manageability.',
        riskIfMissing: 'medium',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 7. Replication
    // =========================================================================
    case 'replication': {
      const hasDb = inventory.detectedTechnologies.includes('database');
      const isHaTarget = requirements.availability?.level === 'high_availability' || (requirements.availability?.target && parseFloat(requirements.availability.target) >= 99.95);

      if (hasDb && isHaTarget) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'High availability database persistence requires primary-replica standby replication for automatic failover. (Note: Replication alone does not replace automated backups or disaster recovery planning).',
          riskIfMissing: 'high',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: hasDb,
        reason: 'Standard single-instance managed database with automated daily snapshots is adequate for standard workloads without strict multi-minute RTOs.',
        riskIfMissing: 'low',
        confidence: 'medium',
      };
    }

    // =========================================================================
    // 8. Partitioning and Sharding
    // =========================================================================
    case 'partitioning_sharding': {
      const hasMassiveDataVolume = requirements.traffic?.dataVolumeTb && requirements.traffic.dataVolumeTb >= 2;
      const hasWriteBottleneck = requirements.hasWriteBottleneck || (requirements.traffic?.requestsPerSecondPeak && requirements.traffic.requestsPerSecondPeak > 20000);

      if (hasMassiveDataVolume || hasWriteBottleneck) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Multi-terabyte dataset or extreme write throughput warrants evaluating table partitioning or horizontal sharding to prevent disk I/O and index degradation.',
          riskIfMissing: 'high',
          confidence: 'high',
        };
      }

      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
        applicable: false,
        reason: 'Large DAU or high row count alone does not prove sharding is required. Proper indexing, connection poolers, and read replicas handle high read volumes without cross-shard transactional complexity.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 9. Message Queues
    // =========================================================================
    case 'message_queues': {
      const hasAsyncWork = inventory.components.some((c) => c.type === 'worker' || c.type === 'message_queue');
      if (hasAsyncWork) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Asynchronous workers or long-running jobs require durable message queues with retry and dead-letter handling to protect HTTP request cycles.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Application operations are primarily synchronous CRUD; message brokers (Kafka/RabbitMQ) should only be introduced when async decoupling is required.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 10. Rate Limiting
    // =========================================================================
    case 'rate_limiting': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.ESSENTIAL,
        applicable: true,
        reason: 'Rate limiting is essential across public and authenticated HTTP endpoints to mitigate denial-of-service, brute force credential stuffing, and resource exhaustion.',
        riskIfMissing: 'high',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 11. Consistent Hashing
    // =========================================================================
    case 'consistent_hashing': {
      const hasDistributedCacheCluster = inventory.components.some(
        (c) => c.type === 'cache' && c.isDistributed && (c.technologies.includes('redis') || c.technologies.includes('memcached'))
      );
      if (hasDistributedCacheCluster && requirements.traffic?.requestsPerSecondPeak > 10000) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Multi-node distributed cache clusters require consistent hashing with virtual nodes to minimize cache eviction during node additions or removals.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_APPLICABLE,
        applicable: false,
        reason: 'No multi-node distributed cache cluster or custom partitioning keys required. Single-instance or managed Redis handles routing transparently.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 12. CAP Theorem & Consistency Tradeoffs
    // =========================================================================
    case 'cap_theorem': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.ESSENTIAL,
        applicable: true,
        reason: 'Every stateful system must define its consistency model (strong ACID vs eventual consistency) under network partitions and failover.',
        riskIfMissing: 'high',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 13. Horizontal Scaling
    // =========================================================================
    case 'horizontal_scaling': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.RECOMMENDED,
        applicable: true,
        reason: 'Stateless application service design enables horizontal scaling by spinning up additional container replicas without session state coupling.',
        riskIfMissing: 'medium',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 14. Vertical Scaling
    // =========================================================================
    case 'vertical_scaling': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.RECOMMENDED,
        applicable: true,
        reason: 'Vertical scaling (increasing CPU/RAM instance size) is the most cost-effective and operationally simple first step before distributed complexity.',
        riskIfMissing: 'low',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 15. Fault Tolerance
    // =========================================================================
    case 'fault_tolerance': {
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.ESSENTIAL,
        applicable: true,
        reason: 'Fault tolerance guardrails (explicit timeouts, bounded retries with jitter, graceful degradation, and health checks) prevent cascading failures.',
        riskIfMissing: 'critical',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 16. Circuit Breaker
    // =========================================================================
    case 'circuit_breaker': {
      const hasExternalOutboundCalls = hasMultipleServices || inventory.detectedTechnologies.includes('object-storage');
      if (hasExternalOutboundCalls) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Outbound integrations with external services require circuit breakers to prevent thread/connection starvation when third-party endpoints hang.',
          riskIfMissing: 'medium',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Application does not perform synchronous external network calls in critical request paths. Simple request timeouts are sufficient without circuit breakers.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    // =========================================================================
    // 17. Event-Driven Architecture
    // =========================================================================
    case 'event_driven_architecture': {
      const hasQueues = inventory.detectedTechnologies.includes('message-queue');
      if (hasQueues) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Event-driven message processing detected. A Kafka or RabbitMQ dependency does not prove reliability by itself; requires schema evolution contracts, idempotent consumer handlers, and dead-letter queue routing.',
          riskIfMissing: 'high',
          confidence: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Synchronous request-response architecture is sufficient for current functional requirements; full event-driven streaming is not required.',
        riskIfMissing: 'none',
        confidence: 'high',
      };
    }

    default:
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: true,
        reason: 'General engineering pattern evaluated on project context.',
        riskIfMissing: 'low',
        confidence: 'medium',
      };
  }
}
