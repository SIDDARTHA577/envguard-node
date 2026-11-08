import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  discoverArchitectureRequirements,
  REQUIREMENT_SOURCES,
  REQUIREMENT_STATUS,
  validateRequirementsConfig,
  evaluateApplicability,
  APPLICABILITY_LEVELS,
  evaluateSystemDesignDecisions,
  buildCapacityModel,
  CAPACITY_RESULT_CATEGORIES,
  validateCapacityInputs,
  generate10kVirtualUserScenario,
  analyzeFailureModes,
  generateArchitectureDecisionRecords,
} from '../../tools/readiness-auditor.mjs';
import { syncCanonicalExecutables } from '../../tools/skill-manager.mjs';

describe('Phase 7 — Engineering Accuracy & Trustworthiness', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'senior-review');

  describe('7.1 Requirements & Provenance Engine', () => {
    it('creates normalized RequirementsProfile with explicit provenance for every property', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const reqs = discoverArchitectureRequirements(projectDir);

      expect(reqs.profile).toBeDefined();
      expect(reqs.profile.schemaVersion).toBe('1.0.0');
      expect(reqs.profile.properties.traffic).toBeDefined();
      expect(reqs.profile.properties.traffic.source).toBe(REQUIREMENT_SOURCES.UNKNOWN);
      expect(reqs.profile.properties.traffic.status).toBe(REQUIREMENT_STATUS.UNKNOWN);
      expect(reqs.profile.properties.traffic.isMissing).toBe(true);
      expect(reqs.profile.properties.traffic.value.requestsPerSecondPeak).toBeNull();
      expect(reqs.profile.properties.traffic.value.dailyActiveUsers).toBeNull();

      // Suggested 99.9% availability target must NOT be reported as confirmed business requirement
      expect(reqs.profile.properties.availability.status).toBe(REQUIREMENT_STATUS.ASSUMED);
      expect(reqs.profile.properties.availability.source).toBe(REQUIREMENT_SOURCES.ILLUSTRATIVE_DEFAULT);
    });

    it('loads and validates .envguard/requirements.json project configuration file', () => {
      const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-req-test-'));
      const envguardDir = path.join(tempProject, '.envguard');
      fs.mkdirSync(envguardDir, { recursive: true });

      const testRequirements = {
        schemaVersion: '1.0.0',
        applicationPurpose: 'Automated Payment Settlement Engine',
        criticalUserJourneys: ['Card tokenization', 'Ledger settlement'],
        expectedTraffic: {
          requestsPerSecondPeak: 1200,
          requestsPerSecondAvg: 400,
          dailyActiveUsers: 150000,
        },
        availabilityTarget: {
          target: '99.99%',
          level: 'high_availability',
        },
        latencySLO: {
          p50Ms: 25,
          p95Ms: 120,
          p99Ms: 350,
        },
        teamSize: 'medium (8 engineers)',
        dataSensitivity: 'CONFIDENTIAL_PII',
      };

      fs.writeFileSync(path.join(envguardDir, 'requirements.json'), JSON.stringify(testRequirements, null, 2));

      try {
        const reqs = discoverArchitectureRequirements(tempProject);
        expect(reqs.productPurpose).toBe('Automated Payment Settlement Engine');
        expect(reqs.traffic.requestsPerSecondPeak).toBe(1200);
        expect(reqs.traffic.dailyActiveUsers).toBe(150000);
        expect(reqs.availability.target).toBe('99.99%');
        expect(reqs.profile.properties.traffic.source).toBe(REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG);
        expect(reqs.profile.properties.traffic.status).toBe(REQUIREMENT_STATUS.CONFIRMED);
        expect(reqs.profile.properties.availability.source).toBe(REQUIREMENT_SOURCES.VERIFIED_REPO_CONFIG);
        expect(reqs.profile.properties.availability.status).toBe(REQUIREMENT_STATUS.CONFIRMED);
        expect(reqs.hasMissingWorkloadData).toBe(false);
      } finally {
        fs.rmSync(tempProject, { recursive: true, force: true });
      }
    });

    it('rejects invalid or unphysical configuration schemas without crashing', () => {
      const invalidConfig = {
        schemaVersion: 123, // Should be string
        applicationPurpose: 456, // Should be string
        expectedTraffic: {
          requestsPerSecondPeak: -50, // Negative throughput invalid
          dailyActiveUsers: 'five-thousand', // String invalid
        },
        latencySLO: {
          p95Ms: -20, // Negative latency invalid
        },
      };

      const result = validateRequirementsConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
      expect(result.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
      expect(result.errors.some((e: string) => e.includes('requestsPerSecondPeak'))).toBe(true);
    });
  });

  describe('7.2 Contextual Architecture Decision Correctness', () => {
    const mockInventory = (overrides = {}) => ({
      topologyType: 'modular-monolith',
      counts: { services: 1, clients: 1, datastores: 1, queues: 0 },
      detectedTechnologies: ['database'],
      components: [
        { id: 'api', type: 'api_service', technologies: ['express'] },
        { id: 'db', type: 'database', technologies: ['postgres'] },
      ],
      ...overrides,
    });

    it('evaluates caching as OPTIONAL (not recommended) for small monolith without read bottlenecks', () => {
      const inv = mockInventory();
      const reqs = {
        teamSize: 'small',
        traffic: { requestsPerSecondPeak: 50 },
        latencyTarget: { p95Ms: 200 },
      };

      const res = evaluateApplicability('caching', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.OPTIONAL);
      expect(res.applicable).toBe(false);
      expect(res.reason).toContain('database alone does not prove caching is needed');
    });

    it('evaluates caching as RECOMMENDED when read-heavy query profile or sub-100ms latency target exists', () => {
      const inv = mockInventory();
      const reqs = {
        teamSize: 'small',
        traffic: { requestsPerSecondPeak: 1200, readWriteRatio: '80:20 (Read Heavy)' },
        latencyTarget: { p95Ms: 50 },
      };

      const res = evaluateApplicability('caching', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.RECOMMENDED);
      expect(res.applicable).toBe(true);
      expect(res.reason).toContain('Measured read-heavy query profile');
    });

    it('evaluates microservices as RECOMMENDED when independent operational requirements justify them', () => {
      const inv = mockInventory({
        topologyType: 'microservices',
        counts: { services: 3, clients: 1, datastores: 2, queues: 1 },
      });
      const reqs = {
        teamSize: 'small',
        hasExplicitMicroservicesRationale: true,
        requiresIndependentScaling: true,
      };

      const res = evaluateApplicability('microservices', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.RECOMMENDED);
      expect(res.applicable).toBe(true);
      expect(res.reason).toContain('justified by independent operational requirements');
    });

    it('flags overengineered microservices with 4+ services for small team without justification', () => {
      const inv = mockInventory({
        topologyType: 'microservices',
        counts: { services: 4, clients: 1, datastores: 4, queues: 2 },
      });
      const reqs = {
        teamSize: 'small (2 engineers)',
      };

      const res = evaluateApplicability('microservices', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.NOT_RECOMMENDED);
      expect(res.applicable).toBe(false);
      expect(res.reason).toContain('Overengineered microservices architecture detected');
    });

    it('does not recommend database sharding merely because DAU is high when indexing suffices', () => {
      const inv = mockInventory();
      const reqs = {
        traffic: { dailyActiveUsers: 2000000 }, // High DAU alone
      };

      const res = evaluateApplicability('partitioning_sharding', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.NOT_RECOMMENDED);
      expect(res.applicable).toBe(false);
      expect(res.reason).toContain('Large DAU or high row count alone does not prove sharding is required');
    });

    it('recommends evaluating database partitioning when dataset exceeds multi-terabytes or write bottleneck occurs', () => {
      const inv = mockInventory();
      const reqs = {
        traffic: { dataVolumeTb: 5, requestsPerSecondPeak: 25000 },
        hasWriteBottleneck: true,
      };

      const res = evaluateApplicability('partitioning_sharding', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.RECOMMENDED);
      expect(res.applicable).toBe(true);
      expect(res.reason).toContain('Multi-terabyte dataset or extreme write throughput');
    });

    it('marks load balancing as OPTIONAL for single-node deployment with relaxed availability SLA', () => {
      const inv = mockInventory();
      const reqs = {
        availability: { target: '99.0%', level: 'relaxed' },
      };

      const res = evaluateApplicability('load_balancing', inv, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.OPTIONAL);
      expect(res.applicable).toBe(false);
      expect(res.reason).toContain('Single-instance deployment is adequate for internal or relaxed-availability workloads');
    });

    it('detects Kubernetes with replicas: 1 as a single point of failure (SPOF)', () => {
      const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-k8s-test-'));
      const k8sDir = path.join(tempProject, 'k8s');
      fs.mkdirSync(k8sDir, { recursive: true });

      const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-deployment
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: api
          image: api:v1
`;
      fs.writeFileSync(path.join(k8sDir, 'deployment.yaml'), deploymentYaml);

      try {
        const inv = mockInventory({
          components: [
            { id: 'infra', type: 'infrastructure', technologies: ['kubernetes'], hasSingleReplicaK8s: true, k8sReplicaCount: 1 },
          ],
        });
        const reqs = discoverArchitectureRequirements(tempProject);
        const { findings } = evaluateSystemDesignDecisions(tempProject, inv, reqs);

        const spofFinding = findings.find((f: { id: string }) => f.id === 'ARCH-K8S-SPOF-001');
        expect(spofFinding).toBeDefined();
        expect(spofFinding?.explanation).toContain('Kubernetes deployment manifest specifies replicas: 1');
      } finally {
        fs.rmSync(tempProject, { recursive: true, force: true });
      }
    });

    it('provides conditional guidance when team size or SLO is unknown', () => {
      const inv = mockInventory({
        topologyType: 'microservices',
        counts: { services: 2, clients: 1, datastores: 1, queues: 0 },
      });
      const reqs = { teamSize: 'unknown' };

      const res = evaluateApplicability('microservices', inv, reqs);
      expect(res.confidence).toBe('low');
      expect(res.reason).toContain('Team size is unknown');
    });
  });

  describe('7.3 Capacity Planning & Inspectable Formulas', () => {
    it('categorizes capacity result into 4 distinct states', () => {
      const inv = { counts: { services: 1 }, detectedTechnologies: ['database'] };

      // 1. Illustrative scenario (unknown workload)
      const modelUnknown = buildCapacityModel(inv, { traffic: { status: 'UNKNOWN' } });
      expect(modelUnknown.category).toBe(CAPACITY_RESULT_CATEGORIES.ILLUSTRATIVE_SCENARIO);
      expect(modelUnknown.isVerifiedModel).toBe(false);
      expect(modelUnknown.missingEvidence.length).toBeGreaterThan(0);

      // 2. User provided assumptions
      const modelProvided = buildCapacityModel(inv, {
        traffic: { status: 'PROVIDED', requestsPerSecondPeak: 600, dailyActiveUsers: 40000 },
      });
      expect(modelProvided.category).toBe(CAPACITY_RESULT_CATEGORIES.USER_PROVIDED_ASSUMPTIONS);
      expect(modelProvided.isVerifiedModel).toBe(false);

      // 3. Measured benchmark with user workload -> Verified Capacity Model
      const modelVerified = buildCapacityModel(
        inv,
        { traffic: { status: 'PROVIDED', requestsPerSecondPeak: 600, dailyActiveUsers: 40000 } },
        { measuredBenchmark: { throughputRps: 250, p95LatencyMs: 45 } }
      );
      expect(modelVerified.category).toBe(CAPACITY_RESULT_CATEGORIES.VERIFIED_CAPACITY_MODEL);
      expect(modelVerified.isVerifiedModel).toBe(true);
      expect(modelVerified.resourceProjections.recommendedComputeReplicas).toBeGreaterThanOrEqual(4);
    });

    it('rejects unphysical inputs (negative throughput, NaN, invalid percentages)', () => {
      expect(() => validateCapacityInputs({ peakRps: -10 })).toThrow('Invalid capacity input "peakRps"');
      expect(() => validateCapacityInputs({ dailyActiveUsers: NaN })).toThrow('Invalid capacity input "dailyActiveUsers"');
      expect(() => validateCapacityInputs({ targetUtilizationPercent: 150 })).toThrow('Invalid capacity input "targetUtilizationPercent"');
    });

    it('includes inspectable formulas and educational breakdown in 10,000-VU model', () => {
      const inv = { counts: { services: 1 }, detectedTechnologies: ['database'] };
      const model = buildCapacityModel(inv, { traffic: { status: 'UNKNOWN' } });

      expect(model.resourceProjections.formulas).toBeDefined();
      expect(model.resourceProjections.formulas.computeReplicasFormula).toBeDefined();
      expect(model.resourceProjections.formulas.databasePoolFormula).toBeDefined();

      const scenario = generate10kVirtualUserScenario(inv);
      expect(scenario.educationalBreakdown.virtualUsersVsRealHumans).toBeDefined();
      expect(scenario.educationalBreakdown.arrivalRateVsConcurrency).toBeDefined();
      expect(scenario.educationalBreakdown.thinkTimeImpact).toBeDefined();
      expect(scenario.educationalBreakdown.thirdPartyServiceCost).toBeDefined();
    });
  });

  describe('7.5 Enhanced Failure Mode and Effects Analysis (FMEA)', () => {
    it('covers all critical failure modes including retry storms, queue poison messages, and rollback failures', () => {
      const inv = {
        counts: { services: 1 },
        detectedTechnologies: ['database', 'cache', 'message-queue'],
        components: [{ type: 'infrastructure', technologies: ['kubernetes'], hasSingleReplicaK8s: true }],
      };
      const reqs = { availability: { target: '99.9%' } };

      const fmea = analyzeFailureModes(inv, reqs);
      expect(fmea.length).toBeGreaterThanOrEqual(10);

      const fmeaIds = fmea.map((f: { id: string }) => f.id);
      expect(fmeaIds).toContain('FMEA-001'); // SPOF compute
      expect(fmeaIds).toContain('FMEA-002'); // DB connection exhaustion
      expect(fmeaIds).toContain('FMEA-003'); // Cache stampede
      expect(fmeaIds).toContain('FMEA-004'); // Downstream timeout
      expect(fmeaIds).toContain('FMEA-005'); // Poison message
      expect(fmeaIds).toContain('FMEA-006'); // Credential rotation
      expect(fmeaIds).toContain('FMEA-007'); // Retry storm
      expect(fmeaIds).toContain('FMEA-008'); // Deep health check
      expect(fmeaIds).toContain('FMEA-010'); // Non-reversible migration
      expect(fmeaIds).toContain('FMEA-011'); // Unverified restore

      for (const item of fmea) {
        expect(item.isHypothetical).toBe(true);
        expect(item.configurationEvidence).toBeDefined();
        expect(item.mitigationState).toBeDefined();
        expect(item.recommendedVerification).toBeDefined();
      }
    });
  });

  describe('7.6 Engineering Report & ADR Accuracy', () => {
    it('tailors rollback strategies and grounds ADR recommendations in failure mode mitigations', () => {
      const inv = {
        topologyType: 'modular-monolith',
        counts: { services: 1, clients: 1, datastores: 1, queues: 0 },
        detectedTechnologies: ['database'],
      };
      const reqs = { teamSize: 'small', availability: { target: '99.9%' } };
      const evaluations = [
        {
          conceptId: 'partitioning_sharding',
          name: 'Database Partitioning & Sharding',
          status: 'RECOMMENDED',
          finding: { recommendation: 'Evaluate table partitioning for high write volume.' },
          evidence: { dataVolume: '5TB' },
          problemSolved: 'Scales database write IOPS.',
          risksAndFailureModes: ['Cross-shard transactional aborts'],
        },
        {
          conceptId: 'caching',
          name: 'Caching (In-Memory & Distributed Stores)',
          status: 'DEFECTIVE',
          finding: { recommendation: 'Add max cap to memory cache.' },
          evidence: { file: 'cache.js' },
          problemSolved: 'Shields primary database.',
          risksAndFailureModes: ['Process OOM'],
        },
      ];

      const adrs = generateArchitectureDecisionRecords(
        inv,
        reqs,
        evaluations as unknown as Parameters<typeof generateArchitectureDecisionRecords>[2]
      );
      expect(adrs.length).toBe(2);

      const dbAdr = adrs.find((a: { id: string }) => a.id.includes('PARTITIONING'));
      expect(dbAdr?.rollbackFeasibility).toBe('complex_requires_dba');
      expect(dbAdr?.rollbackStrategy).toContain('Database rollback is non-trivial');
      expect(dbAdr?.requiresHumanApproval).toBe(true);

      const cacheAdr = adrs.find((a: { id: string }) => a.id.includes('CACHING'));
      expect(cacheAdr?.rollbackStrategy).toContain('Disable cache reads via environment toggle');
      expect(cacheAdr?.requiresHumanApproval).toBe(true);
    });
  });

  describe('7.7 Skill Distribution & Executable Synchronization', () => {
    it('verifies canonical readiness sources match bundled skill copies via SHA256 hashes', () => {
      const checkResult = syncCanonicalExecutables({ checkOnly: true });
      expect(checkResult.valid).toBe(true);
      expect(checkResult.issues.length).toBe(0);
    });

    it('detects stale copies when a bundled executable is artificially altered', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-stale-test-'));
      try {
        // Create a fake repo with stale file
        const toolsDir = path.join(tempDir, 'tools', 'readiness');
        fs.mkdirSync(toolsDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'tools', 'readiness-auditor.mjs'), '// Canonical v1');
        fs.writeFileSync(path.join(toolsDir, 'constants.mjs'), '// Canonical constants');

        const skillScriptsDir = path.join(tempDir, 'packs', 'production', 'skills', 'envguard-production-readiness', 'scripts', 'readiness');
        fs.mkdirSync(skillScriptsDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'packs', 'production', 'skills', 'envguard-production-readiness', 'scripts', 'readiness-auditor.mjs'), '// Stale v0');
        fs.writeFileSync(path.join(skillScriptsDir, 'constants.mjs'), '// Stale constants');

        const checkRes = syncCanonicalExecutables({ repoRoot: tempDir, checkOnly: true });
        expect(checkRes.valid).toBe(false);
        expect(checkRes.issues.some((i: string) => i.includes('Stale executable'))).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
