/**
 * Architectural Pattern Applicability Evaluator.
 * Determines whether a system design concept or infrastructure component is
 * genuinely relevant and justified for a given application's scope and requirements.
 *
 * Enforces the core engineering principle:
 * "A small application should not fail simply because it does not use Kubernetes, Redis, Kafka, microservices, or a CDN."
 */

export const APPLICABILITY_LEVELS = {
  NOT_APPLICABLE: 'not_applicable',
  NOT_RECOMMENDED: 'not_recommended',
  OPTIONAL: 'optional',
  RECOMMENDED: 'recommended',
  ESSENTIAL: 'essential',
};

/**
 * Evaluates the applicability of a primary system design concept.
 *
 * @param {string} conceptId - One of the 17 primary system design concepts
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @returns {object} Applicability evaluation result
 */
export function evaluateApplicability(conceptId, inventory, requirements) {
  const isSmallTeam = requirements.teamSize === 'solo' || requirements.teamSize?.includes('small');
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
    };
  }

  switch (conceptId) {
    // =========================================================================
    // 1. Load Balancing
    // =========================================================================
    case 'load_balancing': {
      if (requirements.availability?.level === 'high_availability' || !isSmallTeam) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'High availability target requires multi-instance deployment behind a reverse proxy or load balancer to eliminate single-process SPOF.',
          riskIfMissing: 'medium',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: true,
        reason: 'Single-instance deployment is adequate for early-stage or low-traffic services; can scale vertically or introduce PaaS load balancing as traffic increases.',
        riskIfMissing: 'low',
      };
    }

    // =========================================================================
    // 2. Caching
    // =========================================================================
    case 'caching': {
      if (inventory.detectedTechnologies.includes('database')) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Caching frequently queried read-heavy data mitigates database connection pressure and reduces tail latency.',
          riskIfMissing: 'low',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'No heavy database read bottlenecks identified. Introducing caching prematurely introduces cache invalidation complexity.',
        riskIfMissing: 'none',
      };
    }

    // =========================================================================
    // 3. CDN (Content Delivery Network)
    // =========================================================================
    case 'cdn': {
      const hasWebFrontend = inventory.detectedTechnologies.includes('web-frontend');
      const isGlobal = requirements.geographicDistribution === 'global' || requirements.geographicDistribution === 'multi-region';
      if (hasWebFrontend && isGlobal) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Global client distribution requires edge CDN delivery to cache static bundles and optimize First Contentful Paint.',
          riskIfMissing: 'medium',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: hasWebFrontend,
        reason: 'Direct web server or PaaS origin delivery is sufficient for localized audiences; CDN is optional until bandwidth or geographic latency warrants it.',
        riskIfMissing: 'low',
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
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
        applicable: false,
        reason: 'Single backend service or modular monolith does not justify an API gateway layer; reverse proxies or direct app routing avoid unnecessary network hops.',
        riskIfMissing: 'none',
      };
    }

    // =========================================================================
    // 5. Microservices
    // =========================================================================
    case 'microservices': {
      if (isSmallTeam && isMonolith) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
          applicable: false,
          reason: 'Small engineering team (<= 5 engineers) should NOT adopt microservices. Microservices introduce distributed tracing, network failures, data consistency, and operational complexity that outweigh decoupling benefits for single teams.',
          riskIfMissing: 'none',
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
      };
    }

    // =========================================================================
    // 7. Replication
    // =========================================================================
    case 'replication': {
      if (inventory.detectedTechnologies.includes('database') && requirements.availability?.level === 'high_availability') {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'High availability database persistence requires primary-replica standby replication for automatic failover. (Note: Replication does NOT replace backups).',
          riskIfMissing: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: inventory.detectedTechnologies.includes('database'),
        reason: 'Standard single-instance managed database with automated daily snapshots is adequate for standard workloads without strict multi-minute RTOs.',
        riskIfMissing: 'low',
      };
    }

    // =========================================================================
    // 8. Partitioning and Sharding
    // =========================================================================
    case 'partitioning_sharding': {
      const isHighVolume = requirements.traffic?.dailyActiveUsers > 1000000;
      if (isHighVolume) {
        return {
          conceptId,
          level: APPLICABILITY_LEVELS.RECOMMENDED,
          applicable: true,
          reason: 'Very high volume data sets (> multi-terabytes) require table partitioning or shard keys to maintain query index locality.',
          riskIfMissing: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_RECOMMENDED,
        applicable: false,
        reason: 'Database sharding introduces immense cross-partition query and rebalancing complexity. Vertical scaling, indexing, and read replicas should precede sharding.',
        riskIfMissing: 'none',
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
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Application operations are primarily synchronous CRUD; message brokers (Kafka/RabbitMQ) should only be introduced when async decoupling is required.',
        riskIfMissing: 'none',
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
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.NOT_APPLICABLE,
        applicable: false,
        reason: 'No multi-node distributed cache cluster or custom partitioning keys required. Single-instance or managed Redis handles routing transparently.',
        riskIfMissing: 'none',
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
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Application does not perform synchronous external network calls in critical request paths. Simple request timeouts are sufficient without circuit breakers.',
        riskIfMissing: 'none',
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
          reason: 'Event-driven message processing detected. Requires schema evolution contracts, idempotent consumer handlers, and dead-letter queue routing.',
          riskIfMissing: 'high',
        };
      }
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: false,
        reason: 'Synchronous request-response architecture is sufficient for current functional requirements; full event-driven streaming is not required.',
        riskIfMissing: 'none',
      };
    }

    default:
      return {
        conceptId,
        level: APPLICABILITY_LEVELS.OPTIONAL,
        applicable: true,
        reason: 'General engineering pattern evaluated on project context.',
        riskIfMissing: 'low',
      };
  }
}
