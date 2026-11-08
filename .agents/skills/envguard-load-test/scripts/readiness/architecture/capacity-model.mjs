/**
 * Capacity Planning & Performance Scenario Modeling Engine.
 * Distinguishes hypothetical scenario models from observed staging measurements,
 * strictly prohibiting fabricated production metrics.
 */

/**
 * Builds a capacity estimation model based on provided or scenario parameters.
 *
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @returns {object} Capacity model with scenario projections and explicit disclosures
 */
export function buildCapacityModel(inventory, requirements) {
  const isWorkloadProvided = requirements.traffic && requirements.traffic.status !== 'UNKNOWN';

  // 1. Observed or Configured Baseline Workload
  const activeUsers = isWorkloadProvided ? requirements.traffic.dailyActiveUsers : null;
  const peakRps = isWorkloadProvided ? requirements.traffic.requestsPerSecondPeak : null;

  // 2. Hypothetical 10,000-Virtual-User (VU) Scenario Configuration
  const scenario10k = generate10kVirtualUserScenario(inventory);

  return {
    workloadState: isWorkloadProvided ? 'USER_PROVIDED' : 'HYPOTHETICAL_SCENARIO_ONLY',
    observedMetrics: {
      dailyActiveUsers: activeUsers,
      peakRequestsPerSecond: peakRps,
      isMeasuredInProduction: false,
      disclosure: 'No production traffic measurements fabricated. Observed metrics reflect user configuration only.',
    },
    hypothetical10kScenario: scenario10k,
    resourceProjections: {
      estimatedConcurrentConnections: isWorkloadProvided ? Math.ceil(peakRps * 0.2) : null,
      recommendedDatabasePoolSize: computeRecommendedPoolSize(inventory, peakRps || scenario10k.projectedPeakRps),
      recommendedComputeReplicas: computeRecommendedComputeReplicas(inventory, peakRps || scenario10k.projectedPeakRps),
    },
    prerequisitesForExecution: [
      'Explicit target authorization and dedicated staging environment isolation',
      'Data isolation with synthetic test fixtures (never run against production data)',
      'Pre-agreed concurrency ceiling, rate limits, and maximum test duration',
      'Third-party external webhooks/APIs mocked or excluded from test traffic',
      'Automated stop conditions (circuit breaker if error rate > 5% or latency > 2000ms)',
      'Cleanup and teardown automation',
    ],
  };
}

/**
 * Generates a detailed 10,000-virtual-user workload scenario configuration.
 * Clearly labeled as hypothetical.
 */
export function generate10kVirtualUserScenario(inventory) {
  return {
    scenarioName: 'Hypothetical 10,000-Virtual-User Stress Profile',
    disclaimer:
      'A 10,000-VU synthetic load configuration does not certify that the application will sustain 10,000 real human users. Human users possess think times, varied session durations, and unpredictable navigation paths. Execution requires dedicated staging infrastructure.',
    parameters: {
      virtualUsers: 10000,
      rampUpDurationSeconds: 120, // 2-minute ramp-up
      steadyStateDurationSeconds: 300, // 5-minute steady state
      rampDownDurationSeconds: 60,
      readWriteRatio: '80:20 (Read Heavy)',
      projectedAverageRps: 500,
      projectedPeakRps: 1500,
      p95LatencyThresholdMs: 250,
      p99LatencyThresholdMs: 750,
      maxAllowedErrorRatePercent: 1.0,
    },
    estimatedInfrastructureRequirements: {
      loadGeneratorsRequired: '2-4 distributed worker nodes (to prevent test runner CPU saturation)',
      backendAppReplicas: inventory.counts.services > 0 ? 3 : 2,
      databaseCpuCores: 4,
      databaseMemoryGb: 8,
      recommendedDbMaxConnections: 100,
      cacheStoreMemoryGb: inventory.detectedTechnologies.includes('cache') ? 2 : 0,
    },
    k6ScriptTemplate: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 2500 },  // Ramp-up to 2,500 VUs
    { duration: '2m', target: 10000 }, // Ramp-up to 10,000 VUs
    { duration: '5m', target: 10000 }, // Hold steady at 10,000 VUs
    { duration: '1m', target: 0 },     // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<750'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(__ENV.TARGET_URL || 'http://localhost:3000/healthz');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
`,
  };
}

/**
 * Calculates recommended database connection pool limits.
 */
function computeRecommendedPoolSize(inventory, peakRps) {
  if (!inventory.detectedTechnologies.includes('database')) return null;
  // Standard formula: connections = ((core_count * 2) + effective_spindle_count)
  // For application side: clamp between 10 and 50 per node
  if (!peakRps || peakRps <= 100) {
    return { perInstanceMax: 10, rationale: 'Standard connection pool sizing for modest traffic workloads' };
  }
  if (peakRps <= 1000) {
    return { perInstanceMax: 20, rationale: 'Medium connection pool sized to prevent database process exhaustion' };
  }
  return {
    perInstanceMax: 30,
    requiresConnectionPooler: true,
    poolerRecommendation: 'Deploy PgBouncer / RDS Proxy to multiplex thousands of client connections into <= 50 database backends',
  };
}

/**
 * Calculates recommended compute instance replicas.
 */
function computeRecommendedComputeReplicas(inventory, peakRps) {
  if (inventory.counts.services === 0) return 1;
  if (!peakRps || peakRps <= 150) return 2; // Minimum 2 for high availability
  if (peakRps <= 500) return 3;
  if (peakRps <= 1500) return 5;
  return Math.ceil(peakRps / 300);
}
