import path from 'node:path';
import { TEST_VERIFICATION_STATES } from '../constants.mjs';
import { generateUnifiedDiff } from './diff-viewer.mjs';
import {
  assertSafeProjectRelativePathDetails,
  computeSha256,
  lstatSafe,
  safeReadFileBufferSync,
} from './checkpoint-manager.mjs';

/**
 * Discovers referenced environment variable keys from project source files.
 *
 * @param {string} projectDir
 * @param {string[]} [files=[]]
 * @returns {string[]} Discovered variable names
 */
export function discoverEnvVarNames(projectDir, files = []) {
  const discovered = new Set();
  const scanExtensions = ['.js', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.java'];

  const candidateFiles = files.filter((f) => scanExtensions.some((ext) => f.endsWith(ext)));

  for (const relFile of candidateFiles) {
    try {
      const { resolvedTarget } = assertSafeProjectRelativePathDetails(projectDir, relFile);
      const { buffer } = safeReadFileBufferSync(resolvedTarget);
      const content = buffer.toString('utf8');

      // JS / TS / Node regex
      const jsMatches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
      for (const m of jsMatches) {
        if (m[1]) discovered.add(m[1]);
      }

      // Vite / frontend regex
      const viteMatches = content.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g);
      for (const m of viteMatches) {
        if (m[1]) discovered.add(m[1]);
      }

      // Python os.environ regex
      const pyMatches = content.matchAll(/os\.(?:environ\.get|environ\[)['"]([A-Z0-9_]+)['"]/g);
      for (const m of pyMatches) {
        if (m[1]) discovered.add(m[1]);
      }
    } catch {
      /* Ignore unreadable or escaped candidate files during key discovery */
    }
  }

  // Sensible default keys if none discovered
  if (discovered.size === 0) {
    discovered.add('PORT');
    discovered.add('NODE_ENV');
  }

  return Array.from(discovered).sort();
}

/**
 * Checks whether a local test runner package or binary appears installed inside node_modules.
 *
 * @param {string} projectDir
 * @param {string|null} pkgName
 * @returns {boolean}
 */
function checkRunnerInstalledOnDisk(projectDir, pkgName) {
  if (!pkgName || !projectDir) return false;
  try {
    const resolvedDir = path.resolve(projectDir);
    const binPath = path.join(resolvedDir, 'node_modules', '.bin', pkgName);
    const pkgJsonPath = path.join(resolvedDir, 'node_modules', pkgName, 'package.json');
    const winBinPath = `${binPath}.cmd`;
    return Boolean(lstatSafe(binPath) || lstatSafe(winBinPath) || lstatSafe(pkgJsonPath));
  } catch {
    return false;
  }
}

/**
 * Discovers configured test frameworks, installed runner availability, and actual test files.
 * Strictly separates dependency declaration from test existence and runtime execution.
 * Never classifies static discovery as TESTS_PASSED or TEST_EXECUTED.
 *
 * @param {string} projectDir - Base project directory
 * @param {object} [pkg={}] - Parsed package.json object
 * @param {string[]} [files=[]] - Known project-relative file list
 * @returns {{
 *   framework: string|null,
 *   command: string|null,
 *   frameworkDeclared: boolean,
 *   runnerAvailable: boolean,
 *   testFilesFound: boolean,
 *   testFilesCount: number,
 *   sampleTestFiles: string[],
 *   testExecuted: boolean,
 *   states: string[],
 *   verificationState: string,
 *   confidence: 'verified_fact' | 'ambiguous' | 'none',
 *   status: 'RECOMMENDED' | 'MANUAL_REVIEW' | 'NOT_RUN',
 *   recommendation: string,
 *   limitations: string[]
 * }}
 */
export function discoverTestFramework(projectDir, pkg = {}, files = []) {
  const allDeps = {
    ...(pkg.devDependencies || {}),
    ...(pkg.dependencies || {}),
  };

  let framework = null;
  let pkgName = null;
  let command = null;

  if (allDeps['vitest']) {
    framework = 'vitest';
    pkgName = 'vitest';
    command = 'vitest run';
  } else if (allDeps['jest'] || allDeps['ts-jest']) {
    framework = 'jest';
    pkgName = allDeps['jest'] ? 'jest' : 'ts-jest';
    command = 'jest';
  } else if (allDeps['mocha'] || allDeps['ts-mocha']) {
    framework = 'mocha';
    pkgName = allDeps['mocha'] ? 'mocha' : 'ts-mocha';
    command = 'mocha';
  } else if (allDeps['ava']) {
    framework = 'ava';
    pkgName = 'ava';
    command = 'ava';
  } else if (allDeps['@playwright/test']) {
    framework = 'playwright';
    pkgName = '@playwright/test';
    command = 'playwright test';
  } else if (allDeps['tap'] || allDeps['tape']) {
    framework = allDeps['tap'] ? 'tap' : 'tape';
    pkgName = framework;
    command = framework;
  } else if (files.some((f) => f === 'vitest.config.ts' || f === 'vitest.config.js' || f === 'vitest.config.mjs')) {
    framework = 'vitest';
    pkgName = 'vitest';
    command = 'vitest run';
  } else if (files.some((f) => f === 'jest.config.ts' || f === 'jest.config.js' || f === 'jest.config.json')) {
    framework = 'jest';
    pkgName = 'jest';
    command = 'jest';
  }

  const frameworkDeclared = Boolean(framework);
  const runnerAvailable = frameworkDeclared ? checkRunnerInstalledOnDisk(projectDir, pkgName) : false;

  const testFilePatterns = [
    /(?:^|\/)(?:test|tests|__tests__|spec|specs)\/.+\.[cm]?[jt]sx?$/,
    /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  ];
  const matchingTestFiles = files.filter((f) => testFilePatterns.some((p) => p.test(f)));
  const testFilesFound = matchingTestFiles.length > 0;

  const states = [];
  if (frameworkDeclared) states.push(TEST_VERIFICATION_STATES.FRAMEWORK_DECLARED);
  if (runnerAvailable) states.push(TEST_VERIFICATION_STATES.RUNNER_AVAILABLE);
  if (testFilesFound) states.push(TEST_VERIFICATION_STATES.TEST_FILES_FOUND);

  const limitations = [
    'Static discovery never classifies tests as TEST_EXECUTED or TESTS_PASSED; runtime verification requires --allow-exec.',
  ];

  if (frameworkDeclared && !testFilesFound) {
    limitations.push(
      `Dependency or config for "${framework}" was detected, but zero test files were discovered in the repository.`
    );
  }
  if (frameworkDeclared && !runnerAvailable) {
    limitations.push(
      `Runner "${pkgName}" is declared in configuration, but local installation was not found under node_modules/.`
    );
  }

  if (frameworkDeclared && testFilesFound) {
    states.push(TEST_VERIFICATION_STATES.NOT_RUN);
    return {
      framework,
      command,
      frameworkDeclared,
      runnerAvailable,
      testFilesFound,
      testFilesCount: matchingTestFiles.length,
      sampleTestFiles: matchingTestFiles.slice(0, 5),
      testExecuted: false,
      states,
      verificationState: TEST_VERIFICATION_STATES.NOT_RUN,
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: `Configure "${framework}" test script ("${command}") and authorize execution (--allow-exec) to verify ${matchingTestFiles.length} test file(s).`,
      limitations,
    };
  }

  if (frameworkDeclared && !testFilesFound) {
    states.push(TEST_VERIFICATION_STATES.MANUAL_REVIEW);
    return {
      framework,
      command: null,
      frameworkDeclared,
      runnerAvailable,
      testFilesFound: false,
      testFilesCount: 0,
      sampleTestFiles: [],
      testExecuted: false,
      states,
      verificationState: TEST_VERIFICATION_STATES.MANUAL_REVIEW,
      confidence: 'ambiguous',
      status: 'MANUAL_REVIEW',
      recommendation: `Framework "${framework}" is declared in dependencies, but zero test files were found. Add real unit/integration tests before treating test configuration as complete.`,
      limitations,
    };
  }

  if (!frameworkDeclared && testFilesFound) {
    states.push(TEST_VERIFICATION_STATES.MANUAL_REVIEW);
    return {
      framework: null,
      command: null,
      frameworkDeclared: false,
      runnerAvailable: false,
      testFilesFound: true,
      testFilesCount: matchingTestFiles.length,
      sampleTestFiles: matchingTestFiles.slice(0, 5),
      testExecuted: false,
      states,
      verificationState: TEST_VERIFICATION_STATES.MANUAL_REVIEW,
      confidence: 'ambiguous',
      status: 'MANUAL_REVIEW',
      recommendation: `Found ${matchingTestFiles.length} test file(s) but no recognized test framework in dependencies. Manual engineering review required to configure test script.`,
      limitations,
    };
  }

  states.push(TEST_VERIFICATION_STATES.NOT_RUN);
  return {
    framework: null,
    command: null,
    frameworkDeclared: false,
    runnerAvailable: false,
    testFilesFound: false,
    testFilesCount: 0,
    sampleTestFiles: [],
    testExecuted: false,
    states,
    verificationState: TEST_VERIFICATION_STATES.NOT_RUN,
    confidence: 'none',
    status: 'NOT_RUN',
    recommendation:
      'No automated test suite detected. Install a test framework (such as Vitest or Jest) and implement unit/integration tests before configuring "npm test".',
    limitations,
  };
}

/**
 * Formulates an updated .gitignore body that excludes secret files and EnvGuard runtime dirs
 * while explicitly permitting .env.example templates and preserving existing rules.
 *
 * @param {string|null} currentContent
 * @param {boolean} hasNodeProject
 * @returns {string} Updated .gitignore content
 */
export function buildSafeGitignoreContent(currentContent, hasNodeProject = false) {
  const existingLines = (currentContent || '')
    .split(/\r?\n/)
    .map((line) => line.trim());

  const rulesToEnsure = [
    '.env',
    '.env.*',
    '!.env.example',
    '*.key',
    '.envguard/backups/',
    '.envguard/checkpoints/',
    '.envguard/reports/',
    '.envguard/cache/',
  ];

  if (hasNodeProject) {
    const hasNodeModules = existingLines.some((l) => l === 'node_modules' || l === 'node_modules/' || l === '/node_modules/');
    if (!hasNodeModules) {
      rulesToEnsure.push('node_modules/');
    }
  }

  const missingRules = [];
  const lastEnvGlobIdx = existingLines.lastIndexOf('.env.*');
  const lastExampleNegIdx = existingLines.lastIndexOf('!.env.example');

  for (const rule of rulesToEnsure) {
    if (rule === '!.env.example') {
      const willAppendEnvGlob = missingRules.includes('.env.*');
      if (lastExampleNegIdx === -1 || lastEnvGlobIdx > lastExampleNegIdx || willAppendEnvGlob) {
        missingRules.push('!.env.example');
      }
    } else if (!existingLines.includes(rule)) {
      missingRules.push(rule);
    }
  }

  if (missingRules.length === 0 && currentContent !== null) {
    return currentContent;
  }

  const blockLines = [
    '',
    '# EnvGuard: Exclude sensitive environment secrets, credentials, and runtime artifacts',
    '# Note: Adding rules to .gitignore does not remove already-tracked secrets from Git history.',
    ...missingRules,
    '',
  ];

  const rulesBlock = blockLines.join('\n');
  if (currentContent !== null) {
    return currentContent.trimEnd() + '\n' + rulesBlock;
  }
  return rulesBlock.trimStart();
}

/**
 * Resolves safe target file path for a finding.
 *
 * @param {string} projectDir
 * @param {string} targetPath
 * @param {string} filename
 * @returns {{ normalizedRelPath: string, resolvedTarget: string }}
 */
function resolveSafeFindingTarget(projectDir, targetPath, filename) {
  const baseSubdir = (!targetPath || targetPath === '.') ? '' : targetPath;
  const combined = baseSubdir ? path.posix.join(baseSubdir.replace(/\\/g, '/'), filename) : filename;
  const details = assertSafeProjectRelativePathDetails(projectDir, combined);
  return {
    normalizedRelPath: details.normalizedRelPath,
    resolvedTarget: details.resolvedTarget,
  };
}

/**
 * Generates safe, reviewable remediation patches for actionable assessment findings.
 * Captures baseline hashes on every patch to protect against concurrent edits.
 *
 * @param {string} projectDir - Target application directory
 * @param {Array<object>} findings - Assessment findings from runReadinessAudit()
 * @param {string[]} [files=[]] - Project relative files
 * @returns {Array<object>} List of structured RemediationPatches
 */
export function generateRemediationPatches(projectDir, findings = [], files = []) {
  const patches = [];
  const hasNodeProject = files.some((f) => f === 'package.json' || f.endsWith('/package.json'));

  const actionableFindings = findings.filter(
    (f) =>
      f.status === 'FAIL' ||
      f.status === 'WARNING' ||
      ((f.id === 'BUILD-002' || f.id === 'BUILD-001') && (f.status === 'NOT_RUN' || f.status === 'MANUAL_REVIEW'))
  );

  for (const f of actionableFindings) {
    // 1. ENV-001: Missing .env.example template
    if (f.id === 'ENV-001') {
      try {
        const { normalizedRelPath, resolvedTarget } = resolveSafeFindingTarget(projectDir, f.targetPath, '.env.example');

        if (!lstatSafe(resolvedTarget)) {
          const envKeys = discoverEnvVarNames(projectDir, files);
          let proposed = '# Generated by EnvGuard Remediation Engine\n';
          for (const key of envKeys) {
            if (key === 'PORT') proposed += 'PORT=3000\n';
            else if (key === 'NODE_ENV') proposed += 'NODE_ENV=development\n';
            else if (key.includes('URL') || key.includes('URI')) proposed += `${key}=postgres://localhost:5432/db_dev\n`;
            else if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
              proposed += `${key}=your_${key.toLowerCase()}_here\n`;
            } else {
              proposed += `${key}=example_value\n`;
            }
          }

          patches.push({
            patchId: `PATCH-${f.id}-CREATE-TEMPLATE`,
            findingId: f.id,
            title: 'Generate Environment Variable Template (.env.example)',
            targetFile: normalizedRelPath,
            action: 'create',
            currentContent: null,
            expectedExisted: false,
            expectedOriginalHash: null,
            proposedContent: proposed,
            unifiedDiff: generateUnifiedDiff(normalizedRelPath, null, proposed),
            description: `Creates documented .env.example with ${envKeys.length} discovered keys using safe non-secret dummy values.`,
          });
        }
      } catch {
        /* Ignore finding with invalid/unsafe target path */
      }
    }

    // 2. ENV-002: Secret files not excluded in .gitignore
    if (f.id === 'ENV-002') {
      try {
        const { normalizedRelPath, resolvedTarget } = resolveSafeFindingTarget(projectDir, f.targetPath, '.gitignore');

        let current = null;
        let expectedOriginalHash = null;
        const st = lstatSafe(resolvedTarget);
        const exists = Boolean(st);

        if (exists) {
          const { buffer } = safeReadFileBufferSync(resolvedTarget);
          current = buffer.toString('utf8');
          expectedOriginalHash = computeSha256(buffer);
        }

        const proposed = buildSafeGitignoreContent(current, hasNodeProject);
        if (proposed !== current) {
          patches.push({
            patchId: `PATCH-${f.id}-UPDATE-GITIGNORE`,
            findingId: f.id,
            title: 'Add Environment Secret Exclusions to .gitignore',
            targetFile: normalizedRelPath,
            action: exists ? 'modify' : 'create',
            currentContent: current,
            expectedExisted: exists,
            expectedOriginalHash,
            proposedContent: proposed,
            unifiedDiff: generateUnifiedDiff(normalizedRelPath, current, proposed),
            description:
              'Excludes .env, .env.* (while permitting !.env.example), *.key, and .envguard/ runtime dirs. Note: does not remove already-tracked secrets from Git history.',
          });
        }
      } catch {
        /* Ignore finding with invalid/unsafe target path */
      }
    }

    // 3. BUILD-002 / BUILD-001: Missing test script in package.json
    // CRITICAL: Must NEVER generate fake passing test scripts or assume tests exist without test files
    if (f.id === 'BUILD-002' || (f.id === 'BUILD-001' && f.explanation?.includes('test'))) {
      try {
        const { normalizedRelPath, resolvedTarget } = resolveSafeFindingTarget(projectDir, f.targetPath, 'package.json');

        if (lstatSafe(resolvedTarget)) {
          const { buffer } = safeReadFileBufferSync(resolvedTarget);
          const current = buffer.toString('utf8');
          const expectedOriginalHash = computeSha256(buffer);
          const pkg = JSON.parse(current);
          pkg.scripts = pkg.scripts || {};

          const currentTestScript = pkg.scripts.test;
          const isMissingOrPlaceholder =
            !currentTestScript ||
            currentTestScript.includes('no test specified') ||
            currentTestScript.includes('echo "Tests passing"');

          if (isMissingOrPlaceholder) {
            const discovery = discoverTestFramework(projectDir, pkg, files);

            if (discovery.status === 'RECOMMENDED' && discovery.command && discovery.testFilesFound) {
              pkg.scripts.test = discovery.command;
              const proposed = JSON.stringify(pkg, null, 2) + '\n';

              patches.push({
                patchId: `PATCH-${f.id}-ADD-VERIFIED-TEST-SCRIPT`,
                findingId: f.id,
                title: `Configure Verified Test Script (${discovery.framework}) in package.json`,
                targetFile: normalizedRelPath,
                action: 'modify',
                currentContent: current,
                expectedExisted: true,
                expectedOriginalHash,
                proposedContent: proposed,
                unifiedDiff: generateUnifiedDiff(normalizedRelPath, current, proposed),
                description: `Configures verified "test" script using discovered ${discovery.framework} runner for ${discovery.testFilesCount} test file(s).`,
                framework: discovery.framework,
                testDiscovery: discovery,
              });
            }
          }
        }
      } catch {
        /* Ignore unreadable package.json or invalid target path */
      }
    }
  }

  return patches;
}
