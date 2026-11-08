import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import {
  TOOL_VERSION,
  REPORT_SCHEMA_VERSION,
  VALID_CATEGORIES,
  assertSafeProjectDir,
  assertSafeOutputDir,
  collectProjectFiles,
} from '../constants.mjs';
import { buildInventoryGraph } from './discovery.mjs';
import { createDefaultRegistry } from '../adapters/registry.mjs';
import { importSarifReport } from './sarif.mjs';
import { runProjectCommand, isEnvironmentIsolated } from '../execution/runner.mjs';
import { evaluateReleasePolicy } from '../policies/release-policy.mjs';
import { formatJsonReport } from '../reporters/json-reporter.mjs';
import { generateMarkdownReport, generateProfessionalEngineeringReport } from '../reporters/markdown-reporter.mjs';
import {
  buildArchitectureInventory,
  discoverArchitectureRequirements,
  evaluateSystemDesignDecisions,
  evaluateArchitectureTradeoffs,
  analyzeFailureModes,
  buildCapacityModel,
  generateArchitectureDecisionRecords,
} from '../architecture/index.mjs';

/**
 * Executes a full multi-platform application production readiness audit.
 * Coordinates discovery, adapter resolution, static checks, dynamic test execution,
 * policy evaluation, and report emission.
 *
 * @param {object} options
 * @param {string} [options.projectDir='.'] - Path to project directory
 * @param {string[]} [options.categories=VALID_CATEGORIES] - Categories of checks to run
 * @param {boolean} [options.allowExec=false] - Whether to permit executing build/test commands
 * @param {boolean} [options.trustProject=false] - Explicit host trust for unisolated hosts
 * @param {boolean|null} [options.isIsolated=null] - Overrides container isolation detection
 * @param {number} [options.timeoutMs=10000] - Subprocess execution timeout in ms
 * @param {string[]|null} [options.allowedCommands=null] - Specific commands allowlist
 * @param {string|null} [options.sarifPath=null] - Optional path to SARIF report to import static analysis findings
 * @param {string|null} [options.outputDir=null] - Directory to save generated reports
 * @param {string} [options.format='both'] - Output format ('json', 'markdown', 'both')
 * @returns {object} Final readiness report object conformant to catalog/readiness-report.schema.json
 */
