import fs from 'node:fs';
import path from 'node:path';

/**
 * Discovers and records system requirements from documentation and metadata.
 * Explicitly records unknown parameters as assumptions with confidence ratings,
 * strictly prohibiting fabricated traffic numbers.
 *
 * @param {string} projectDir - Project root directory
 * @param {object} [explicitRequirements={}] - User-provided explicit requirements
 * @returns {object} Requirements profile with assumptions and confidence levels
 */
export function discoverArchitectureRequirements(projectDir, explicitRequirements = {}) {
  const assumptions = [];

  // Helper to record an assumption
  const recordAssumption = (key, value, confidence, rationale) => {
    assumptions.push({ key, value, confidence, rationale });
    return value;
  };

  // Inspect README or documentation files for hints
  let docContent = '';
  const candidateDocs = ['README.md', 'docs/architecture.md', 'docs/system-design.md', 'SPEC.md'];
  for (const doc of candidateDocs) {
    try {
      docContent += ' ' + fs.readFileSync(path.join(projectDir, doc), 'utf8');
    } catch {}
  }

  // 1. Product Purpose
  let productPurpose = explicitRequirements.productPurpose;
  if (!productPurpose) {
    const pkgPath = path.join(projectDir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.description) {
        productPurpose = pkg.description;
      }
    } catch {}
  }
  if (!productPurpose) {
    productPurpose = recordAssumption(
      'productPurpose',
      'General Application Service',
      'low_heuristic',
      'Inferred general application role; no explicit purpose defined in documentation'
    );
  }

  // 2. Expected Traffic (RPS, DAU, MAU) — NEVER INVENT
  let expectedTraffic = explicitRequirements.traffic;
  if (!expectedTraffic) {
    expectedTraffic = {
      requestsPerSecondPeak: null,
      requestsPerSecondAvg: null,
      dailyActiveUsers: null,
      status: 'UNKNOWN',
      mode: 'unspecified',
    };
    assumptions.push({
      key: 'traffic',
      value: 'UNKNOWN',
      confidence: 'unverified',
      rationale:
        'Workload traffic metrics not provided. EnvGuard does not invent production traffic numbers; capacity scenario models are provided for planning.',
    });
  }

  // 3. Availability Expectations (SLA / SLO)
  let availability = explicitRequirements.availability;
  if (!availability) {
    if (docContent.includes('99.99%') || docContent.includes('high availability')) {
      availability = { target: '99.99%', level: 'high_availability', errorBudgetMinutesPerMonth: 4.32 };
      assumptions.push({
        key: 'availability',
        value: '99.99%',
        confidence: 'medium_heuristic',
        rationale: 'Inferred high-availability requirement from project documentation.',
      });
    } else {
      availability = { target: '99.9%', level: 'standard_business', errorBudgetMinutesPerMonth: 43.2 };
      assumptions.push({
        key: 'availability',
        value: '99.9%',
        confidence: 'low_heuristic',
        rationale: 'Assumed standard three-nines (99.9%) availability target for business web services.',
      });
    }
  }

  // 4. Latency Target
  let latencyTarget = explicitRequirements.latencyTarget;
  if (!latencyTarget) {
    latencyTarget = {
      p50Ms: 50,
      p95Ms: 200,
      p99Ms: 500,
      isDefaultStandard: true,
    };
    assumptions.push({
      key: 'latencyTarget',
      value: 'p95 < 200ms',
      confidence: 'low_heuristic',
      rationale: 'Assumed industry-standard API target (p95 < 200ms) in absence of explicit performance SLA.',
    });
  }

  // 5. Data Sensitivity & Compliance
  let dataSensitivity = explicitRequirements.dataSensitivity;
  if (!dataSensitivity) {
    const hasPiiSignals = /user|email|password|token|payment|card|ssn/i.test(docContent);
    dataSensitivity = hasPiiSignals ? 'CONFIDENTIAL_PII' : 'INTERNAL';
    assumptions.push({
      key: 'dataSensitivity',
      value: dataSensitivity,
      confidence: hasPiiSignals ? 'medium_heuristic' : 'low_heuristic',
      rationale: hasPiiSignals
        ? 'Detected user credentials or account data signals in source/documentation.'
        : 'Assumed internal business data sensitivity without verified regulatory compliance flags.',
    });
  }

  // 6. Geographic Distribution
  let geographicDistribution = explicitRequirements.geographicDistribution;
  if (!geographicDistribution) {
    geographicDistribution = 'single-region';
    assumptions.push({
      key: 'geographicDistribution',
      value: 'single-region',
      confidence: 'low_heuristic',
      rationale: 'Assumed single-region primary deployment topology unless multi-region is explicitly configured.',
    });
  }

  // 7. Team Size & Operational Maintenance Capacity
  let teamSize = explicitRequirements.teamSize;
  if (!teamSize) {
    teamSize = 'small'; // 2-5 engineers default
    assumptions.push({
      key: 'teamSize',
      value: 'small (2-5 engineers)',
      confidence: 'low_heuristic',
      rationale:
        'Assumed small engineering team; architectural simplicity and low operational overhead should be prioritized.',
    });
  }

  // 8. Hosting & Budget Constraints
  let hostingBudget = explicitRequirements.hostingBudget;
  if (!hostingBudget) {
    hostingBudget = 'cost_sensitive';
    assumptions.push({
      key: 'hostingBudget',
      value: 'cost_sensitive',
      confidence: 'low_heuristic',
      rationale: 'Assumed cost-conscious infrastructure posture; avoid recommending costly enterprise clusters.',
    });
  }

  return {
    productPurpose,
    traffic: expectedTraffic,
    availability,
    latencyTarget,
    dataSensitivity,
    geographicDistribution,
    teamSize,
    hostingBudget,
    assumptions,
    hasMissingWorkloadData: expectedTraffic.status === 'UNKNOWN',
  };
}
