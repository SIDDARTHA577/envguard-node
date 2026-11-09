/**
 * Capacity Planning & Performance Scenario Modeling Engine.
 * Distinguishes hypothetical scenario models, user assumptions, and observed staging measurements,
 * strictly prohibiting fabricated production metrics or labeling illustrative sizing as verified.
 */

export const CAPACITY_RESULT_CATEGORIES = {
  USER_PROVIDED_ASSUMPTIONS: 'USER_PROVIDED_ASSUMPTIONS',
  ILLUSTRATIVE_SCENARIO: 'ILLUSTRATIVE_SCENARIO',
  MEASURED_BENCHMARK: 'MEASURED_BENCHMARK',
  VERIFIED_CAPACITY_MODEL: 'VERIFIED_CAPACITY_MODEL',
};

export const WORKLOAD_CLASSIFICATIONS = {
  ESTIMATED: 'ESTIMATED',
  SIMULATED: 'SIMULATED',
  MEASURED: 'MEASURED',
  VERIFIED_STAGING: 'VERIFIED_STAGING',
  UNKNOWN_PRODUCTION: 'UNKNOWN_PRODUCTION',
};

/**
 * Classifies workload with explicit provenance and evidence boundaries.
 * Strictly prevents treating unmeasured assumptions or synthetic curves as verified capacity.
 *
 * @param {object} params
 * @param {object} [params.requirements] - Requirements profile
 * @param {object} [params.benchmark] - Measured benchmark result
 * @param {object} [params.stagingTelemetry] - Staging telemetry result
 * @returns {object} Workload classification metadata
 */
export function classifyWorkload({ requirements = null, benchmark = null, stagingTelemetry = null } = {}) {
  if (stagingTelemetry && stagingTelemetry.verified) {
    return {
      classification: WORKLOAD_CLASSIFICATIONS.VERIFIED_STAGING,
      description: 'Verified staging environment outcome with authorized telemetry evidence.',
      confidence: 'verified_fact',
      authorized: true,
    };
  }
  if (benchmark && (benchmark.samplesCount > 0 || benchmark.totalRequests > 0)) {
    return {
      classification: WORKLOAD_CLASSIFICATIONS.MEASURED,
      description: 'Empirically measured local benchmark executed against approved loopback target.',
      confidence: 'measured_evidence',
      authorized: true,
    };
  }
  if (requirements?.traffic?.status === 'CONFIRMED') {
    return {
      classification: WORKLOAD_CLASSIFICATIONS.ESTIMATED,
      description: 'Theoretical workload estimated from confirmed application requirements.',
      confidence: 'engineering_estimate',
      authorized: false,
    };
  }
  if (requirements?.traffic?.status === 'ASSUMED' || requirements?.traffic?.isHypothetical) {
    return {
      classification: WORKLOAD_CLASSIFICATIONS.SIMULATED,
      description: 'Synthetic scenario model based on heuristic planning assumptions.',
      confidence: 'hypothetical_simulation',
      authorized: false,
    };
  }
  return {
    classification: WORKLOAD_CLASSIFICATIONS.UNKNOWN_PRODUCTION,
    description: 'Unknown production capacity; no empirical measurements or confirmed requirements available.',
    confidence: 'unknown',
    authorized: false,
  };
}

/**
 * Validates capacity input parameters, strictly rejecting invalid or unphysical numbers.
 *
 * @param {object} params
 */
export function validateCapacityInputs(params = {}) {
  const numericFields = [
    { key: 'peakRps', name: 'Peak Requests Per Second', min: 0 },
    { key: 'avgRps', name: 'Average Requests Per Second', min: 0 },
    { key: 'dailyActiveUsers', name: 'Daily Active Users', min: 0 },
    { key: 'durationMs', name: 'Duration in milliseconds', min: 100 },
    { key: 'concurrency', name: 'Concurrency', min: 1 },
    { key: 'measuredThroughputPerInstance', name: 'Measured instance throughput', min: 0.1 },
    { key: 'targetUtilizationPercent', name: 'Target utilization percentage', min: 1, max: 100 },
  ];

  for (const { key, name, min, max } of numericFields) {
    const val = params[key];
    if (val !== undefined && val !== null) {
      if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
        throw new Error(`Invalid capacity input "${key}" (${name}): value must be a finite number, received ${val}.`);
      }
      if (min !== undefined && val < min) {
        throw new Error(`Invalid capacity input "${key}" (${name}): value must be >= ${min}, received ${val}.`);
      }
      if (max !== undefined && val > max) {
        throw new Error(`Invalid capacity input "${key}" (${name}): value must be <= ${max}, received ${val}.`);
      }
    }
  }
}