export function runReadinessAudit({
  projectDir = '.',
  categories = VALID_CATEGORIES,
  allowExec = false,
  trustProject = false,
  isIsolated = null,
  timeoutMs = 10000,
  allowedCommands = null,
  sarifPath = null,
  outputDir = null,
  format = 'both',
  includeArchitecture = true,
  architectureRequirements = {},
} = {}) {
  const safeProjectDir = assertSafeProjectDir(projectDir);

  // Validate categories
  for (const cat of categories) {
    if (!VALID_CATEGORIES.includes(cat)) {
      throw new Error(`Invalid assessment category "${cat}". Valid options: ${VALID_CATEGORIES.join(', ')}`);
    }
  }

  // 1. Discovery & Inventory Graph Construction
  const inventory = buildInventoryGraph(safeProjectDir);
  const files = collectProjectFiles(safeProjectDir);
  const executionAudit = [];

  const context = {
    projectDir: safeProjectDir,
    files,
    inventory,
    allowExec,
    trustProject,
    isIsolated,
    timeoutMs,
    allowedCommands,
    sarifPath,
    executionAudit,
  };

  // 2. Adapter Resolution & Check Execution
  const registry = createDefaultRegistry();
  const allFindings = [];
  const limitations = new Set([
    'Static analysis checks identify potential configuration anomalies and declared patterns; they do not certify absolute security or absence of runtime bugs.',
    'Checks marked NOT_RUN were not executed (e.g. requires --allow-exec or dedicated staging infrastructure).',
    'Checks marked MANUAL_REVIEW require human verification (e.g. assistive technology usability, high-volume database failover).',
    'Regex masking and pattern redaction reduce accidental secret disclosure in report snippets but do not guarantee complete prevention of secret leaks.',
    'No production-readiness percentage is calculated, as qualitative system readiness cannot be accurately represented by a single arithmetic ratio.',
  ]);

  const seenCheckKeys = new Set();

  for (const app of inventory.applications) {
    const resolvedAdapters = registry.resolveAdaptersForTarget(app, context);
    app.detectedAdapters = resolvedAdapters.map((m) => m.adapter.id);

    for (const match of resolvedAdapters) {
      const adapter = match.adapter;

      // Add adapter limitations
      for (const lim of adapter.getLimitations()) {
        limitations.add(lim);
      }

      // Run static checks
      const staticFindings = adapter.runStaticChecks(app, context);
      for (const finding of staticFindings) {
        const key = `${finding.id}::${finding.targetPath || '.'}`;
        if (!seenCheckKeys.has(key)) {
          seenCheckKeys.add(key);
          allFindings.push(finding);
        }
      }

      // Run dynamic checks (build and test execution)
      const dynamicFindings = adapter.runDynamicChecks(app, context, runProjectCommand);
      for (const finding of dynamicFindings) {
        const key = `${finding.id}::${finding.targetPath || '.'}`;
        if (!seenCheckKeys.has(key)) {
          seenCheckKeys.add(key);
          allFindings.push(finding);
        }
      }
    }
  }

  // 2b. Optional SARIF Report Import (SAST, dependency, or secret scanning results)
  if (sarifPath) {
    limitations.add('SARIF findings represent imported external scanner results subject to the scanner tool precision and ruleset.');
    const sarifFindings = importSarifReport(sarifPath, context);
    for (const finding of sarifFindings) {
      allFindings.push(finding);
    }
  }

  // 2c. Architecture & Senior System Design Assessment
  let architecturePayload = null;
  if (includeArchitecture) {
    const archInventory = buildArchitectureInventory(safeProjectDir, inventory);
    const archReqs = discoverArchitectureRequirements(safeProjectDir, architectureRequirements);
    const { evaluations: archEvaluations, findings: archFindings } = evaluateSystemDesignDecisions(
      safeProjectDir,
      archInventory,
      archReqs
    );

    for (const finding of archFindings) {
      finding.toolName = finding.toolName || 'envguard-senior-architect';
      finding.toolVersion = finding.toolVersion || TOOL_VERSION;
      finding.adapterId = finding.adapterId || 'architecture';
      allFindings.push(finding);
    }

    const tradeoffs = evaluateArchitectureTradeoffs(archInventory, archReqs);
    const failureModes = analyzeFailureModes(archInventory, archReqs);
    const capacityModel = buildCapacityModel(archInventory, archReqs);
    const adrs = generateArchitectureDecisionRecords(archInventory, archReqs, archEvaluations);

    architecturePayload = {
      inventory: archInventory,
      requirements: archReqs,
      evaluations: archEvaluations,
      tradeoffs,
      failureModes,
      capacityModel,
      adrs,
    };
  }

  // 3. Filter findings by requested categories
  const filteredFindings = allFindings.filter((f) => categories.includes(f.category));

  // 4. Deterministic sorting: Category index -> Check ID -> File
  const catOrder = new Map(VALID_CATEGORIES.map((c, i) => [c, i]));
  filteredFindings.sort((a, b) => {
    const catDiff = (catOrder.get(a.category) ?? 99) - (catOrder.get(b.category) ?? 99);
    if (catDiff !== 0) return catDiff;
    const idDiff = a.id.localeCompare(b.id);
    if (idDiff !== 0) return idDiff;
    return (a.evidence?.file || '').localeCompare(b.evidence?.file || '');
  });

  // 5. Compute summary statistics
  const summary = {
    totalChecks: filteredFindings.length,
    pass: filteredFindings.filter((f) => f.status === 'PASS').length,
    fail: filteredFindings.filter((f) => f.status === 'FAIL').length,
    warning: filteredFindings.filter((f) => f.status === 'WARNING').length,
    informational: filteredFindings.filter((f) => f.status === 'INFORMATIONAL').length,
    notRun: filteredFindings.filter((f) => f.status === 'NOT_RUN').length,
    manualReview: filteredFindings.filter((f) => f.status === 'MANUAL_REVIEW').length,
    notApplicable: filteredFindings.filter((f) => f.status === 'NOT_APPLICABLE').length,
    error: filteredFindings.filter((f) => f.status === 'ERROR').length,
  };

  // 6. Release Policy Evaluation
  const policyEvaluation = evaluateReleasePolicy(filteredFindings, summary, context);

  // 7. Assemble final report
  const effectiveIsolated = isIsolated !== null ? isIsolated : isEnvironmentIsolated();
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    timestamp: new Date().toISOString(),
    projectRoot: path.basename(safeProjectDir),
    gitCommit: inventory.repository.gitCommit,
    platform: {
      nodeVersion: process.version,
      os: `${process.platform}-${process.arch}`,
      arch: os.arch(),
    },
    configuration: {
      allowExec,
      trustProject,
      timeoutMs,
      categories,
      sarifPath: sarifPath || undefined,
      allowedCommands: allowedCommands || undefined,
    },
    executionPolicy: {
      allowExec,
      trustProject,
      isolated: effectiveIsolated,
      disclosures: {
        network:
          'Build and test commands may attempt outbound network calls. Network isolation requires container containment.',
        filesystem:
          'Build and test commands may modify files in working directory (dist/, coverage/, node_modules/.cache, temp files).',
      },
    },
    executionAudit,
    projectMetadata: {
      inventory,
      architecture: inventory.repository.isMonorepo
        ? 'monorepo'
        : inventory.applications[0]?.type || 'unknown',
    },
    summary,
    policyEvaluation,
    findings: filteredFindings,
    limitations: Array.from(limitations),
    architecture: architecturePayload || undefined,
    sections: {
      projectOverview: {
        projectRoot: path.basename(safeProjectDir),
        gitCommit: inventory.repository.gitCommit,
        applications: inventory.applications,
      },
      architecture: architecturePayload,
      codeQuality: {
        findings: filteredFindings.filter((f) => f.category === 'build_test'),
      },
      security: {
        findings: filteredFindings.filter((f) => f.category === 'security' || f.category === 'env'),
      },
      database: {
        findings: filteredFindings.filter((f) => f.category === 'database'),
      },
      frontend: {
        findings: filteredFindings.filter((f) => f.category === 'accessibility'),
      },
      mobile: {
        findings: filteredFindings.filter(
          (f) =>
            f.adapterId?.includes('mobile') ||
            f.adapterId?.includes('react-native') ||
            f.adapterId?.includes('flutter') ||
            f.adapterId?.includes('android') ||
            f.adapterId?.includes('ios')
        ),
      },
      performance: {
        findings: filteredFindings.filter((f) => f.category === 'performance'),
        capacityModel: architecturePayload?.capacityModel,
      },
      reliability: {
        failureModes: architecturePayload?.failureModes,
      },
      priorityRecommendations: {
        p0: filteredFindings.filter((f) => f.status === 'FAIL'),
        p1: filteredFindings.filter((f) => f.status === 'WARNING' && f.severity === 'high'),
        p2: filteredFindings.filter((f) => f.status === 'WARNING' && f.severity !== 'high'),
      },
      evidence: {
        findingsWithEvidence: filteredFindings.filter((f) => f.evidence?.file || f.evidence?.command),
        limitations: Array.from(limitations),
      },
      releaseRecommendation: policyEvaluation,
    },
  };

  // 8. Write reports if outputDir is specified
  if (outputDir) {
    const safeOutDir = assertSafeOutputDir(outputDir);
    if (!fs.existsSync(safeOutDir)) {
      fs.mkdirSync(safeOutDir, { recursive: true });
    }

    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(safeOutDir, 'readiness-report.json');
      fs.writeFileSync(jsonPath, formatJsonReport(report), 'utf8');
      console.log(`Saved JSON readiness report to: ${jsonPath}`);
    }

    if (format === 'markdown' || format === 'both') {
      const mdPath = path.join(safeOutDir, 'readiness-report.md');
      fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf8');
      console.log(`Saved Markdown readiness report to: ${mdPath}`);

      const engMdPath = path.join(safeOutDir, 'engineering-report.md');
      fs.writeFileSync(engMdPath, generateProfessionalEngineeringReport(report), 'utf8');
      console.log(`Saved Professional Engineering report to: ${engMdPath}`);
    }
  }

  return report;
}
