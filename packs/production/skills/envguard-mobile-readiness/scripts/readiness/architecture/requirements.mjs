import fs from 'node:fs';
import path from 'node:path';

/**
 * Normalized provenance source classes for architecture requirements.
 */
export const REQUIREMENT_SOURCES = {
  USER_EXPLICIT: 'user_explicit',
  VERIFIED_REPO_CONFIG: 'verified_repo_config',
  DOCUMENTED_REQUIREMENT: 'documented_requirement',
  TOOL_MEASUREMENT: 'tool_measurement',
  INFERRED_HEURISTIC: 'inferred_heuristic',
  ILLUSTRATIVE_DEFAULT: 'illustrative_default',
  UNKNOWN: 'unknown',
};

/**
 * Requirement confirmation status.
 */
export const REQUIREMENT_STATUS = {
  CONFIRMED: 'CONFIRMED',
  ASSUMED: 'ASSUMED',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Confidence levels.
 */
export const REQUIREMENT_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNVERIFIED: 'unverified',
};

/**
 * Validates requirements configuration against schema without executing code.
 *
 * @param {object} config - Parsed requirements configuration
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequirementsConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['Requirements configuration must be a valid JSON object.'] };
  }

  if (config.schemaVersion !== undefined && typeof config.schemaVersion !== 'string') {
    errors.push('schemaVersion must be a string.');
  }

  if (config.applicationPurpose !== undefined && typeof config.applicationPurpose !== 'string') {
    errors.push('applicationPurpose must be a string.');
  }

  if (config.criticalUserJourneys !== undefined) {
    if (!Array.isArray(config.criticalUserJourneys)) {
      errors.push('criticalUserJourneys must be an array of strings or journey objects.');
    }
  }

  if (config.expectedTraffic !== undefined) {
    if (typeof config.expectedTraffic !== 'object' || Array.isArray(config.expectedTraffic)) {
      errors.push('expectedTraffic must be an object.');
    } else {
      const { requestsPerSecondPeak, requestsPerSecondAvg, dailyActiveUsers } = config.expectedTraffic;
      if (requestsPerSecondPeak !== undefined && requestsPerSecondPeak !== null) {
        if (typeof requestsPerSecondPeak !== 'number' || Number.isNaN(requestsPerSecondPeak) || requestsPerSecondPeak < 0) {
          errors.push('expectedTraffic.requestsPerSecondPeak must be a non-negative number or null.');
        }
      }
      if (requestsPerSecondAvg !== undefined && requestsPerSecondAvg !== null) {
        if (typeof requestsPerSecondAvg !== 'number' || Number.isNaN(requestsPerSecondAvg) || requestsPerSecondAvg < 0) {
          errors.push('expectedTraffic.requestsPerSecondAvg must be a non-negative number or null.');
        }
      }
      if (dailyActiveUsers !== undefined && dailyActiveUsers !== null) {
        if (typeof dailyActiveUsers !== 'number' || Number.isNaN(dailyActiveUsers) || dailyActiveUsers < 0) {
          errors.push('expectedTraffic.dailyActiveUsers must be a non-negative number or null.');
        }
      }
    }
  }

  if (config.latencySLO !== undefined) {
    if (typeof config.latencySLO !== 'object' || Array.isArray(config.latencySLO)) {
      errors.push('latencySLO must be an object.');
    } else {
      for (const key of ['p50Ms', 'p95Ms', 'p99Ms']) {
        if (config.latencySLO[key] !== undefined && (typeof config.latencySLO[key] !== 'number' || config.latencySLO[key] < 0)) {
          errors.push(`latencySLO.${key} must be a positive number.`);
        }
      }
    }
  }

  if (config.recoveryObjectives !== undefined) {
    if (typeof config.recoveryObjectives !== 'object' || Array.isArray(config.recoveryObjectives)) {
      errors.push('recoveryObjectives must be an object.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Loads project-level requirements configuration file safely from .envguard/requirements.json
 *
 * @param {string} projectDir - Project root directory
 * @returns {{ config: object | null, errors: string[], fileFound: boolean }}
 */