/**
 * Builds a capacity estimation model based on provided parameters, benchmark measurements,
 * or synthetic planning scenarios.
 *
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @param {object} [options={}] - Optional options including measured benchmark results
 * @returns {object} Capacity model with explicit disclosures, inspectable formulas, and provenance
 */
export function buildCapacityModel(inventory, requirements, options = {}) {
  const isWorkloadProvided = requirements.traffic && requirements.traffic.status !== 'UNKNOWN';
  const measuredBenchmark = options.measuredBenchmark || null;

  // Validate inputs if provided
  if (isWorkloadProvided) {
    validateCapacityInputs({
      peakRps: requirements.traffic.requestsPerSecondPeak,
      avgRps: requirements.traffic.requestsPerSecondAvg,
      dailyActiveUsers: requirements.traffic.dailyActiveUsers,
    });
  }

  // Determine result category
  let category = CAPACITY_RESULT_CATEGORIES.ILLUSTRATIVE_SCENARIO;
  if (measuredBenchmark && isWorkloadProvided) {
    category = CAPACITY_RESULT_CATEGORIES.VERIFIED_CAPACITY_MODEL;
  } else if (measuredBenchmark) {
    category = CAPACITY_RESULT_CATEGORIES.MEASURED_BENCHMARK;
  } else if (isWorkloadProvided) {
    category = CAPACITY_RESULT_CATEGORIES.USER_PROVIDED_ASSUMPTIONS;
  }

  // 1. Baseline Workload Metrics
  const activeUsers = isWorkloadProvided ? requirements.traffic.dailyActiveUsers : null;
  const peakRps = isWorkloadProvided ? requirements.traffic.requestsPerSecondPeak : null;

  // 2. Hypothetical 10,000-Virtual-User (VU) Scenario Configuration
  const scenario10k = generate10kVirtualUserScenario(inventory, options.customScenario);

  // 3. Projections with inspectable formulas
  const projections = calculateResourceProjections({
    inventory,
    peakRps: peakRps || scenario10k.parameters.projectedPeakRps,
    isWorkloadProvided,
    measuredBenchmark,
  });

  const missingEvidence = [];
  if (!isWorkloadProvided) {
    missingEvidence.push('Production peak and average request arrival rates (RPS)');
    missingEvidence.push('Active user counts and traffic concurrency profiles');
  }
  if (!measuredBenchmark) {
    missingEvidence.push('Measured single-instance throughput saturation ceiling');
    missingEvidence.push('Empirical p95/p99 request duration under realistic database load');
    missingEvidence.push('Database query execution profile under concurrent connections');
  }

  const suggestedBenchmarkPlan = [
    '1. Set up an isolated, dedicated staging environment matching production compute and database specifications.',
    '2. Seed the database with synthetic data mirroring production table volumes.',
    '3. Execute controlled step-load benchmarking starting at 10 concurrent requests, scaling by 10 until p95 latency exceeds SLO (200ms) or error rate exceeds 1%.',
    '4. Record maximum stable requests-per-second before CPU saturation (> 70%) or connection pool exhaustion.',
    '5. Apply the empirical instance throughput into the verified capacity formula: replicas = ceil((peakRps / instanceThroughput) * 1.4 headroom).',
  ];

  const workloadClassification = classifyWorkload({
    requirements,
    benchmark: measuredBenchmark,
    stagingTelemetry: options.stagingTelemetry || null,
  });

  return {
    category,
    workloadClassification,
    workloadState: isWorkloadProvided ? 'USER_PROVIDED' : 'HYPOTHETICAL_SCENARIO_ONLY',
    isVerifiedModel: category === CAPACITY_RESULT_CATEGORIES.VERIFIED_CAPACITY_MODEL,
    observedMetrics: {
      dailyActiveUsers: activeUsers,
      peakRequestsPerSecond: peakRps,
      isMeasuredInProduction: false,
      disclosure:
        category === CAPACITY_RESULT_CATEGORIES.VERIFIED_CAPACITY_MODEL
          ? 'Projections incorporate measured staging benchmark data and user-provided peak arrival rates.'
          : category === CAPACITY_RESULT_CATEGORIES.USER_PROVIDED_ASSUMPTIONS
          ? 'No production traffic measurements fabricated. Observed metrics reflect user configuration assumptions only.'
          : 'Illustrative planning scenario only. No traffic metrics or hardware capacities have been measured.',
    },
    hypothetical10kScenario: scenario10k,
    resourceProjections: projections,
    missingEvidence,
    suggestedBenchmarkPlan,
    prerequisitesForExecution: [
      'Explicit target authorization and dedicated staging environment isolation (never test against production)',
      'Data isolation with synthetic test fixtures and non-destructive cleanup scripts',
      'Pre-agreed concurrency ceiling, rate limits, and maximum test duration',
      'Third-party external webhooks/APIs mocked or excluded from test traffic',
      'Automated stop conditions (circuit breaker if error rate > 5% or latency > 2000ms)',
      'Cleanup and teardown automation',
    ],
  };
}

