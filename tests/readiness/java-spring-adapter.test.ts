import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  JavaSpringBootAdapter,
  runReadinessAudit,
  collectProjectFiles,
  buildInventoryGraph,
} from '../../tools/readiness-auditor.mjs';

describe('Java & Spring Boot Platform Readiness Adapter', () => {
  const rootDir = path.resolve('.');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'java');
  const adapter = new JavaSpringBootAdapter();

  describe('1. Adapter Contract & Metadata', () => {
    it('declares correct adapter identifier and metadata', () => {
      expect(adapter.id).toBe('java-spring');
      expect(adapter.name).toContain('Spring Boot');
      expect(adapter.supportedLanguages).toContain('java');
      expect(adapter.supportedLanguages).toContain('kotlin');
      expect(adapter.supportedFrameworks).toContain('spring-boot');
      expect(adapter.requiredTools).toContain('java');
    });

    it('exposes complete capabilities and applicable checks', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities).toContain('spring_actuator_security');
      expect(capabilities).toContain('spring_security_rules');
      expect(capabilities).toContain('password_encoding');
      expect(capabilities).toContain('jpa_ddl_auto_safety');
      expect(capabilities).toContain('database_migrations_flyway_liquibase');
      expect(capabilities).toContain('java_sql_injection');

      const checks = adapter.getApplicableChecks({ path: '.' }, {});
      expect(checks.length).toBe(12);
      expect(checks.some((c) => c.id === 'SPRING-SEC-001')).toBe(true);
      expect(checks.some((c) => c.id === 'SPRING-SEC-003')).toBe(true);
      expect(checks.some((c) => c.id === 'SPRING-DB-001')).toBe(true);
    });

    it('exposes documented limitations', () => {
      const limitations = adapter.getLimitations();
      expect(limitations.length).toBeGreaterThan(0);
      expect(limitations.some((l) => l.includes('runtime profiles'))).toBe(true);
    });
  });

  describe('2. Platform Detection', () => {
    it('detects Spring Boot Maven application with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-spring-boot-maven');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.buildTool).toBe('maven');
      expect(detection.metadata?.isSpringBoot).toBe(true);
    });

    it('detects Spring Boot Gradle application with confidence 1.0', () => {
      const projectDir = path.join(fixturesDir, 'healthy-spring-boot-gradle');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(true);
      expect(detection.confidence).toBe(1.0);
      expect(detection.metadata?.buildTool).toBe('gradle');
      expect(detection.metadata?.isSpringBoot).toBe(true);
    });

    it('rejects non-Java project', () => {
      const projectDir = path.join(rootDir, 'tests', 'fixtures', 'readiness', 'healthy-app');
      const files = collectProjectFiles(projectDir);
      const detection = adapter.detect({ absPath: projectDir, path: '.' }, { projectDir, files });

      expect(detection.matched).toBe(false);
      expect(detection.confidence).toBe(0);
    });
  });

  describe('3. Static Readiness Checks on Healthy Spring Boot Maven Project', () => {
    const projectDir = path.join(fixturesDir, 'healthy-spring-boot-maven');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('verifies Maven build descriptor, Java 21 version, and mvnw wrapper', () => {
      expect(findings.find((f) => f.id === 'JAVA-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'JAVA-DISC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'JAVA-DISC-003')?.status).toBe('PASS');
    });

    it('verifies safe Actuator exposure and externalized credentials', () => {
      const act = findings.find((f) => f.id === 'SPRING-SEC-001');
      expect(act?.status).toBe('PASS');

      const secProp = findings.find((f) => f.id === 'SPRING-SEC-004');
      expect(secProp?.status).toBe('PASS');
    });

    it('verifies authenticated SecurityFilterChain and BCryptPasswordEncoder', () => {
      const secChain = findings.find((f) => f.id === 'SPRING-SEC-002');
      expect(secChain?.status).toBe('PASS');

      const passEnc = findings.find((f) => f.id === 'SPRING-SEC-003');
      expect(passEnc?.status).toBe('PASS');
    });

    it('verifies safe JPA ddl-auto=validate, Flyway migrations, and typed JPA queries', () => {
      const ddl = findings.find((f) => f.id === 'SPRING-DB-001');
      expect(ddl?.status).toBe('PASS');

      const mig = findings.find((f) => f.id === 'SPRING-DB-002');
      expect(mig?.status).toBe('PASS');

      const jpa = findings.find((f) => f.id === 'SPRING-DB-003');
      expect(jpa?.status).toBe('PASS');
    });

    it('verifies automated JUnit 5 test suite', () => {
      const tests = findings.find((f) => f.id === 'JAVA-TEST-001');
      expect(tests?.status).toBe('PASS');
    });
  });

  describe('4. Static Readiness Checks on Defective Spring Boot Project', () => {
    const projectDir = path.join(fixturesDir, 'defective-spring-boot');
    const files = collectProjectFiles(projectDir);
    const target = { absPath: projectDir, path: '.', manifest: null };
    const findings = adapter.runStaticChecks(target, { projectDir, files });

    it('flags wildcard Actuator exposure as critical failure', () => {
      const act = findings.find((f) => f.id === 'SPRING-SEC-001');
      expect(act?.status).toBe('FAIL');
      expect(act?.severity).toBe('critical');
    });

    it('flags permissive permitAll filter chain as high failure', () => {
      const chain = findings.find((f) => f.id === 'SPRING-SEC-002');
      expect(chain?.status).toBe('FAIL');
      expect(chain?.severity).toBe('high');
    });

    it('flags NoOpPasswordEncoder as critical failure', () => {
      const enc = findings.find((f) => f.id === 'SPRING-SEC-003');
      expect(enc?.status).toBe('FAIL');
      expect(enc?.severity).toBe('critical');
    });

    it('flags plaintext database password in application.properties as critical failure', () => {
      const pass = findings.find((f) => f.id === 'SPRING-SEC-004');
      expect(pass?.status).toBe('FAIL');
      expect(pass?.severity).toBe('critical');
    });

    it('flags dangerous JPA ddl-auto mode (create-drop) as critical failure', () => {
      const ddl = findings.find((f) => f.id === 'SPRING-DB-001');
      expect(ddl?.status).toBe('FAIL');
      expect(ddl?.severity).toBe('critical');
    });

    it('flags raw createNativeQuery string concatenation as critical SQL injection failure', () => {
      const sqli = findings.find((f) => f.id === 'SPRING-DB-003');
      expect(sqli?.status).toBe('FAIL');
      expect(sqli?.severity).toBe('critical');
    });
  });

  describe('5. Static Readiness Checks on Gradle Spring Boot Project', () => {
    it('verifies Gradle Spring Boot project with Liquibase migrations passes checks', () => {
      const projectDir = path.join(fixturesDir, 'healthy-spring-boot-gradle');
      const files = collectProjectFiles(projectDir);
      const target = { absPath: projectDir, path: '.', manifest: null };
      const findings = adapter.runStaticChecks(target, { projectDir, files });

      expect(findings.find((f) => f.id === 'JAVA-DISC-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'JAVA-DISC-002')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'JAVA-DISC-003')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'SPRING-DB-001')?.status).toBe('PASS');
      expect(findings.find((f) => f.id === 'SPRING-DB-002')?.status).toBe('PASS');
    });
  });

  describe('6. Full Pipeline Audit Integration', () => {
    it('runs full readiness audit on healthy-spring-boot-maven and classifies project as java backend', async () => {
      const projectDir = path.join(fixturesDir, 'healthy-spring-boot-maven');
      const graph = buildInventoryGraph(projectDir);

      expect(graph.applications[0].type).toBe('backend');
      expect(graph.applications[0].languages).toContain('java');
      expect(graph.applications[0].frameworks).toContain('spring-boot');

      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.schemaVersion).toBe('1.1.0');
      expect(report.summary.fail).toBe(0);
      expect(report.summary.pass).toBeGreaterThan(5);
      expect(report.policyEvaluation.blockerCount).toBe(0);
    });

    it('runs full readiness audit on defective-spring-boot and rejects release', async () => {
      const projectDir = path.join(fixturesDir, 'defective-spring-boot');
      const report = await runReadinessAudit({
        projectDir,
        executeTests: false,
        trustProject: false,
      });

      expect(report.summary.fail).toBeGreaterThan(0);
      expect(report.policyEvaluation.blockerCount).toBeGreaterThan(0);
      expect(report.policyEvaluation.outcome).toBe('BLOCKED');
    });
  });
});