export function loadProjectRequirementsFile(projectDir) {
  const reqPath = path.join(projectDir, '.envguard', 'requirements.json');
  if (!fs.existsSync(reqPath)) {
    return { config: null, errors: [], fileFound: false };
  }

  try {
    const raw = fs.readFileSync(reqPath, 'utf8');
    const parsed = JSON.parse(raw);
    const validation = validateRequirementsConfig(parsed);
    return {
      config: validation.valid ? parsed : null,
      errors: validation.errors,
      fileFound: true,
      filePath: reqPath,
    };
  } catch (err) {
    return {
      config: null,
      errors: [`Failed to parse .envguard/requirements.json: ${err.message}`],
      fileFound: true,
      filePath: reqPath,
    };
  }
}

/**
 * Discovers and records system requirements from documentation, configuration, and explicit input.
 * Constructs a normalized RequirementsProfile with explicit provenance for every property,
 * never treating illustrative assumptions as confirmed requirements.
 *
 * @param {string} projectDir - Project root directory
 * @param {object} [explicitRequirements={}] - User-provided explicit requirements
 * @returns {object} Requirements profile with assumptions and confidence levels
 */
export function discoverArchitectureRequirements(projectDir, explicitRequirements = {}) {
  const assumptions = [];
  const properties = {};
  const validationErrors = [];

  // Helper to record a property with full provenance tracking
  const trackProperty = ({
    fieldName,
    value,
    source,
    evidenceRef = null,
    confidence = REQUIREMENT_CONFIDENCE.MEDIUM,
    status = REQUIREMENT_STATUS.CONFIRMED,
    isRequired = false,
    isMissing = false,
    validationResult = { valid: true },
    rationale = '',
  }) => {
    properties[fieldName] = {
      fieldName,
      value,
      source,
      evidenceRef,
      confidence,
      status,
      isRequired,
      isMissing,
      validationResult,
    };

    if (status === REQUIREMENT_STATUS.ASSUMED || source === REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT || source === REQUIREMENT_SOURCES.UNKNOWN) {
      assumptions.push({
        key: fieldName,
        value: typeof value === 'object' && value !== null ? (value.target || value.status || JSON.stringify(value)) : String(value ?? 'UNKNOWN'),
        confidence,
        rationale: rationale || `Assumed value from ${source}`,
        source,
        status,
      });
    }

    return value;
  };

  // Inspect documentation files for hints
  let docContent = '';
  let documentedEvidencePath = null;
  const candidateDocs = ['README.md', 'docs/architecture.md', 'docs/system-design.md', 'SPEC.md'];
  for (const doc of candidateDocs) {
    try {
      const fullPath = path.join(projectDir, doc);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        docContent += ' ' + content;
        if (!documentedEvidencePath) documentedEvidencePath = doc;
      }
    } catch {}
  }

  // Load project-level .envguard/requirements.json if present
  const repoConfigFile = loadProjectRequirementsFile(projectDir);
  const repoConfig = repoConfigFile.config || {};
  if (repoConfigFile.errors.length > 0) {
    validationErrors.push(...repoConfigFile.errors);
  }

  // Helper to determine value from precedence: explicit > repoConfig > doc / package > default
  const resolveField = (key, explicitVal, configVal) => {
    if (explicitVal !== undefined && explicitVal !== null) {
      return { val: explicitVal, source: REQUIREMENT_SOURCES.USER_EXPLICIT, status: REQUIREMENT_STATUS.CONFIRMED, ref: 'explicit_parameter' };
    }
    if (configVal !== undefined && configVal !== null) {
      return { val: configVal, source: REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG, status: REQUIREMENT_STATUS.CONFIRMED, ref: '.envguard/requirements.json' };
    }
    return null;
  };

  // 1. Product Purpose
  let productPurpose;
  const resolvedPurpose = resolveField(
    'productPurpose',
    explicitRequirements.productPurpose,
    repoConfig.applicationPurpose || repoConfig.productPurpose
  );

  if (resolvedPurpose) {
    productPurpose = trackProperty({
      fieldName: 'productPurpose',
      value: resolvedPurpose.val,
      source: resolvedPurpose.source,
      evidenceRef: resolvedPurpose.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedPurpose.status,
    });
  } else {
    const pkgPath = path.join(projectDir, 'package.json');
    let pkgDesc = null;
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.description) pkgDesc = pkg.description;
      }
    } catch {}

    if (pkgDesc) {
      productPurpose = trackProperty({
        fieldName: 'productPurpose',
        value: pkgDesc,
        source: REQUIREMENT_SOURCES.DOCUMENTED_REQUIREMENT,
        evidenceRef: 'package.json:description',
        confidence: REQUIREMENT_CONFIDENCE.MEDIUM,
        status: REQUIREMENT_STATUS.CONFIRMED,
      });
    } else {
      productPurpose = trackProperty({
        fieldName: 'productPurpose',
        value: 'General Application Service',
        source: REQUIREMENT_SOURCES.INFERRED_HEURISTIC,
        evidenceRef: null,
        confidence: REQUIREMENT_CONFIDENCE.LOW,
        status: REQUIREMENT_STATUS.ASSUMED,
        rationale: 'Inferred general application role; no explicit purpose defined in documentation or manifest.',
      });
    }
  }

  // 2. Critical User Journeys
  const resolvedJourneys = resolveField('criticalUserJourneys', explicitRequirements.criticalUserJourneys, repoConfig.criticalUserJourneys);
  let criticalUserJourneys = [];
  if (resolvedJourneys) {
    criticalUserJourneys = trackProperty({
      fieldName: 'criticalUserJourneys',
      value: resolvedJourneys.val,
      source: resolvedJourneys.source,
      evidenceRef: resolvedJourneys.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedJourneys.status,
    });
  } else {
    criticalUserJourneys = trackProperty({
      fieldName: 'criticalUserJourneys',
      value: [],
      source: REQUIREMENT_SOURCES.UNKNOWN,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.UNVERIFIED,
      status: REQUIREMENT_STATUS.UNKNOWN,
      isMissing: true,
      rationale: 'Critical user journeys not documented or configured.',
    });
  }

  // 3. Expected Traffic (RPS, DAU, MAU) — NEVER INVENT
  const rawTraffic = explicitRequirements.traffic || repoConfig.expectedTraffic;
  let expectedTraffic;
  if (rawTraffic && (rawTraffic.requestsPerSecondPeak !== undefined || rawTraffic.dailyActiveUsers !== undefined || rawTraffic.status === 'PROVIDED')) {
    const source = explicitRequirements.traffic ? REQUIREMENT_SOURCES.USER_EXPLICIT : REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG;
    const ref = explicitRequirements.traffic ? 'explicit_parameter' : '.envguard/requirements.json';
    expectedTraffic = trackProperty({
      fieldName: 'traffic',
      value: {
        requestsPerSecondPeak: rawTraffic.requestsPerSecondPeak ?? null,
        requestsPerSecondAvg: rawTraffic.requestsPerSecondAvg ?? null,
        dailyActiveUsers: rawTraffic.dailyActiveUsers ?? null,
        status: rawTraffic.status || 'PROVIDED',
        mode: rawTraffic.mode || 'configured',
      },
      source,
      evidenceRef: ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: REQUIREMENT_STATUS.CONFIRMED,
    });
  } else {
    expectedTraffic = trackProperty({
      fieldName: 'traffic',
      value: {
        requestsPerSecondPeak: null,
        requestsPerSecondAvg: null,
        dailyActiveUsers: null,
        status: 'UNKNOWN',
        mode: 'unspecified',
      },
      source: REQUIREMENT_SOURCES.UNKNOWN,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.UNVERIFIED,
      status: REQUIREMENT_STATUS.UNKNOWN,
      isMissing: true,
      rationale:
        'Workload traffic metrics not provided. EnvGuard does not invent production traffic numbers; capacity scenario models are provided for planning.',
    });
  }

  // 4. Availability Expectations (SLA / SLO)
  const rawAvailability = explicitRequirements.availability || repoConfig.availabilityTarget;
  let availability;
  if (rawAvailability) {
    const target = typeof rawAvailability === 'string' ? rawAvailability : rawAvailability.target || '99.9%';
    const level = rawAvailability.level || (target.includes('99.99') ? 'high_availability' : 'standard_business');
    const source = explicitRequirements.availability ? REQUIREMENT_SOURCES.USER_EXPLICIT : REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG;
    const ref = explicitRequirements.availability ? 'explicit_parameter' : '.envguard/requirements.json';

    availability = trackProperty({
      fieldName: 'availability',
      value: { target, level, errorBudgetMinutesPerMonth: rawAvailability.errorBudgetMinutesPerMonth ?? (level === 'high_availability' ? 4.32 : 43.2) },
      source,
      evidenceRef: ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: REQUIREMENT_STATUS.CONFIRMED,
    });
  } else if (docContent.includes('99.99%') || /high availability|four nines/i.test(docContent)) {
    availability = trackProperty({
      fieldName: 'availability',
      value: { target: '99.99%', level: 'high_availability', errorBudgetMinutesPerMonth: 4.32 },
      source: REQUIREMENT_SOURCES.DOCUMENTED_REQUIREMENT,
      evidenceRef: documentedEvidencePath,
      confidence: REQUIREMENT_CONFIDENCE.MEDIUM,
      status: REQUIREMENT_STATUS.CONFIRMED,
      rationale: 'Inferred high-availability requirement from project documentation.',
    });
  } else {
    // Illustrative default — must NOT be reported as confirmed business requirement
    availability = trackProperty({
      fieldName: 'availability',
      value: { target: '99.9%', level: 'standard_business', errorBudgetMinutesPerMonth: 43.2 },
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.UNVERIFIED,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed illustrative three-nines (99.9%) target for web services; not a confirmed business requirement.',
    });
  }

  // 5. Latency Target
  const rawLatency = explicitRequirements.latencyTarget || repoConfig.latencySLO;
  let latencyTarget;
  if (rawLatency) {
    const source = explicitRequirements.latencyTarget ? REQUIREMENT_SOURCES.USER_EXPLICIT : REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG;
    const ref = explicitRequirements.latencyTarget ? 'explicit_parameter' : '.envguard/requirements.json';
    latencyTarget = trackProperty({
      fieldName: 'latencyTarget',
      value: {
        p50Ms: rawLatency.p50Ms ?? 50,
        p95Ms: rawLatency.p95Ms ?? 200,
        p99Ms: rawLatency.p99Ms ?? 500,
        isDefaultStandard: false,
      },
      source,
      evidenceRef: ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: REQUIREMENT_STATUS.CONFIRMED,
    });
  } else {
    latencyTarget = trackProperty({
      fieldName: 'latencyTarget',
      value: {
        p50Ms: 50,
        p95Ms: 200,
        p99Ms: 500,
        isDefaultStandard: true,
      },
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed illustrative API target (p95 < 200ms) in absence of explicit performance SLA.',
    });
  }

  // 6. Data Sensitivity & Compliance
  const resolvedSensitivity = resolveField('dataSensitivity', explicitRequirements.dataSensitivity, repoConfig.dataSensitivity);
  let dataSensitivity;
  if (resolvedSensitivity) {
    dataSensitivity = trackProperty({
      fieldName: 'dataSensitivity',
      value: resolvedSensitivity.val,
      source: resolvedSensitivity.source,
      evidenceRef: resolvedSensitivity.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedSensitivity.status,
    });
  } else {
    const hasPiiSignals = /user|email|password|token|payment|card|ssn/i.test(docContent);
    dataSensitivity = trackProperty({
      fieldName: 'dataSensitivity',
      value: hasPiiSignals ? 'CONFIDENTIAL_PII' : 'INTERNAL',
      source: REQUIREMENT_SOURCES.INFERRED_HEURISTIC,
      evidenceRef: hasPiiSignals ? documentedEvidencePath : null,
      confidence: hasPiiSignals ? REQUIREMENT_CONFIDENCE.MEDIUM : REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: hasPiiSignals
        ? 'Detected user credentials or account data signals in source/documentation.'
        : 'Assumed internal business data sensitivity without verified regulatory compliance flags.',
    });
  }

  // 7. Geographic Distribution
  const resolvedGeo = resolveField('geographicDistribution', explicitRequirements.geographicDistribution, repoConfig.geographicDistribution);
  let geographicDistribution;
  if (resolvedGeo) {
    geographicDistribution = trackProperty({
      fieldName: 'geographicDistribution',
      value: resolvedGeo.val,
      source: resolvedGeo.source,
      evidenceRef: resolvedGeo.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedGeo.status,
    });
  } else {
    geographicDistribution = trackProperty({
      fieldName: 'geographicDistribution',
      value: 'single-region',
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed single-region primary deployment topology unless multi-region is explicitly configured.',
    });
  }

  // 8. Team Size & Operational Maintenance Capacity
  const resolvedTeam = resolveField('teamSize', explicitRequirements.teamSize, repoConfig.teamSize);
  let teamSize;
  if (resolvedTeam) {
    teamSize = trackProperty({
      fieldName: 'teamSize',
      value: resolvedTeam.val,
      source: resolvedTeam.source,
      evidenceRef: resolvedTeam.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedTeam.status,
    });
  } else {
    teamSize = trackProperty({
      fieldName: 'teamSize',
      value: 'small', // 2-5 engineers default
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed small engineering team; architectural simplicity and low operational overhead should be prioritized.',
    });
  }

  // 9. Hosting & Budget Constraints
  const resolvedBudget = resolveField(
    'hostingBudget',
    explicitRequirements.hostingBudget,
    repoConfig.budgetAssumptions || repoConfig.hostingConstraints?.budgetMonthlyUsd ? 'cost_sensitive' : null
  );
  let hostingBudget;
  if (resolvedBudget) {
    hostingBudget = trackProperty({
      fieldName: 'hostingBudget',
      value: resolvedBudget.val,
      source: resolvedBudget.source,
      evidenceRef: resolvedBudget.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedBudget.status,
    });
  } else {
    hostingBudget = trackProperty({
      fieldName: 'hostingBudget',
      value: 'cost_sensitive',
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed cost-conscious infrastructure posture; avoid recommending costly enterprise clusters.',
    });
  }

  // 10. Recovery Objectives (RPO/RTO)
  const resolvedRecovery = resolveField('recoveryObjectives', explicitRequirements.recoveryObjectives, repoConfig.recoveryObjectives);
  let recoveryObjectives;
  if (resolvedRecovery) {
    recoveryObjectives = trackProperty({
      fieldName: 'recoveryObjectives',
      value: resolvedRecovery.val,
      source: resolvedRecovery.source,
      evidenceRef: resolvedRecovery.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedRecovery.status,
    });
  } else {
    recoveryObjectives = trackProperty({
      fieldName: 'recoveryObjectives',
      value: null,
      source: REQUIREMENT_SOURCES.UNKNOWN,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.UNVERIFIED,
      status: REQUIREMENT_STATUS.UNKNOWN,
      isMissing: true,
      rationale: 'Recovery objectives (RPO/RTO) not specified.',
    });
  }

  // 11. Deployment Environment
  const resolvedEnv = resolveField('deploymentEnvironment', explicitRequirements.deploymentEnvironment, repoConfig.deploymentEnvironment);
  let deploymentEnvironment;
  if (resolvedEnv) {
    deploymentEnvironment = trackProperty({
      fieldName: 'deploymentEnvironment',
      value: resolvedEnv.val,
      source: resolvedEnv.source,
      evidenceRef: resolvedEnv.ref,
      confidence: REQUIREMENT_CONFIDENCE.HIGH,
      status: resolvedEnv.status,
    });
  } else {
    deploymentEnvironment = trackProperty({
      fieldName: 'deploymentEnvironment',
      value: 'production',
      source: REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT,
      evidenceRef: null,
      confidence: REQUIREMENT_CONFIDENCE.LOW,
      status: REQUIREMENT_STATUS.ASSUMED,
      rationale: 'Assumed production deployment target in absence of explicit environment flag.',
    });
  }

  // Count provenance status
  let confirmedCount = 0;
  let assumedCount = 0;
  let unknownCount = 0;
  for (const prop of Object.values(properties)) {
    if (prop.status === REQUIREMENT_STATUS.CONFIRMED) confirmedCount++;
    else if (prop.status === REQUIREMENT_STATUS.ASSUMED) assumedCount++;
    else unknownCount++;
  }

  const profile = {
    schemaVersion: '1.0.0',
    properties,
    provenanceSummary: {
      total: Object.keys(properties).length,
      confirmed: confirmedCount,
      assumed: assumedCount,
      unknown: unknownCount,
      missingRequired: Object.values(properties).filter((p) => p.isMissing && p.isRequired).length,
    },
    validation: {
      valid: validationErrors.length === 0,
      errors: validationErrors,
    },
  };

  return {
    productPurpose,
    criticalUserJourneys,
    traffic: expectedTraffic,
    availability,
    latencyTarget,
    dataSensitivity,
    geographicDistribution,
    teamSize,
    hostingBudget,
    recoveryObjectives,
    deploymentEnvironment,
    assumptions,
    hasMissingWorkloadData: expectedTraffic.status === 'UNKNOWN',
    profile,
  };
}