/**
 * Calculates transparent, inspectable resource projections.
 */
function calculateResourceProjections({ inventory, peakRps, isWorkloadProvided, measuredBenchmark }) {
  const hasDb = inventory.detectedTechnologies.includes('database');

  let recommendedComputeReplicas;
  let replicaCalculationMethodology;

  if (measuredBenchmark && measuredBenchmark.throughputRps > 0) {
    const singleInstanceRps = measuredBenchmark.throughputRps;
    const targetUtilization = 0.7; // 70% target utilization for safe headroom
    const failureDomainHeadroom = 1.3; // 30% safety headroom for failover
    recommendedComputeReplicas = Math.max(2, Math.ceil(((peakRps / singleInstanceRps) / targetUtilization) * failureDomainHeadroom));
    replicaCalculationMethodology = `Empirical: Math.max(2, Math.ceil(((peakRps (${peakRps}) / measuredThroughput (${singleInstanceRps} rps)) / 0.7) * 1.3 headroom))`;
  } else {
    // Hypothetical heuristic sizing labeled clearly as hypothetical
    recommendedComputeReplicas = computeHypotheticalComputeReplicas(inventory, peakRps);
    replicaCalculationMethodology = `Hypothetical Heuristic: Based on illustrative ~300 RPS per container capacity with minimum 2 replicas for high-availability. (Not empirically verified)`;
  }

  const poolSizeCalc = computeRecommendedPoolSize(inventory, peakRps);

  return {
    estimatedConcurrentConnections: isWorkloadProvided ? Math.ceil(peakRps * 0.2) : null,
    recommendedDatabasePoolSize: poolSizeCalc,
    recommendedComputeReplicas,
    formulas: {
      computeReplicasFormula: replicaCalculationMethodology,
      databasePoolFormula: hasDb
        ? 'Clamp(10, 30, ceil(peakRps * avgQueryDurationSec * 1.2)); PgBouncer recommended when peakRps > 1000'
        : 'N/A (No database detected)',
      estimatedConnectionsFormula: 'ceil(peakRps * averageHttpConnectionDurationSec (0.2s))',
    },
    uncertaintyNotice:
      'Projections assume stateless compute replicas, sub-20ms database queries, and absence of external API blocking. Actual capacity requires empirical load verification.',
  };
}

/**
 * Calculates recommended database connection pool limits.
 */
function computeRecommendedPoolSize(inventory, peakRps) {
  if (!inventory.detectedTechnologies.includes('database')) return null;

  if (!peakRps || peakRps <= 100) {
    return {
      perInstanceMax: 10,
      rationale: 'Standard modest connection pool (10 connections per node) prevents database process exhaustion.',
      isHypothetical: true,
    };
  }
  if (peakRps <= 1000) {
    return {
      perInstanceMax: 20,
      rationale: 'Medium connection pool (20 connections per node) sized to balance concurrency against database CPU.',
      isHypothetical: true,
    };
  }
  return {
    perInstanceMax: 30,
    requiresConnectionPooler: true,
    poolerRecommendation: 'Deploy PgBouncer or managed RDS Proxy to multiplex thousands of client connections into <= 50 database backends',
    rationale: 'High peak throughput requires a dedicated connection pooler to prevent PostgreSQL/MySQL connection thread thrashing.',
    isHypothetical: true,
  };
}

