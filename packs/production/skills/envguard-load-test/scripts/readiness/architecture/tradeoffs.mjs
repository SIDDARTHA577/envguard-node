/**
 * System Architecture Tradeoffs Evaluator.
 * Compares architectural choices and models engineering tradeoffs
 * (simplicity, reliability, latency, cost, operational overhead).
 */

export function evaluateArchitectureTradeoffs(inventory, requirements) {
  const tradeoffs = [];

  // 1. Simplicity vs Scalability (Topology Tradeoff)
  const isMonolith = inventory.topologyType === 'monolith' || inventory.topologyType === 'modular-monolith';
  tradeoffs.push({
    dimension: 'Simplicity vs Scalability (Application Topology)',
    currentChoice: isMonolith ? 'Modular Monolith' : 'Distributed Microservices',
    advantages: isMonolith
      ? ['Single deployment artifact', 'In-process method calls (zero network latency)', 'ACID transactions across all tables', 'Single codebase and git repository']
      : ['Independent service deployment', 'Isolated failure blast radius', 'Technology diversity per service', 'Team autonomy'],
    costsAndRisks: isMonolith
      ? ['Entire application deploys together', 'Horizontal scaling scales all modules simultaneously', 'Requires discipline to prevent modular code entanglement']
      : ['Distributed tracing and network failure handling required', 'Eventual consistency across service boundaries', 'Substantially higher infrastructure cost', 'Multi-repo CI/CD orchestration complexity'],
    verdict: isMonolith
      ? 'Optimal choice for current team size and throughput. Continue enforcing modular boundaries.'
      : 'Justified only if cross-functional team size > 20 engineers and independent scaling is essential.',
  });

  // 2. Consistency vs Availability (CAP Tradeoff)
  const hasDb = inventory.detectedTechnologies.includes('database');
  tradeoffs.push({
    dimension: 'Consistency vs Availability (CAP Theorem)',
    currentChoice: hasDb ? 'Consistency-First (CP Model via ACID Relational Storage)' : 'Availability-First (AP Model)',
    advantages: hasDb
      ? ['Guarantees immediate read-after-write consistency', 'Prevents double-spend and stale account state', 'Transactions abort safely on network partition']
      : ['Zero downtime during regional network partition', 'Low latency local writes', 'Higher tolerance to network latency'],
    costsAndRisks: hasDb
      ? ['Mutations block or fail during primary database node partition', 'Requires primary-replica standby replication for HA']
      : ['Application must tolerate temporary stale data and conflict resolution'],
    verdict: 'Relational ACID consistency is the correct choice for business transactional data and user account state.',
  });

  // 3. Cost vs Redundancy (Availability Posture)
  const isHaTarget = requirements.availability?.level === 'high_availability';
  tradeoffs.push({
    dimension: 'Cost vs Redundancy (Infrastructure Topology)',
    currentChoice: isHaTarget ? 'Multi-AZ High Availability Redundancy' : 'Single-Zone Cost-Optimized Compute',
    advantages: isHaTarget
      ? ['Automatic failover during AWS availability zone or hardware outage', 'Zero-downtime rolling updates']
      : ['Low monthly hosting bill', 'Zero cross-AZ data transfer fees', 'Minimal operational monitoring overhead'],
    costsAndRisks: isHaTarget
      ? ['2x to 3x compute and database infrastructure expense', 'Cross-AZ latency (~1ms) and data egress charges']
      : ['Hardware restart or zone outage causes temporary service unavailability'],
    verdict: isHaTarget
      ? 'Justified by project SLA requirements.'
      : 'Recommended baseline for early-stage applications until revenue or traffic justifies redundant standby nodes.',
  });

  // 4. Latency vs Durability (Caching Strategy)
  const hasCache = inventory.detectedTechnologies.includes('cache');
  tradeoffs.push({
    dimension: 'Latency vs Durability (Data Access Strategy)',
    currentChoice: hasCache ? 'Cache-Aside with RAM Store (Redis / Memory)' : 'Direct Database Read Queries',
    advantages: hasCache
      ? ['Sub-millisecond query latency', 'Shields primary database from read spikes']
      : ['Guaranteed 100% fresh data', 'Zero cache invalidation bugs or stampedes', 'Zero Redis hosting overhead'],
    costsAndRisks: hasCache
      ? ['Potential for stale reads if invalidation is missed', 'RAM cost ($20-$100/mo)', 'Cache stampede risk']
      : ['Direct database load scales linearly with user traffic'],
    verdict: hasCache
      ? 'Appropriate for high read:write ratios; ensure strict TTL expiration is configured on all cached keys.'
      : 'Appropriate choice until measured database query latency exceeds p95 targets.',
  });

  return tradeoffs;
}
