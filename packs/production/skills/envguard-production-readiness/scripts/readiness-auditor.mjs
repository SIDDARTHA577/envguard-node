#!/usr/bin/env node

/**
 * EnvGuard Production Readiness Auditor CLI & Ecosystem Engine.
 * Multi-Platform Evidence-Based Application Production Readiness Analyzer.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  TOOL_VERSION,
  REPORT_SCHEMA_VERSION,
  EXIT_CODES,
  VALID_CATEGORIES,
  VALID_STATUSES,
  VALID_FORMATS,
  IGNORED_DIRECTORIES,
  stripAnsi,
  sanitizeOutput,
  escapeMarkdown,
  assertSafeProjectDir,
  assertSafeOutputDir,
  collectProjectFiles,
  parseYamlFallback,
  isEnvironmentIsolated,
  buildSanitizedEnv,
  runProjectCommand,
  previewExecutionCommands,
  checkGitTracking,
  parseGitignoreRules,
  isPathIgnoredByRules,
  buildInventoryGraph,
  runReadinessAudit,
  BaseAdapter,
  GenericAdapter,
  NodeTypeScriptAdapter,
  NextJsReactAdapter,
  PythonAdapter,
  JavaSpringBootAdapter,
  AdapterRegistry,
  createDefaultRegistry,
  evaluateReleasePolicy,
  POLICY_OUTCOMES,
  formatJsonReport,
  generateMarkdownReport,
} from './readiness/index.mjs';

export {
  TOOL_VERSION,
  REPORT_SCHEMA_VERSION,
  EXIT_CODES,
  VALID_CATEGORIES,
  VALID_STATUSES,
  VALID_FORMATS,
  IGNORED_DIRECTORIES,
  stripAnsi,
  sanitizeOutput,
  escapeMarkdown,
  assertSafeProjectDir,
  assertSafeOutputDir,
  collectProjectFiles,
  parseYamlFallback,
  isEnvironmentIsolated,
  buildSanitizedEnv,
  runProjectCommand,
  previewExecutionCommands,
  checkGitTracking,
  parseGitignoreRules,
  isPathIgnoredByRules,
  buildInventoryGraph,
  runReadinessAudit,
  BaseAdapter,
  GenericAdapter,
  NodeTypeScriptAdapter,
  NextJsReactAdapter,
  PythonAdapter,
  JavaSpringBootAdapter,
  AdapterRegistry,
  createDefaultRegistry,
  evaluateReleasePolicy,
  POLICY_OUTCOMES,
  formatJsonReport,
  generateMarkdownReport,
};

// Backward-compatible individual check wrappers
export function checkProjectDiscovery(projectDir, files, pkg) {
  const adapter = new NodeTypeScriptAdapter();
  return adapter.runStaticChecks({ path: '.', absPath: projectDir, manifest: pkg, type: 'backend', isRoot: true }, { projectDir, files }).filter((f) => f.category === 'discovery');
}

export function checkEnvConfiguration(projectDir, files, pkg) {
  const generic = new GenericAdapter();
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: pkg, type: 'backend', isRoot: true };
  const context = { projectDir, files };
  return [
    ...nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'env' && f.id === 'ENV-001'),
    ...generic.runStaticChecks(target, context).filter((f) => f.category === 'env' && f.id === 'ENV-002'),
    ...nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'env' && f.id === 'ENV-003'),
    ...generic.runStaticChecks(target, context).filter((f) => f.category === 'env' && f.id === 'ENV-004'),
  ];
}

export function checkBuildAndTest(projectDir, pkg, allowExec, timeoutMs, options = {}) {
  const adapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: pkg, type: 'backend', isRoot: true };
  const context = { projectDir, allowExec, timeoutMs, ...options };
  return adapter.runDynamicChecks(target, context, runProjectCommand);
}

export function checkSecurityReadiness(projectDir, files, pkg) {
  const generic = new GenericAdapter();
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: pkg, type: 'backend', isRoot: true };
  const context = { projectDir, files };
  return [
    ...generic.runStaticChecks(target, context).filter((f) => f.category === 'security'),
    ...nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'security'),
  ];
}

export function checkApiReadiness(projectDir, files, allowExec) {
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: null, type: 'backend', isRoot: true };
  const context = { projectDir, files, allowExec };
  return nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'api');
}

export function checkDatabaseReadiness(projectDir, files, pkg) {
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: pkg, type: 'backend', isRoot: true };
  const context = { projectDir, files };
  return nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'database');
}

export function checkDeploymentReadiness(projectDir, files) {
  const generic = new GenericAdapter();
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: projectDir, manifest: null, type: 'backend', isRoot: true };
  const context = { projectDir, files };
  return [
    ...generic.runStaticChecks(target, context).filter((f) => f.category === 'deployment' && f.id === 'DEP-001'),
    ...nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'deployment'),
    ...generic.runStaticChecks(target, context).filter((f) => f.category === 'deployment' && f.id === 'DEP-004'),
  ];
}

export function checkAccessibility(files, pkg) {
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: '.', manifest: pkg, type: 'frontend', isRoot: true };
  const context = { projectDir: '.', files };
  return nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'accessibility');
}

export function checkPerformance(files, pkg) {
  const nodeAdapter = new NodeTypeScriptAdapter();
  const target = { path: '.', absPath: '.', manifest: pkg, type: 'backend', isRoot: true };
  const context = { projectDir: '.', files };
  return nodeAdapter.runStaticChecks(target, context).filter((f) => f.category === 'performance');
}

/**
 * Command-line CLI entry point.
 */
