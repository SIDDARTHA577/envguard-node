import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  runOrchestratedPipeline,
  WORKFLOW_STATES,
  selectSkillsForProject,
  SKILL_PRIORITIES,
  formulateAssessmentPlan,
  runAuditorCli,
  EXIT_CODES,
  TRUST_MODELS,
} from '../../tools/readiness-auditor.mjs';

const rootDir = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

type SkillItem = { name: string; priority: string; [key: string]: unknown };

describe('Phase 10 — Complete Senior Engineering Agent Orchestration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-orchestrator-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('10.1: Workflow Pipeline States & State Transitions', () => {
    it('defines standard WORKFLOW_STATES enum', () => {
      expect(WORKFLOW_STATES.INITIALIZING).toBe('INITIALIZING');
      expect(WORKFLOW_STATES.DISCOVERING).toBe('DISCOVERING');
      expect(WORKFLOW_STATES.PLANNING).toBe('PLANNING');
      expect(WORKFLOW_STATES.ASSESSING).toBe('ASSESSING');
      expect(WORKFLOW_STATES.ANALYZING_ARCHITECTURE).toBe('ANALYZING_ARCHITECTURE');
      expect(WORKFLOW_STATES.REPORTING).toBe('REPORTING');
      expect(WORKFLOW_STATES.COMPLETED).toBe('COMPLETED');
      expect(WORKFLOW_STATES.FAILED).toBe('FAILED');
    });

    it('emits state transitions in correct sequential order during execution', () => {
      const observedStates: string[] = [];
      const session = runOrchestratedPipeline({
        projectDir: path.join(fixturesDir, 'healthy-app'),
        onStateTransition: (state: string) => {
          observedStates.push(state);
        },
      });

      expect(session.state).toBe(WORKFLOW_STATES.COMPLETED);
      expect(observedStates).toEqual([
        WORKFLOW_STATES.INITIALIZING,
        WORKFLOW_STATES.DISCOVERING,
        WORKFLOW_STATES.PLANNING,
        WORKFLOW_STATES.ASSESSING,
        WORKFLOW_STATES.ANALYZING_ARCHITECTURE,
        WORKFLOW_STATES.REPORTING,
        WORKFLOW_STATES.COMPLETED,
      ]);

      expect(session.transitions.length).toBe(7);
      for (const t of session.transitions) {
        expect(t.enteredAt).toBeDefined();
        expect(typeof t.durationMs).toBe('number');
      }
    });

    it('handles failure gracefully and transitions to FAILED state', () => {
      const observedStates: string[] = [];
      const session = runOrchestratedPipeline({
        projectDir: path.join(tempDir, 'non-existent-directory-xyz'),
        onStateTransition: (state: string) => {
          observedStates.push(state);
        },
      });

      expect(session.state).toBe(WORKFLOW_STATES.FAILED);
      expect(observedStates).toContain(WORKFLOW_STATES.FAILED);
      expect(session.error).toBeDefined();
    });
  });

  describe('10.2: Skill Selection & Prioritization Engine', () => {
    it('prioritizes foundation skills (P0) for all projects', () => {
      const mockInventory = { applications: [{ type: 'unknown' }], repository: { isMonorepo: false } };
      const selection = selectSkillsForProject(mockInventory, ['.env.example']);

      const p0Skills = selection.selectedSkills.filter((s: SkillItem) => s.priority === SKILL_PRIORITIES.P0);
      const p0Names = p0Skills.map((s: SkillItem) => s.name);

      expect(p0Names).toContain('envguard-production-readiness');
      expect(p0Names).toContain('envguard-senior-engineer-review');
      expect(p0Names).toContain('envguard-review');
    });

    it('recommends envguard-setup when .env.example is missing', () => {
      const mockInventory = { applications: [{ type: 'node-typescript' }], repository: { isMonorepo: false } };
      const selection = selectSkillsForProject(mockInventory, ['server.ts', 'package.json']);

      const setupSkill = selection.selectedSkills.find((s: SkillItem) => s.name === 'envguard-setup');
      expect(setupSkill).toBeDefined();
      expect(setupSkill?.priority).toBe(SKILL_PRIORITIES.P0);
      expect(setupSkill?.reason).toContain('No .env.example template detected');
    });

    it('recommends mobile skills when mobile application is detected', () => {
      const mockInventory = {
        applications: [{ type: 'react-native' }],
        repository: { isMonorepo: false },
      };
      const selection = selectSkillsForProject(mockInventory, ['App.tsx', 'app.json']);

      const mobileSkill = selection.selectedSkills.find((s: SkillItem) => s.name === 'envguard-mobile-readiness');
      expect(mobileSkill).toBeDefined();
      expect(mobileSkill?.priority).toBe(SKILL_PRIORITIES.P0);
    });

    it('recommends backend, API, and load testing skills for Express/FastAPI backends', () => {
      const mockInventory = {
        applications: [
          {
            type: 'node-typescript',
            dependencies: { express: '^4.19.0' },
          },
        ],
        repository: { isMonorepo: false },
      };
      const selection = selectSkillsForProject(mockInventory, ['server.js', '.env.example']);
      const names = selection.selectedSkills.map((s: SkillItem) => s.name);

      expect(names).toContain('envguard-backend');
      expect(names).toContain('envguard-api-design');
      expect(names).toContain('envguard-load-test');
    });

    it('recommends frontend, accessibility, and UI design skills for React apps', () => {
      const mockInventory = {
        applications: [
          {
            type: 'nextjs-react',
            dependencies: { react: '^18.2.0', next: '^14.0.0' },
          },
        ],
        repository: { isMonorepo: false },
      };
      const selection = selectSkillsForProject(mockInventory, ['pages/index.tsx', '.env.example']);
      const names = selection.selectedSkills.map((s: SkillItem) => s.name);

      expect(names).toContain('envguard-frontend');
      expect(names).toContain('envguard-accessibility');
      expect(names).toContain('envguard-ui-design');
    });

    it('recommends database skill when Prisma, PostgreSQL, or ORM is detected', () => {
      const mockInventory = {
        applications: [
          {
            type: 'node-typescript',
            dependencies: { '@prisma/client': '^5.0.0' },
            devDependencies: { prisma: '^5.0.0' },
          },
        ],
        repository: { isMonorepo: false },
      };
      const selection = selectSkillsForProject(mockInventory, ['schema.prisma', '.env.example']);
      const names = selection.selectedSkills.map((s: SkillItem) => s.name);

      expect(names).toContain('envguard-database');
    });

    it('recommends full-stack integration for monorepos', () => {
      const mockInventory = {
        applications: [{ type: 'nextjs-react' }, { type: 'node-typescript' }],
        repository: { isMonorepo: true },
      };
      const selection = selectSkillsForProject(mockInventory, ['.env.example']);
      const names = selection.selectedSkills.map((s: SkillItem) => s.name);

      expect(names).toContain('envguard-fullstack-integration');
    });
  });

  describe('10.3: Assessment Planning & Containment Verification', () => {
    it('formulates complete 5-phase assessment plan with trust model', () => {
      const mockInventory = {
        applications: [
          {
            path: '.',
            scripts: { test: 'vitest run', build: 'tsc' },
          },
        ],
        repository: { isMonorepo: false },
      };

      const plan = formulateAssessmentPlan({
        projectDir: tempDir,
        inventory: mockInventory,
        files: ['package.json'],
        allowExec: false,
        trustProject: false,
      });

      expect(plan.trustModel).toBe(TRUST_MODELS.STATIC_ONLY);
      expect(plan.phases.discovery.status).toBe('PLANNED');
      expect(plan.phases.staticAnalysis.status).toBe('PLANNED');
      expect(plan.phases.dynamicExecution.status).toBe('SKIPPED_READ_ONLY');
      expect(plan.phases.architectureEvaluation.conceptCount).toBe(17);
      expect(plan.phases.reporting.domains).toBe(12);
      expect(plan.skillSelection.executionSequence.length).toBeGreaterThan(0);
    });

    it('plans dynamic execution phase when allowExec and trustProject are granted', () => {
      const mockInventory = {
        applications: [
          {
            path: '.',
            scripts: { test: 'npm test' },
          },
        ],
        repository: { isMonorepo: false },
      };

      const plan = formulateAssessmentPlan({
        projectDir: tempDir,
        inventory: mockInventory,
        files: ['package.json'],
        allowExec: true,
        trustProject: true,
      });

      expect(plan.trustModel).toBe(TRUST_MODELS.TRUSTED_LOCAL_PROJECT);
      expect(plan.phases.dynamicExecution.status).toBe('PLANNED');
      expect(plan.phases.dynamicExecution.authorized).toBe(true);
      expect(plan.plannedCommands.length).toBe(1);
    });
  });

  describe('10.4: Programmatic Pipeline & Session Artifact Emission', () => {
    it('executes full pipeline and returns structured session artifact', () => {
      const outDir = path.join(tempDir, 'session-out');
      const session = runOrchestratedPipeline({
        projectDir: path.join(fixturesDir, 'healthy-app'),
        allowExec: true,
        trustProject: true,
        outputDir: outDir,
        format: 'both',
      });

      expect(session.sessionId).toContain('envguard-session-');
      expect(session.state).toBe(WORKFLOW_STATES.COMPLETED);
      expect(session.policyOutcome).toBe('MANUAL REVIEW REQUIRED');
      expect(session.report.policyEvaluation.gates.zeroBlockers).toBe(true);
      expect(session.report).toBeDefined();
      expect(session.report.sections).toBeDefined();
      expect(session.report.sections.projectOverview).toBeDefined();
      expect(session.report.sections.architecture).toBeDefined();

      // Verify session file written to disk
      const sessionFile = path.join(outDir, 'orchestration-session.json');
      expect(fs.existsSync(sessionFile)).toBe(true);
      const parsedSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      expect(parsedSession.sessionId).toBe(session.sessionId);
      expect(parsedSession.state).toBe(WORKFLOW_STATES.COMPLETED);
    }, 20000);

    it('evaluates defective app and captures blocking release policy outcome', () => {
      const session = runOrchestratedPipeline({
        projectDir: path.join(fixturesDir, 'missing-env'),
      });

      expect(session.state).toBe(WORKFLOW_STATES.COMPLETED);
      expect(session.policyOutcome).toBe('BLOCKED');
      expect(session.recommendations.p0.length).toBeGreaterThan(0);
    });
  });

  describe('10.5: CLI --orchestrate Execution', () => {
    it('runs CLI in --orchestrate mode on healthy application and exits with 0', () => {
      const exitCode = runAuditorCli([
        '--orchestrate',
        '--project',
        path.join(fixturesDir, 'healthy-app'),
      ]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
    });

    it('runs CLI in --orchestrate mode on defective application and exits with 2 (POLICY_BLOCKERS)', () => {
      const exitCode = runAuditorCli([
        '--orchestrate',
        '--project',
        path.join(fixturesDir, 'missing-env'),
      ]);

      expect(exitCode).toBe(EXIT_CODES.POLICY_BLOCKERS);
    });
  });
});