/**
 * Calculates hypothetical compute instance replicas clearly labeled as hypothetical.
 */
function computeHypotheticalComputeReplicas(inventory, peakRps) {
  if (inventory.counts.services === 0) return 1;
  if (!peakRps || peakRps <= 150) return 2; // Minimum 2 for high availability
  if (peakRps <= 500) return 3;
  if (peakRps <= 1500) return 5;
  return Math.ceil(peakRps / 300);
}

/**
 * Generates a customizable 10,000-virtual-user workload scenario configuration
 * with thorough educational breakdown of synthetic load testing vs real human behavior.
 *
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} [customParams={}] - Optional user-customized scenario parameters
 * @returns {object} Detailed scenario model
 */
export function generate10kVirtualUserScenario(inventory, customParams = {}) {
  const vus = customParams.virtualUsers ?? 10000;
  const rampUp = customParams.rampUpDurationSeconds ?? 120;
  const steadyState = customParams.steadyStateDurationSeconds ?? 300;
  const rampDown = customParams.rampDownDurationSeconds ?? 60;
  const projectedPeakRps = customParams.projectedPeakRps ?? 1500;
  const projectedAvgRps = customParams.projectedAverageRps ?? 500;

  return {
    scenarioName: `Hypothetical ${vus.toLocaleString()}-Virtual-User Stress Profile`,
    disclaimer:
      `A ${vus.toLocaleString()}-VU synthetic load configuration does not certify that the application will sustain ${vus.toLocaleString()} real human users. Human users possess think times, varied session durations, and unpredictable navigation paths. Execution requires dedicated staging infrastructure.`,
    parameters: {
      virtualUsers: vus,
      rampUpDurationSeconds: rampUp,
      steadyStateDurationSeconds: steadyState,
      rampDownDurationSeconds: rampDown,
      readWriteRatio: customParams.readWriteRatio ?? '80:20 (Read Heavy)',
      projectedAverageRps: projectedAvgRps,
      projectedPeakRps: projectedPeakRps,
      p95LatencyThresholdMs: customParams.p95LatencyThresholdMs ?? 250,
      p99LatencyThresholdMs: customParams.p99LatencyThresholdMs ?? 750,
      maxAllowedErrorRatePercent: customParams.maxAllowedErrorRatePercent ?? 1.0,
    },
    educationalBreakdown: {
      virtualUsersVsRealHumans:
        'A Virtual User (VU) executes code in an infinite loop. 10,000 VUs making requests without think time generate far higher traffic than 10,000 active human website visitors who pause to read pages.',
      arrivalRateVsConcurrency:
        'Concurrency is how many requests are in-flight simultaneously; arrival rate is requests arriving per second. A fast endpoint (10ms) needs 15 concurrent requests to handle 1,500 RPS; a slow endpoint (500ms) needs 750 concurrent requests for the same 1,500 RPS.',
      iterationsVsHttpRequests:
        'One user scenario iteration typically executes 5-15 individual HTTP requests (page HTML, CSS/JS bundles, user auth, dynamic API data).',
      thinkTimeImpact:
        'Omitting think time (sleep between requests) produces unrealistic client hammering. Realistic tests configure Gaussian or exponential think times (1-5 seconds).',
      readWriteRatioImpact:
        'Writes acquire database table/row locks and force disk write-ahead log fsync, consuming significantly more IOPS than cached reads.',
      testGeneratorSaturation:
        'Generating 10,000 concurrent VUs on a single laptop will saturate runner CPU and socket limits, producing false-positive latency spikes.',
      droppedIterations:
        'When backend slows down, test runners with fixed iterations will drop scheduled iterations. Metrics must track planned vs executed iterations.',
      thirdPartyServiceCost:
        'Unmocked payment gateways, SMS providers, or analytics endpoints hit by 10,000 VUs can incur thousands of dollars in API charges or trigger account suspension.',
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
    { duration: '${Math.round(rampUp / 60)}m', target: ${Math.round(vus * 0.25)} },
    { duration: '${Math.round(rampUp / 60)}m', target: ${vus} },
    { duration: '${Math.round(steadyState / 60)}m', target: ${vus} },
    { duration: '${Math.round(rampDown / 60)}m', target: 0 },
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
