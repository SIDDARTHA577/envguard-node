import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateContainerSetup,
  validateKubernetesManifests,
  validateCicdDeploymentGates,
  validateOperationalReliability,
  evaluateDeploymentGate,
  DEPLOYMENT_GATE_VERDICTS,
  DEPLOYMENT_EXECUTION_GUARD,
} from '../../tools/readiness/deployment/index.mjs';
import {
  WORKLOAD_CLASSIFICATIONS,
  classifyWorkload,
  buildCapacityModel,
  runLocalBenchmark,
} from '../../tools/readiness/index.mjs';
import { main as runAuditorCli } from '../../tools/readiness-auditor.mjs';

describe('Phase 12 — Real Deployment, Scalability & Reliability Validation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-deploy-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('12.1: Container Setup & Security Validation', () => {
    it('flags Dockerfile running as root and missing HEALTHCHECK', () => {
      const dockerfile = `
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
`;
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfile.trim());
      const findings = validateContainerSetup(tempDir, ['Dockerfile']);

      const userFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-001');
      expect(userFinding).toBeDefined();
      expect(userFinding.status).toBe('FAIL');
      expect(userFinding.severity).toBe('high');
      expect(userFinding.title).toContain('Missing Unprivileged USER Directive');

      const healthFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-002');
      expect(healthFinding).toBeDefined();
      expect(healthFinding.status).toBe('WARNING');

      const stageFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-003');
      expect(stageFinding).toBeDefined();
      expect(stageFinding.status).toBe('WARNING');
    });

    it('passes hardened multi-stage Dockerfile with unprivileged user and HEALTHCHECK', () => {
      const dockerfile = `
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
COPY --from=builder /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
`;
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfile.trim());
      const findings = validateContainerSetup(tempDir, ['Dockerfile']);

      const userFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-001');
      expect(userFinding.status).toBe('PASS');
      expect(userFinding.explanation).toContain('appuser');

      const healthFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-002');
      expect(healthFinding.status).toBe('PASS');

      const stageFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-003');
      expect(stageFinding.status).toBe('PASS');
    });

    it('catches hardcoded secrets in Dockerfile ENV or ARG', () => {
      const dockerfile = `
FROM node:22-alpine
USER node
ENV DATABASE_PASSWORD="super_secret_production_password_123"
HEALTHCHECK CMD exit 0
CMD ["node", "index.js"]
`;
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfile.trim());
      const findings = validateContainerSetup(tempDir, ['Dockerfile']);

      const secretFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-005');
      expect(secretFinding).toBeDefined();
      expect(secretFinding.status).toBe('FAIL');
      expect(secretFinding.severity).toBe('critical');
      expect(secretFinding.evidence.varName).toBe('DATABASE_PASSWORD');
    });

    it('validates resource limits in docker-compose.yml', () => {
      const composeWithoutLimits = `
version: '3.8'
services:
  web:
    image: my-app:latest
    ports:
      - "3000:3000"
`;
      fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), composeWithoutLimits.trim());
      const findings = validateContainerSetup(tempDir, ['docker-compose.yml']);

      const limitFinding = findings.find((f: any) => f.id === 'DEP-CONTAINER-004');
      expect(limitFinding.status).toBe('WARNING');
      expect(limitFinding.title).toContain('Missing Container Resource Limits');
    });
  });

  describe('12.2: Kubernetes Manifest Validation', () => {
    it('flags Kubernetes Deployment missing readiness probe, limits, and single replica', () => {
      const k8sDir = path.join(tempDir, 'k8s');
      fs.mkdirSync(k8sDir, { recursive: true });

      const deployYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: api:v1.0
        ports:
        - containerPort: 8080
`;
      fs.writeFileSync(path.join(k8sDir, 'deployment.yaml'), deployYaml.trim());
      const findings = validateKubernetesManifests(tempDir, ['k8s/deployment.yaml']);

      const probeFinding = findings.find((f: any) => f.id === 'DEP-K8S-001');
      expect(probeFinding.status).toBe('FAIL');
      expect(probeFinding.title).toContain('Missing Kubernetes Readiness or Liveness Probe');

      const resFinding = findings.find((f: any) => f.id === 'DEP-K8S-002');
      expect(resFinding.status).toBe('WARNING');

      const replicaFinding = findings.find((f: any) => f.id === 'DEP-K8S-004');
      expect(replicaFinding.status).toBe('WARNING');
      expect(replicaFinding.title).toContain('Single-Replica Deployment SPOF');
    });

    it('passes hardened Kubernetes Deployment with probes, resource limits, and HA replicas', () => {
      const deployYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
      - name: api
        image: api:v1.0
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
        readinessProbe:
          httpGet:
            path: /readyz
            port: 8080
        livenessProbe:
          httpGet:
            path: /livez
            port: 8080
`;
      fs.writeFileSync(path.join(tempDir, 'deployment.yaml'), deployYaml.trim());
      const findings = validateKubernetesManifests(tempDir, ['deployment.yaml']);

      expect(findings.find((f: any) => f.id === 'DEP-K8S-001')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-K8S-002')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-K8S-003')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-K8S-004')?.status).toBe('PASS');
    });
  });

  describe('12.3: CI/CD Deployment Gates & Secret Hygiene', () => {
    it('flags un-gated deployment jobs and workflow secrets leaks', () => {
      const wfDir = path.join(tempDir, '.github', 'workflows');
      fs.mkdirSync(wfDir, { recursive: true });

      const deployWf = `
name: CD
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to cluster
        run: kubectl set image deployment/api api=api:latest
        env:
          API_KEY: "literal_insecure_hardcoded_token_value_xyz"
`;
      fs.writeFileSync(path.join(wfDir, 'deploy.yml'), deployWf.trim());
      const findings = validateCicdDeploymentGates(tempDir, ['.github/workflows/deploy.yml']);

      expect(findings.find((f: any) => f.id === 'DEP-CICD-001')?.status).toBe('WARNING');
      expect(findings.find((f: any) => f.id === 'DEP-CICD-002')?.status).toBe('FAIL');
      expect(findings.find((f: any) => f.id === 'DEP-CICD-003')?.status).toBe('WARNING');
    });

    it('passes protected deployment workflow with environment gates and test dependency', () => {
      const wfDir = path.join(tempDir, '.github', 'workflows');
      fs.mkdirSync(wfDir, { recursive: true });

      const deployWf = `
name: Production CD
on:
  push:
    tags: ['v*']
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    needs: [test]
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying..."
        env:
          PROD_KEY: \${{ secrets.PROD_KEY }}
`;
      fs.writeFileSync(path.join(wfDir, 'deploy.yml'), deployWf.trim());
      const findings = validateCicdDeploymentGates(tempDir, ['.github/workflows/deploy.yml']);

      expect(findings.find((f: any) => f.id === 'DEP-CICD-001')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-CICD-003')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-CICD-002')).toBeUndefined();
    });
  });

  describe('12.4: Operational Reliability & Resilience', () => {
    it('detects graceful shutdown handlers and outbound request timeouts', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const serverCode = `
import express from 'express';
const app = express();
const server = app.listen(3000);

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

export async function fetchDownstream() {
  return fetch('https://api.example.com/data', {
    signal: AbortSignal.timeout(3000)
  });
}
`;
      fs.writeFileSync(path.join(srcDir, 'server.ts'), serverCode.trim());
      const findings = validateOperationalReliability(tempDir, ['src/server.ts']);

      expect(findings.find((f: any) => f.id === 'DEP-REL-001')?.status).toBe('PASS');
      expect(findings.find((f: any) => f.id === 'DEP-REL-002')?.status).toBe('PASS');
    });

    it('flags unbounded outbound timeouts and non-reversible database migrations', () => {
      const srcDir = path.join(tempDir, 'src');
      const migDir = path.join(tempDir, 'migrations');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(migDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'client.ts'),
        'export const callApi = () => fetch("https://api.example.com/v1");'
      );
      fs.writeFileSync(
        path.join(migDir, '001_create_users.sql'),
        'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL);'
      );

      const findings = validateOperationalReliability(tempDir, ['src/client.ts', 'migrations/001_create_users.sql']);

      expect(findings.find((f: any) => f.id === 'DEP-REL-002')?.status).toBe('WARNING');
      expect(findings.find((f: any) => f.id === 'DEP-REL-005')?.status).toBe('WARNING');
      expect(findings.find((f: any) => f.id === 'DEP-REL-005')?.title).toContain('Non-Reversible Database Migrations');
    });
  });

  describe('12.5: Workload Classification & Safe Capacity Sizing', () => {
    it('accurately classifies estimated, simulated, measured, and verified workloads', () => {
      expect(
        classifyWorkload({
          stagingTelemetry: { verified: true },
        }).classification
      ).toBe(WORKLOAD_CLASSIFICATIONS.VERIFIED_STAGING);

      expect(
        classifyWorkload({
          benchmark: { samplesCount: 20, throughputRps: 120 },
        }).classification
      ).toBe(WORKLOAD_CLASSIFICATIONS.MEASURED);

      expect(
        classifyWorkload({
          requirements: { traffic: { status: 'CONFIRMED' } },
        }).classification
      ).toBe(WORKLOAD_CLASSIFICATIONS.ESTIMATED);

      expect(
        classifyWorkload({
          requirements: { traffic: { status: 'ASSUMED', isHypothetical: true } },
        }).classification
      ).toBe(WORKLOAD_CLASSIFICATIONS.SIMULATED);

      expect(classifyWorkload().classification).toBe(WORKLOAD_CLASSIFICATIONS.UNKNOWN_PRODUCTION);
    });

    it('attaches workload classification to buildCapacityModel with transparent disclosures', () => {
      const inventory = {
        counts: { services: 1 },
        detectedTechnologies: ['database'],
        components: [{ type: 'service', language: 'typescript' }],
      };
      const requirements = {
        traffic: {
          status: 'ASSUMED',
          isHypothetical: true,
          dailyActiveUsers: 50000,
          requestsPerSecondPeak: 500,
          requestsPerSecondAvg: 100,
        },
      };

      const model = buildCapacityModel(inventory, requirements);
      expect(model.workloadClassification.classification).toBe(WORKLOAD_CLASSIFICATIONS.SIMULATED);
      expect(model.observedMetrics.isMeasuredInProduction).toBe(false);
      expect(model.isVerifiedModel).toBe(false);
    });

    it('enforces loopback constraints in runLocalBenchmark and rejects unauthorized external targets', async () => {
      await expect(
        runLocalBenchmark({
          targetUrl: 'http://0.0.0.0:3000',
        })
      ).rejects.toThrow(/ambiguous wildcard destination/i);

      await expect(
        runLocalBenchmark({
          targetUrl: 'https://production-api.company.com/health',
          allowExternalTarget: false,
        })
      ).rejects.toThrow(/not localhost/i);
    });
  });

  describe('12.6: Deployment Gate & Strict No-Auto-Deploy Policy', () => {
    it('blocks deployment when root container or missing health check is detected', () => {
      const findings = [
        {
          id: 'DEP-CONTAINER-001',
          category: 'deployment',
          status: 'FAIL',
          severity: 'high',
          title: 'Container Explicitly Runs as Root User',
          recommendation: 'Add USER appuser',
        },
      ];

      const gate = evaluateDeploymentGate({
        deploymentFindings: findings,
        policyFindings: [],
      });

      expect(gate.verdict).toBe(DEPLOYMENT_GATE_VERDICTS.BLOCKED);
      expect(gate.deployable).toBe(false);
      expect(gate.blockers.length).toBe(1);
      expect(gate.executionGuard.autoDeployAllowed).toBe(false);
      expect(gate.executionGuard.policy).toBe('STRICT_NO_AUTO_DEPLOY');
    });

    it('requires manual approval when only non-critical deployment warnings exist', () => {
      const findings = [
        {
          id: 'DEP-002',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Health Check Endpoint Available',
        },
        {
          id: 'DEP-003',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Graceful Shutdown Handlers Detected',
        },
        {
          id: 'DEP-K8S-004',
          category: 'deployment',
          status: 'WARNING',
          severity: 'medium',
          title: 'Single-Replica Deployment SPOF',
        },
      ];

      const gate = evaluateDeploymentGate({
        deploymentFindings: findings,
        policyFindings: [],
      });

      expect(gate.verdict).toBe(DEPLOYMENT_GATE_VERDICTS.REQUIRES_MANUAL_APPROVAL);
      expect(gate.deployable).toBe(false);
      expect(gate.warnings.length).toBe(1);
    });

    it('approves deployment readiness while strictly preserving no-auto-deploy enforcement', () => {
      const findings = [
        {
          id: 'DEP-002',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Health Check Endpoint Available',
        },
        {
          id: 'DEP-003',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Graceful Shutdown Handlers Detected',
        },
        {
          id: 'DEP-CONTAINER-001',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Container Runs as Unprivileged User',
        },
      ];

      const gate = evaluateDeploymentGate({
        deploymentFindings: findings,
        policyFindings: [],
      });

      expect(gate.verdict).toBe(DEPLOYMENT_GATE_VERDICTS.READY_FOR_DEPLOYMENT);
      expect(gate.deployable).toBe(true);
      // Strict autonomous deployment restriction must remain in place!
      expect(gate.executionGuard.autoDeployAllowed).toBe(false);
      expect(gate.executionGuard.reason).toContain('separate, explicit human authorization');
      expect(DEPLOYMENT_EXECUTION_GUARD.autoDeployAllowed).toBe(false);
    });

    it('CLI with --deployment-gate reports verdict and exits with appropriate exit code', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'deploy-test', version: '1.0.0' }, null, 2)
      );
      fs.writeFileSync(
        path.join(tempDir, 'Dockerfile'),
        'FROM node:22-alpine\nCMD ["node", "index.js"]\n'
      );

      const exitCode = runAuditorCli(['--project', tempDir, '--deployment-gate']);
      expect(exitCode).toBe(2); // Blocked due to root container / missing prerequisites
    });
  });
});
