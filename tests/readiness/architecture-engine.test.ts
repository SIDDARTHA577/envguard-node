import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildInventoryGraph,
  buildArchitectureInventory,
  discoverArchitectureRequirements,
  evaluateApplicability,
  APPLICABILITY_LEVELS,
  evaluateSystemDesignDecisions,
  SYSTEM_DESIGN_CONCEPTS,
  evaluateArchitectureTradeoffs,
  analyzeFailureModes,
  generateArchitectureDecisionRecords,
} from '../../tools/readiness-auditor.mjs';

describe('Senior Architecture & System Design Engine', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'senior-review');

  describe('1. Topology & Architecture Inventory', () => {
    it('classifies healthy-monolith as modular monolith with database and rate limiting', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);

      expect(arch.topologyType).toBe('modular-monolith');
      expect(arch.detectedTechnologies).toContain('database');
      expect(arch.counts.services).toBe(1);
      expect(arch.components.some((c: { type: string }) => c.type === 'database')).toBe(true);

      // Data flows should connect API to Database
      const apiToDbFlow = arch.dataFlows.find((f: { label: string }) => f.label.includes('Database'));
      expect(apiToDbFlow).toBeDefined();
    });

    it('classifies overengineered-microservices as microservices with API gateway', () => {
      const projectDir = path.join(fixturesDir, 'overengineered-microservices');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);

      expect(arch.topologyType).toBe('microservices');
      expect(arch.counts.services).toBeGreaterThanOrEqual(4);
      expect(arch.components.some((c: { type: string }) => c.type === 'api_gateway')).toBe(true);
    });
  });

  describe('2. Requirements Discovery & Non-Fabrication', () => {
    it('records explicit assumptions when traffic numbers are not provided, never inventing numbers', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const reqs = discoverArchitectureRequirements(projectDir);

      expect(reqs.hasMissingWorkloadData).toBe(true);
      expect(reqs.traffic.status).toBe('UNKNOWN');
      expect(reqs.traffic.requestsPerSecondPeak).toBeNull();

      const trafficAssumption = reqs.assumptions.find((a: { key: string }) => a.key === 'traffic');
      expect(trafficAssumption).toBeDefined();
      expect(trafficAssumption?.confidence).toBe('unverified');
    });

    it('incorporates user-provided requirements accurately', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const explicit = {
        traffic: { requestsPerSecondPeak: 500, dailyActiveUsers: 50000, status: 'PROVIDED' },
        availability: { target: '99.99%', level: 'high_availability' },
        teamSize: 'small (3 engineers)',
      };
      const reqs = discoverArchitectureRequirements(projectDir, explicit);

      expect(reqs.hasMissingWorkloadData).toBe(false);
      expect(reqs.traffic.requestsPerSecondPeak).toBe(500);
      expect(reqs.availability.target).toBe('99.99%');
    });
  });

  describe('3. Architectural Applicability Decision Model', () => {
    it('marks microservices as NOT_RECOMMENDED for small engineering teams', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir, { teamSize: 'small' });

      const res = evaluateApplicability('microservices', arch, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.NOT_RECOMMENDED);
      expect(res.applicable).toBe(false);
      expect(res.reason).toContain('Small engineering team');
    });

    it('marks rate limiting as ESSENTIAL for exposed HTTP backend services', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const res = evaluateApplicability('rate_limiting', arch, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.ESSENTIAL);
      expect(res.applicable).toBe(true);
    });

    it('marks database partitioning as NOT_RECOMMENDED for non-high-volume applications', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const res = evaluateApplicability('partitioning_sharding', arch, reqs);
      expect(res.level).toBe(APPLICABILITY_LEVELS.NOT_RECOMMENDED);
      expect(res.applicable).toBe(false);
    });
  });

  describe('4. Mandatory 17 Primary System Design Concepts Coverage', () => {
    it('evaluates all 17 system design concepts with complete architectural dimensions', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const { evaluations } = evaluateSystemDesignDecisions(projectDir, arch, reqs);

      expect(evaluations.length).toBe(17);
      for (const conceptId of SYSTEM_DESIGN_CONCEPTS) {
        const item = evaluations.find((e: { conceptId: string }) => e.conceptId === conceptId);
        expect(item).toBeDefined();
        expect(item?.problemSolved).toBeDefined();
        expect(item?.risksAndFailureModes).toBeDefined();
        expect(item?.alternatives).toBeDefined();
      }
    });

    it('detects healthy rate limiting, health checks, and graceful shutdown in healthy-monolith', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const { evaluations, findings } = evaluateSystemDesignDecisions(projectDir, arch, reqs);

      const rateLimiting = evaluations.find((e: { conceptId: string }) => e.conceptId === 'rate_limiting');
      expect(rateLimiting?.status).toBe('HEALTHY');
      expect(rateLimiting?.isImplemented).toBe(true);

      const loadBalancing = evaluations.find((e: { conceptId: string }) => e.conceptId === 'load_balancing');
      expect(loadBalancing?.status).toBe('HEALTHY');

      const faultTolerance = evaluations.find((e: { conceptId: string }) => e.conceptId === 'fault_tolerance');
      expect(faultTolerance?.status).toBe('HEALTHY');

      // Healthy monolith should have 0 architectural findings
      expect(findings.length).toBe(0);
    });

    it('detects unbounded memory cache, missing rate limit, and missing health checks in defective-architecture', () => {
      const projectDir = path.join(fixturesDir, 'defective-architecture');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir, { availability: { level: 'high_availability' } });

      const { evaluations, findings } = evaluateSystemDesignDecisions(projectDir, arch, reqs);

      const cacheEval = evaluations.find((e: { conceptId: string }) => e.conceptId === 'caching');
      expect(cacheEval?.status).toBe('DEFECTIVE');

      const rateEval = evaluations.find((e: { conceptId: string }) => e.conceptId === 'rate_limiting');
      expect(rateEval?.status).toBe('DEFECTIVE');

      const faultEval = evaluations.find((e: { conceptId: string }) => e.conceptId === 'fault_tolerance');
      expect(faultEval?.status).toBe('DEFECTIVE');

      const findingIds = findings.map((f: { id: string }) => f.id);
      expect(findingIds).toContain('ARCH-CACHE-001');
      expect(findingIds).toContain('ARCH-RATE-001');
      expect(findingIds).toContain('ARCH-FAULT-001');
    });
  });

  describe('5. Tradeoffs, FMEA & Architecture Decision Records (ADRs)', () => {
    it('generates multi-dimensional architectural tradeoffs', () => {
      const projectDir = path.join(fixturesDir, 'healthy-monolith');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const tradeoffs = evaluateArchitectureTradeoffs(arch, reqs);
      expect(tradeoffs.length).toBeGreaterThanOrEqual(3);

      const simplicityTradeoff = tradeoffs.find((t: { dimension: string }) => t.dimension.includes('Simplicity'));
      expect(simplicityTradeoff).toBeDefined();
      expect(simplicityTradeoff?.currentChoice).toBe('Modular Monolith');
    });

    it('generates structured Failure Mode and Effects Analysis (FMEA)', () => {
      const projectDir = path.join(fixturesDir, 'defective-architecture');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir);

      const fmea = analyzeFailureModes(arch, reqs);
      expect(fmea.length).toBeGreaterThanOrEqual(4);

      const dbFailure = fmea.find((f: { category: string }) => f.category === 'database');
      expect(dbFailure).toBeDefined();
      expect(dbFailure?.severity).toBe('critical');
    });

    it('formulates complete ADR drafts with rollback strategies and required evidence for defective architecture', () => {
      const projectDir = path.join(fixturesDir, 'defective-architecture');
      const baseGraph = buildInventoryGraph(projectDir);
      const arch = buildArchitectureInventory(projectDir, baseGraph);
      const reqs = discoverArchitectureRequirements(projectDir, { availability: { level: 'high_availability' } });

      const { evaluations } = evaluateSystemDesignDecisions(projectDir, arch, reqs);
      const adrs = generateArchitectureDecisionRecords(arch, reqs, evaluations);

      expect(adrs.length).toBeGreaterThanOrEqual(2);
      const cacheAdr = adrs.find((a: { id: string }) => a.id === 'ADR-CACHING');
      expect(cacheAdr).toBeDefined();
      expect(cacheAdr?.context).toBeDefined();
      expect(cacheAdr?.decisionRecommendation).toBeDefined();
      expect(cacheAdr?.rollbackStrategy).toBeDefined();
      expect(cacheAdr?.evidenceNeededBeforeAcceptance.length).toBeGreaterThan(0);
    });
  });
});
