import { TRUST_MODELS, detectContainerEnvironment } from '../execution/runner.mjs';
import { selectSkillsForProject } from './skills-selector.mjs';

/**
 * Formulates a complete, executable assessment plan prior to execution.
 * Previews static and dynamic phases, validates trust boundaries, and sequences skills.
 *
 * @param {object} [options={}]
 * @param {string} [options.projectDir]
 * @param {object} [options.inventory]
 * @param {string[]} [options.files=[]]
 * @param {boolean} [options.allowExec=false]
 * @param {boolean} [options.trustProject=false]
 * @param {boolean|null} [options.isIsolated=null]
 * @param {number} [options.timeoutMs=10000]
 * @param {string[]} [options.categories]
 * @param {string[]|null} [options.allowedCommands=null]
 * @returns {object} Structured AssessmentPlan
 */
export function formulateAssessmentPlan({
  projectDir,
  inventory,
  files = [],
  allowExec = false,
  trustProject = false,
  isIsolated = null,
  timeoutMs = 10000,
  categories = [],
  allowedCommands = null,
} = {}) {
  // 1. Resolve Containment & Trust Model
  const containerSignals = detectContainerEnvironment();
  const effectiveIsolated = isIsolated !== null ? Boolean(isIsolated) : containerSignals.detected;

  let trustMode = TRUST_MODELS.STATIC_ONLY;
  if (trustProject) {
    trustMode = TRUST_MODELS.TRUSTED_LOCAL_PROJECT;
  } else if (effectiveIsolated) {
    trustMode = TRUST_MODELS.ISOLATED_UNTRUSTED_PROJECT;
  }

  // 2. Identify Planned Candidate Commands
  const plannedCommands = [];
  for (const app of inventory.applications || []) {
    const scripts = app.scripts || {};
    if (scripts.test) {
      plannedCommands.push({ target: app.path || '.', name: 'test', command: 'npm', args: ['run', 'test'] });
    }
    if (scripts.build) {
      plannedCommands.push({ target: app.path || '.', name: 'build', command: 'npm', args: ['run', 'build'] });
    }
    if (scripts.typecheck || scripts['check-types']) {
      plannedCommands.push({ target: app.path || '.', name: 'typecheck', command: 'npm', args: ['run', 'typecheck'] });
    }
    if (scripts.lint) {
      plannedCommands.push({ target: app.path || '.', name: 'lint', command: 'npm', args: ['run', 'lint'] });
    }
  }

  const filteredCommands = allowedCommands
    ? plannedCommands.filter((c) => allowedCommands.includes(c.name))
    : plannedCommands;

  // 3. Skill Selection
  const skillSelection = selectSkillsForProject(inventory, files);

  // 4. Phase Definitions
  const phases = {
    discovery: {
      status: 'PLANNED',
      scope: 'Repository topology, application targets, package managers, and dependencies',
      targetCount: (inventory.applications || []).length,
    },
    staticAnalysis: {
      status: 'PLANNED',
      scope: 'Multi-platform static analysis checks across resolved adapters',
      categories,
    },
    dynamicExecution: {
      status: allowExec ? 'PLANNED' : 'SKIPPED_READ_ONLY',
      authorized: Boolean(allowExec),
      trustMode,
      plannedCommands: filteredCommands,
      isolationIndicator: containerSignals.indicator,
      timeoutPerCommandMs: timeoutMs,
      disclosures: {
        network:
          'Commands may attempt outbound network calls. Network isolation is not enforced on host OS without container containment.',
        filesystem:
          'Commands may write or modify working directory files (e.g. dist/, coverage/, node_modules/.cache, temp files).',
      },
    },
    architectureEvaluation: {
      status: 'PLANNED',
      conceptCount: 17,
      scope: '17 system design concepts, ADR generation, FMEA risk analysis, and capacity modeling',
    },
    reporting: {
      status: 'PLANNED',
      domains: 12,
      outputFormats: ['json', 'markdown', 'professional-engineering'],
    },
  };

  const estimatedDurationMs = allowExec
    ? Math.min(60000, 1000 + filteredCommands.length * 2000)
    : 800;

  return {
    projectDir,
    timestamp: new Date().toISOString(),
    trustModel: trustMode,
    isIsolated: effectiveIsolated,
    isolationIndicator: containerSignals.indicator,
    allowExec: Boolean(allowExec),
    trustProject: Boolean(trustProject),
    phases,
    skillSelection,
    plannedCommands: filteredCommands,
    estimatedDurationMs,
  };
}