export function main(argv = process.argv.slice(2)) {
  let projectDir = '.';
  let outputDir = null;
  let format = null;
  let categories = [...VALID_CATEGORIES];
  let allowExec = false;
  let trustProject = false;
  let previewCommands = false;
  let execCommands = null;
  let timeoutMs = 10000;
  let sarifPath = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
EnvGuard Readiness Auditor v${TOOL_VERSION}
Evidence-based application production readiness analyzer.

Usage:
  node tools/readiness-auditor.mjs [scan] [options]

Options:
  --project <dir>          Path to project directory (default: current directory)
  --output-dir <dir>       Directory to write assessment reports (JSON and Markdown)
  --format <type>          Output format: "json", "markdown", or "both" (default: "both" if --output-dir, else console)
  --checks <list>          Comma-separated list of check categories to run:
                           discovery, env, build_test, security, api, database, deployment, accessibility, performance
  --allow-exec             Explicitly authorize local project build and test command execution (default: read-only)
  --trust-project          Explicitly acknowledge executing scripts on unisolated host without container containment
  --exec-commands <list>   Comma-separated list of allowed scripts to execute (e.g. "test,build")
  --preview-commands       Preview planned commands and their network/filesystem effects without running them
  --sarif <file>           Path to SARIF report to import static analysis findings (CodeQL, ESLint, Trivy)
  --timeout <ms>           Maximum execution time per command in ms (default: 10000, max: 120000)
  --help, -h               Show this help message

Exit Codes:
  0 - Success (assessment completed with zero policy blockers)
  1 - Tool error (internal unhandled exception)
  2 - Policy blockers exist (one or more BLOCKER/CRITICAL failures)
  3 - Invalid arguments (CLI options error)
  4 - Incomplete execution (critical command timed out or crashed)

Safety Boundaries:
  - Read-only by default. Does NOT run project scripts without --allow-exec.
  - Requires container containment or explicit --trust-project to execute scripts.
  - Minimizes environment variables and redacts secrets from output.
  - Never automatically publishes, deploys, or alters production databases.
`);
      return EXIT_CODES.SUCCESS_NO_BLOCKERS;
    } else if (arg === 'scan') {
      // optional subcommand keyword
    } else if (arg === '--project') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) {
        console.error('Error: Option "--project" requires a directory path.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      projectDir = val;
    } else if (arg === '--output-dir') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) {
        console.error('Error: Option "--output-dir" requires a directory path.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      outputDir = val;
    } else if (arg === '--format') {
      const val = argv[++i]?.toLowerCase();
      if (!val || !VALID_FORMATS.includes(val)) {
        console.error(`Error: Invalid format "${val}". Supported formats: ${VALID_FORMATS.join(', ')}.`);
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      format = val;
    } else if (arg === '--checks') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) {
        console.error('Error: Option "--checks" requires a comma-separated list of categories.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      const specified = val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (specified.length === 0) {
        console.error('Error: Empty check category list provided.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      for (const cat of specified) {
        if (!VALID_CATEGORIES.includes(cat)) {
          console.error(`Error: Invalid check category "${cat}". Valid options: ${VALID_CATEGORIES.join(', ')}.`);
          return EXIT_CODES.INVALID_ARGUMENTS;
        }
      }
      categories = specified;
    } else if (arg === '--allow-exec') {
      allowExec = true;
    } else if (arg === '--trust-project') {
      trustProject = true;
    } else if (arg === '--preview-commands') {
      previewCommands = true;
    } else if (arg === '--sarif') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) {
        console.error('Error: Option "--sarif" requires a file path.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      sarifPath = val;
    } else if (arg === '--exec-commands') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) {
        console.error('Error: Option "--exec-commands" requires a comma-separated list of script names.');
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      execCommands = val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (arg === '--timeout') {
      const val = argv[++i];
      const parsedTimeout = parseInt(val, 10);
      if (Number.isNaN(parsedTimeout) || parsedTimeout < 100 || parsedTimeout > 120000) {
        console.error(`Error: Invalid timeout value "${val}". Must be an integer between 100 and 120000 ms.`);
        return EXIT_CODES.INVALID_ARGUMENTS;
      }
      timeoutMs = parsedTimeout;
    } else {
      console.error(`Error: Unrecognized option "${arg}". Run with --help for valid options.`);
      return EXIT_CODES.INVALID_ARGUMENTS;
    }
  }

  // Validate project path
  let safeProjectDir;
  try {
    safeProjectDir = assertSafeProjectDir(projectDir);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return EXIT_CODES.INVALID_ARGUMENTS;
  }

  // Handle command preview mode
  if (previewCommands) {
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(safeProjectDir, 'package.json'), 'utf8'));
    } catch {}
    const preview = previewExecutionCommands(safeProjectDir, pkg, timeoutMs, { allowExec, trustProject });
    console.log('\n=== EnvGuard Command Execution Preview ===');
    console.log(`Target Project: ${preview.projectDir}`);
    console.log(`Isolation Available: ${preview.isolationAvailable}`);
    console.log(`Execution Mode: ${preview.trustMode}`);
    console.log(`Timeout: ${preview.timeoutMs}ms`);
    console.log('Planned Commands:');
    if (preview.commands.length === 0) {
      console.log('  (None detected in package.json)');
    } else {
      for (const cmd of preview.commands) {
        console.log(`  - ${cmd.command} ${cmd.args.join(' ')}`);
      }
    }
    console.log('\nPotential Effects:');
    console.log(`  Network: ${preview.disclosures.network}`);
    console.log(`  Filesystem: ${preview.disclosures.filesystem}\n`);
    return EXIT_CODES.SUCCESS_NO_BLOCKERS;
  }

  // Validate output directory if provided
  let safeOutputDir = null;
  if (outputDir) {
    try {
      safeOutputDir = assertSafeOutputDir(outputDir);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      return EXIT_CODES.INVALID_ARGUMENTS;
    }
  }

  let report;
  try {
    report = runReadinessAudit({
      projectDir: safeProjectDir,
      categories,
      allowExec,
      trustProject,
      timeoutMs,
      sarifPath,
      allowedCommands: execCommands,
    });
  } catch (err) {
    console.error(`Readiness Audit Error: ${err.message}`);
    return EXIT_CODES.TOOL_ERROR;
  }

  // Generate outputs
  const jsonOutput = JSON.stringify(report, null, 2);
  const mdOutput = generateMarkdownReport(report);

  if (safeOutputDir) {
    try {
      if (!fs.existsSync(safeOutputDir)) {
        fs.mkdirSync(safeOutputDir, { recursive: true });
      }

      const targetFormat = format || 'both';
      if (targetFormat === 'json' || targetFormat === 'both') {
        const jsonFile = path.join(safeOutputDir, 'readiness-report.json');
        fs.writeFileSync(jsonFile, jsonOutput, 'utf8');
        console.log(`Saved JSON readiness report to: ${jsonFile}`);
      }
      if (targetFormat === 'markdown' || targetFormat === 'both') {
        const mdFile = path.join(safeOutputDir, 'readiness-report.md');
        fs.writeFileSync(mdFile, mdOutput, 'utf8');
        console.log(`Saved Markdown readiness report to: ${mdFile}`);
      }
    } catch (err) {
      console.error(`Error writing report files to "${safeOutputDir}": ${err.message}`);
      return EXIT_CODES.TOOL_ERROR;
    }
  } else {
    if (format === 'json') {
      console.log(jsonOutput);
    } else {
      console.log(mdOutput);
    }
  }

  // Check exit codes:
  // Policy blockers (FAIL with critical/high severity) return 2
  const hasBlockers = report.findings.some(
    (f) => f.status === 'FAIL' && (f.severity === 'critical' || f.severity === 'high')
  );
  if (hasBlockers) {
    return EXIT_CODES.POLICY_BLOCKERS;
  }

  // Check for incomplete executions (e.g. timed out)
  const hasTimeouts = report.findings.some((f) => f.status === 'FAIL' && f.title?.includes('Timed Out'));
  if (hasTimeouts) {
    return EXIT_CODES.INCOMPLETE_EXECUTION;
  }

  return EXIT_CODES.SUCCESS_NO_BLOCKERS;
}

// Direct invocation CLI runner
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith('readiness-auditor.mjs') || process.argv[1].endsWith('readiness-auditor'));

if (isDirectCall) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
