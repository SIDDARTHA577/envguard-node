import fs from 'node:fs';
import path from 'node:path';
import {
  collectProjectFiles,
  sanitizeOutput,
  TEST_VERIFICATION_STATES,
} from '../constants.mjs';
import {
  buildInventoryGraph,
  formulateAssessmentPlan,
  runReadinessAudit,
  selectSkillsForProject,
} from '../engine/index.mjs';
import { discoverArchitectureRequirements } from '../architecture/index.mjs';
import {
  executeRemediationWorkflow,
  REMEDIATION_STATUSES,
} from '../remediation/index.mjs';
import {
  compareReadinessReports,
  formatComparisonMarkdown,
  generateProfessionalEngineeringReport,
} from '../reporters/index.mjs';
import {
  DEPLOYMENT_EXECUTION_GUARD,
  evaluateDeploymentGate,
  validateCicdDeploymentGates,
  validateContainerSetup,
  validateKubernetesManifests,
  validateOperationalReliability,
} from '../deployment/index.mjs';
import { runLocalBenchmark } from '../capacity/benchmark-runner.mjs';

export const WORKFLOW_EVIDENCE_CLASSES = {
  VERIFIED: 'VERIFIED',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  NOT_VERIFIED: 'NOT_VERIFIED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};

export const WORKFLOW_MODE_DISCLOSURE = {
  deterministicEngineScope:
    'Architecture discovery, static/dynamic readiness checks, skill routing, safe env/gitignore remediation, report comparison, and deployment gate checks run deterministically via EnvGuard.',
  hostDrivenScope:
    'Application feature code, custom business logic, and architectural refactors are authored by the human engineer or external AI coding-agent host (or injected hook) and never claimed as autonomously verified without post-change tests.',
  autonomousDeploymentAllowed: false,
};

/**
 * Canonical 20-step Senior Engineering Workflow definition.
 */
export const ENGINEERING_WORKFLOW_STEPS = [
  '01_project_discovery',
  '02_requirements_profile',
  '03_skill_catalog_routing',
  '04_assessment_planning',
  '05_baseline_static_audit',
  '06_system_design_evaluation',
  '07_api_and_contract_boundary',
  '08_database_and_persistence_review',
  '09_security_posture_review',
  '10_change_proposal_and_diff',
  '11_human_approval_gate',
  '12_implementation_or_remediation',
  '13_code_quality_and_lint_gate',
  '14_authorized_test_execution',
  '15_performance_and_capacity_check',
  '16_deployment_and_reliability_gate',
  '17_comparative_before_after_verification',
  '18_rollback_safety_check',
  '19_evidence_classification',
  '20_engineering_report_generation',
];

function recordStep(steps, id, status, details) {
  steps.push({ id, status, details });
}

function summarizeCategoryFindings(findings, prefixOrCategory) {
  const matched = findings.filter(
    (f) => f.category === prefixOrCategory || (f.id && f.id.startsWith(prefixOrCategory))
  );
  return {
    total: matched.length,
    pass: matched.filter((f) => f.status === 'PASS').length,
    fail: matched.filter((f) => f.status === 'FAIL').length,
    warning: matched.filter((f) => f.status === 'WARNING').length,
    manualReview: matched.filter((f) => f.status === 'MANUAL_REVIEW').length,
    notRun: matched.filter((f) => f.status === 'NOT_RUN').length,
    findingIds: matched.map((f) => f.id),
  };
}

/**
 * Resolves dynamic test execution status across all target BUILD-002 findings.
 */
function summarizeDynamicTests(findings) {
  const buildTests = findings.filter((f) => f.id === 'BUILD-002');
  const executed = buildTests.some((f) => Boolean(f.evidence?.testExecuted));
  const allPassed =
    buildTests.length > 0 &&
    buildTests.every(
      (f) =>
        f.status === 'PASS' &&
        f.evidence?.verificationState === TEST_VERIFICATION_STATES.TESTS_PASSED &&
        f.evidence?.testExecuted === true
    );
  const anyFailed = buildTests.some(
    (f) =>
      f.status === 'FAIL' ||
      f.evidence?.verificationState === TEST_VERIFICATION_STATES.TESTS_FAILED
  );
  return {
    targetCount: buildTests.length,
    executed,
    allPassed,
    anyFailed,
    states: buildTests.map((f) => ({
      targetPath: f.targetPath || '.',
      status: f.status,
      verificationState: f.evidence?.verificationState || 'UNKNOWN',
    })),
  };
}

/**
 * Executes an integrated 20-step Senior Engineering Workflow on a project directory:
 * discovery -> requirements -> skill routing -> plan -> baseline audit -> design/API/DB/sec review
 * -> change proposal & approval gate -> implementation/remediation -> authorized tests
 * -> optional loopback performance benchmark -> deployment gate -> comparison -> rollback metadata
 * -> evidence classification -> engineering report output.
 *
 * Strictly enforces human approval before applying changes or executing commands,
 * and never triggers autonomous production deployment.
 *
 * @param {object} [options={}]
 * @param {string} [options.projectDir] - Absolute or relative target project root
 * @param {object} [options.requirements={}] - Explicit architecture/product requirements
 * @param {boolean} [options.approveChanges=false] - Human approval to apply changes/remediation
 * @param {boolean} [options.allowExec=false] - Authorized dynamic command execution flag
 * @param {boolean} [options.trustProject=false] - Explicit local trust acknowledgement
 * @param {Function|null} [options.implementationHook=null] - Async/sync callback simulating host/developer edits after approval
 * @param {string|null} [options.benchmarkUrl=null] - Authorized localhost benchmark endpoint
 * @param {object} [options.benchmarkOptions={}] - Safe localhost benchmark configuration
 * @param {string|null} [options.outputDir=null] - Optional report artifact output directory
 * @returns {Promise<object>} Structured 20-step workflow trace, findings, comparison, and reports
 */
export async function runIntegratedEngineeringWorkflow({
  projectDir,
  requirements = {},
  approveChanges = false,
  allowExec = false,
  trustProject = false,
  implementationHook = null,
  benchmarkUrl = null,
  benchmarkOptions = {},
  outputDir = null,
} = {}) {
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('runIntegratedEngineeringWorkflow requires a valid projectDir.');
  }

  const resolvedProjectDir = path.resolve(projectDir);
  if (!fs.existsSync(resolvedProjectDir)) {
    throw new Error(`Project directory does not exist: ${resolvedProjectDir}`);
  }

  const steps = [];
  const canExecuteDynamic = Boolean(allowExec && trustProject);

  // Step 01: Project Discovery
  const inventory = buildInventoryGraph(resolvedProjectDir);
  const files = collectProjectFiles(resolvedProjectDir);
  recordStep(steps, '01_project_discovery', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    applications: (inventory.applications || []).map((a) => ({
      name: a.name,
      type: a.type,
      path: a.path,
    })),
    isMonorepo: Boolean(inventory.repository?.isMonorepo),
    fileCount: files.length,
  });

  // Step 02: Requirements Profile
  const reqProfile = discoverArchitectureRequirements(resolvedProjectDir, requirements);
  recordStep(steps, '02_requirements_profile', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    teamSize: reqProfile.requirements?.teamSize || 'unspecified',
    availability: reqProfile.requirements?.availability?.level || 'standard',
    sourceCount: Object.keys(reqProfile.provenance || {}).length,
  });

  // Step 03: Skill Catalog Routing
  const skillSelection = selectSkillsForProject(inventory, files);
  recordStep(
    steps,
    '03_skill_catalog_routing',
    WORKFLOW_EVIDENCE_CLASSES.VERIFIED,
    {
      selectedCount: skillSelection.selectedSkills.length,
      executionSequence: skillSelection.executionSequence,
    }
  );

  // Step 04: Assessment Plan Formulation
  const plan = formulateAssessmentPlan({
    projectDir: resolvedProjectDir,
    inventory,
    files,
    allowExec: canExecuteDynamic,
    trustProject,
  });
  recordStep(steps, '04_assessment_planning', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    phaseCount: plan?.phases ? Object.keys(plan.phases).length : 0,
    dynamicAuthorized: canExecuteDynamic,
    plannedCommandsCount: plan?.phases?.dynamicExecution?.plannedCommands?.length || 0,
  });

  // Step 05: Baseline Read-Only Audit + Architecture Analysis
  const baselineReport = runReadinessAudit({
    projectDir: resolvedProjectDir,
    allowExec: false,
    trustProject: false,
    includeArchitecture: true,
    architectureRequirements: reqProfile.requirements || requirements,
  });
  recordStep(steps, '05_baseline_static_audit', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    outcome: baselineReport.policyEvaluation?.outcome || 'UNKNOWN',
    summary: baselineReport.summary,
  });

  // Step 06: System Design Evaluation
  const arch = baselineReport.architecture || {};
  recordStep(steps, '06_system_design_evaluation', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    topologyType: arch.inventory?.topologyType || 'unknown',
    conceptCount: Array.isArray(arch.evaluations) ? arch.evaluations.length : 0,
    adrCount: Array.isArray(arch.adrs) ? arch.adrs.length : 0,
    failureModeCount: Array.isArray(arch.failureModes) ? arch.failureModes.length : 0,
  });

  // Step 07: API & Contract Boundary Review
  const baselineApiSummary = summarizeCategoryFindings(baselineReport.findings, 'api');
  recordStep(
    steps,
    '07_api_and_contract_boundary',
    baselineApiSummary.total > 0
      ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
      : WORKFLOW_EVIDENCE_CLASSES.NOT_APPLICABLE,
    baselineApiSummary
  );

  // Step 08: Database & Persistence Review
  const baselineDbSummary = summarizeCategoryFindings(baselineReport.findings, 'database');
  recordStep(
    steps,
    '08_database_and_persistence_review',
    baselineDbSummary.total > 0
      ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
      : WORKFLOW_EVIDENCE_CLASSES.NOT_APPLICABLE,
    baselineDbSummary
  );

  // Step 09: Security Posture Review
  const baselineSecSummary = {
    security: summarizeCategoryFindings(baselineReport.findings, 'security'),
    env: summarizeCategoryFindings(baselineReport.findings, 'env'),
  };
  recordStep(steps, '09_security_posture_review', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, baselineSecSummary);

  // Step 10: Change Proposal & Diff Preview (Dry-Run Only)
  const proposedRemediation = executeRemediationWorkflow({
    projectDir: resolvedProjectDir,
    applyFix: false,
  });
  recordStep(steps, '10_change_proposal_and_diff', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    status: proposedRemediation.status,
    patchCount: proposedRemediation.patches?.length || 0,
    proposedFiles: (proposedRemediation.patches || []).map((p) => p.targetFile),
  });

  // Step 11: Human Approval Gate
  recordStep(
    steps,
    '11_human_approval_gate',
    approveChanges ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED : WORKFLOW_EVIDENCE_CLASSES.PARTIALLY_VERIFIED,
    {
      approvedToApplyChanges: Boolean(approveChanges),
      authorizedToExecuteCommands: canExecuteDynamic,
      gateBehavior: approveChanges ? 'CHANGES_APPROVED' : 'DRY_RUN_ONLY_NO_MUTATIONS',
    }
  );

  // Optional baseline benchmark before implementation if URL provided
  let beforeBenchmark = null;
  if (benchmarkUrl) {
    beforeBenchmark = await runLocalBenchmark({
      targetUrl: benchmarkUrl,
      durationMs: 400,
      concurrency: 3,
      ...benchmarkOptions,
    });
  }

  // Step 12: Implementation Hook (Host/Developer) & Safe Remediation
  let implementationSummary = { invoked: false, mode: 'none', modifiedFiles: [] };
  let appliedRemediation = null;

  if (approveChanges) {
    if (typeof implementationHook === 'function') {
      const hookResult = await implementationHook({
        projectDir: resolvedProjectDir,
        inventory,
        baselineReport,
        selectedSkills: skillSelection.executionSequence,
      });
      implementationSummary = {
        invoked: true,
        mode: 'host_or_developer_hook',
        modifiedFiles: Array.isArray(hookResult?.modifiedFiles) ? hookResult.modifiedFiles : [],
        notes: typeof hookResult?.notes === 'string' ? sanitizeOutput(hookResult.notes) : undefined,
      };
    }

    appliedRemediation = executeRemediationWorkflow({
      projectDir: resolvedProjectDir,
      applyFix: true,
      allowExec: canExecuteDynamic,
      trustProject,
    });
  }

  recordStep(
    steps,
    '12_implementation_or_remediation',
    approveChanges ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED : WORKFLOW_EVIDENCE_CLASSES.NOT_VERIFIED,
    {
      implementationHook: implementationSummary,
      remediationStatus: appliedRemediation?.status || REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL,
      patchesApplied: appliedRemediation?.checkpoint ? appliedRemediation.patches?.length || 0 : 0,
    }
  );

  // Step 13 & Step 14: Post-Change Build/Lint Check & Authorized Test Execution
  const postFiles = collectProjectFiles(resolvedProjectDir);
  const followUpReport = runReadinessAudit({
    projectDir: resolvedProjectDir,
    allowExec: canExecuteDynamic,
    trustProject,
    includeArchitecture: true,
    architectureRequirements: reqProfile.requirements || requirements,
  });

  const buildLintSummary = summarizeCategoryFindings(followUpReport.findings, 'build');
  const dynamicTests = summarizeDynamicTests(followUpReport.findings);

  recordStep(
    steps,
    '13_code_quality_and_lint_gate',
    canExecuteDynamic ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED : WORKFLOW_EVIDENCE_CLASSES.PARTIALLY_VERIFIED,
    buildLintSummary
  );

  recordStep(
    steps,
    '14_authorized_test_execution',
    dynamicTests.executed
      ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
      : WORKFLOW_EVIDENCE_CLASSES.NOT_VERIFIED,
    dynamicTests
  );

  // Step 15: Performance & Capacity Check (Optional Authorized Loopback Benchmark)
  let afterBenchmark = null;
  if (benchmarkUrl && approveChanges) {
    afterBenchmark = await runLocalBenchmark({
      targetUrl: benchmarkUrl,
      durationMs: 400,
      concurrency: 3,
      ...benchmarkOptions,
    });
  }

  const benchmarkDelta =
    beforeBenchmark && afterBenchmark
      ? {
          beforeP95Ms: beforeBenchmark.latency?.p95 ?? null,
          afterP95Ms: afterBenchmark.latency?.p95 ?? null,
          beforeRps: beforeBenchmark.throughputRps ?? null,
          afterRps: afterBenchmark.throughputRps ?? null,
          beforeErrorRate: beforeBenchmark.errorRatePercent ?? null,
          afterErrorRate: afterBenchmark.errorRatePercent ?? null,
        }
      : null;

  recordStep(
    steps,
    '15_performance_and_capacity_check',
    afterBenchmark || beforeBenchmark
      ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
      : WORKFLOW_EVIDENCE_CLASSES.PARTIALLY_VERIFIED,
    {
      hypothetical10kModelGenerated: Boolean(arch.capacityModel?.hypothetical10kScenario),
      liveLoopbackBenchmarkExecuted: Boolean(beforeBenchmark || afterBenchmark),
      beforeBenchmark,
      afterBenchmark,
      benchmarkDelta,
    }
  );

  // Step 16: Deployment & Operational Reliability Gate (Always Non-Deploying)
  const deploymentFindings = [
    ...validateContainerSetup(resolvedProjectDir, postFiles),
    ...validateKubernetesManifests(resolvedProjectDir, postFiles),
    ...validateCicdDeploymentGates(resolvedProjectDir, postFiles),
    ...validateOperationalReliability(resolvedProjectDir, postFiles, inventory),
  ];
  const deploymentGate = evaluateDeploymentGate({
    deploymentFindings,
    policyFindings: followUpReport.findings,
  });
  recordStep(steps, '16_deployment_and_reliability_gate', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    verdict: deploymentGate.verdict,
    blockerCount: deploymentGate.summary?.blockersCount ?? deploymentGate.blockers?.length ?? 0,
    missingPrerequisites: deploymentGate.missingPrerequisites || [],
    executionGuard: DEPLOYMENT_EXECUTION_GUARD,
  });

  // Step 17: Comparative Before vs After Verification
  const comparison = compareReadinessReports(baselineReport, followUpReport);
  recordStep(steps, '17_comparative_before_after_verification', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    statusTransition: comparison.statusTransition,
    summaryDelta: comparison.summaryDelta,
    resolvedCount: comparison.resolvedFindings.length,
    regressedCount: comparison.regressedFindings.length,
    newFindingsCount: comparison.newFindings.length,
  });

  // Step 18: Rollback Safety Check
  const checkpoint = appliedRemediation?.checkpoint || null;
  recordStep(
    steps,
    '18_rollback_safety_check',
    checkpoint ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED : WORKFLOW_EVIDENCE_CLASSES.NOT_APPLICABLE,
    checkpoint
      ? {
          checkpointAvailable: true,
          checkpointId: checkpoint.id,
          manifestHash: checkpoint.manifestHash || null,
        }
      : {
          checkpointAvailable: false,
          reason: approveChanges ? 'No automatic EnvGuard patch files were required.' : 'Dry-run mode only.',
        }
  );

  // Step 19: Evidence Classification & Honest Disclosure
  const evidenceClassification = {
    staticAudit: WORKFLOW_EVIDENCE_CLASSES.VERIFIED,
    architectureInventory: WORKFLOW_EVIDENCE_CLASSES.VERIFIED,
    dynamicTests: dynamicTests.executed
      ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
      : WORKFLOW_EVIDENCE_CLASSES.NOT_VERIFIED,
    performanceBenchmark:
      beforeBenchmark && afterBenchmark
        ? WORKFLOW_EVIDENCE_CLASSES.VERIFIED
        : WORKFLOW_EVIDENCE_CLASSES.NOT_VERIFIED,
    autonomousProductionDeploy: WORKFLOW_EVIDENCE_CLASSES.NOT_APPLICABLE,
    disclosure: WORKFLOW_MODE_DISCLOSURE,
  };
  recordStep(steps, '19_evidence_classification', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, evidenceClassification);

  // Step 20: Engineering Report & Artifact Emission
  const engineeringReportMarkdown = generateProfessionalEngineeringReport(followUpReport);
  const comparisonMarkdown = formatComparisonMarkdown(comparison);

  const writtenArtifacts = [];
  if (outputDir) {
    const resolvedOutputDir = path.resolve(outputDir);
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
    const engPath = path.join(resolvedOutputDir, 'engineering-report.md');
    const cmpPath = path.join(resolvedOutputDir, 'readiness-comparison.md');
    fs.writeFileSync(engPath, engineeringReportMarkdown, 'utf8');
    fs.writeFileSync(cmpPath, comparisonMarkdown, 'utf8');
    writtenArtifacts.push(engPath, cmpPath);
  }

  recordStep(steps, '20_engineering_report_generation', WORKFLOW_EVIDENCE_CLASSES.VERIFIED, {
    engineeringReportBytes: Buffer.byteLength(engineeringReportMarkdown, 'utf8'),
    comparisonReportBytes: Buffer.byteLength(comparisonMarkdown, 'utf8'),
    writtenArtifacts,
  });

  return {
    projectRoot: resolvedProjectDir,
    steps,
    stepCount: steps.length,
    skillSelection,
    plan,
    requirementsProfile: reqProfile,
    baselineReport,
    followUpReport,
    comparison,
    deploymentGate,
    dynamicTests,
    beforeBenchmark,
    afterBenchmark,
    benchmarkDelta,
    checkpoint,
    evidenceClassification,
    reports: {
      engineeringReportMarkdown,
      comparisonMarkdown,
      writtenArtifacts,
    },
  };
}
