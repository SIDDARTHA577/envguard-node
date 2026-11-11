import fs from 'node:fs';
import path from 'node:path';
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
    } catch {}
  }

  // Sensible default keys if none discovered
  if (discovered.size === 0) {
    discovered.add('PORT');
    discovered.add('NODE_ENV');
  }

  return Array.from(discovered).sort();
}

/**
 * Discovers configured test frameworks from project dependencies, files, and configurations.
 * Prevents fabricating passing test stubs.
 *
 * @param {string} projectDir - Base project directory
 * @param {object} [pkg={}] - Parsed package.json object
 * @param {string[]} [files=[]] - Known project-relative file list
 * @returns {{
 *   framework: string|null,
 *   command: string|null,
 *   confidence: 'verified_fact' | 'ambiguous' | 'none',
 *   status: 'RECOMMENDED' | 'MANUAL_REVIEW' | 'NOT_RUN',
 *   recommendation: string
 * }}
 */
export function discoverTestFramework(projectDir, pkg = {}, files = []) {
  const allDeps = {
    ...(pkg.devDependencies || {}),
    ...(pkg.dependencies || {}),
  };

  // Known JavaScript/TypeScript test frameworks in dependencies
  if (allDeps['vitest']) {
    return {
      framework: 'vitest',
      command: 'vitest run',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Vitest as the project test runner with "vitest run".',
    };
  }

  if (allDeps['jest'] || allDeps['ts-jest']) {
    return {
      framework: 'jest',
      command: 'jest',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Jest as the project test runner with "jest".',
    };
  }

  if (allDeps['mocha'] || allDeps['ts-mocha']) {
    return {
      framework: 'mocha',
      command: 'mocha',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Mocha as the project test runner with "mocha".',
    };
  }

  if (allDeps['ava']) {
    return {
      framework: 'ava',
      command: 'ava',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure AVA as the project test runner with "ava".',
    };
  }

  if (allDeps['@playwright/test']) {
    return {
      framework: 'playwright',
      command: 'playwright test',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Playwright as the test runner with "playwright test".',
    };
  }

  if (allDeps['tap'] || allDeps['tape']) {
    return {
      framework: 'tap',
      command: 'tap',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Tap as the project test runner with "tap".',
    };
  }

  // Check config files in project root
  const hasVitestConfig = files.some((f) => f === 'vitest.config.ts' || f === 'vitest.config.js' || f === 'vitest.config.mjs');
  if (hasVitestConfig) {
    return {
      framework: 'vitest',
      command: 'vitest run',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Vitest based on existing vitest.config file.',
    };
  }

  const hasJestConfig = files.some((f) => f === 'jest.config.ts' || f === 'jest.config.js' || f === 'jest.config.json');
  if (hasJestConfig) {
    return {
      framework: 'jest',
      command: 'jest',
      confidence: 'verified_fact',
      status: 'RECOMMENDED',
      recommendation: 'Configure Jest based on existing jest.config file.',
    };
  }

  // Check for test files without a declared framework (ambiguous setup)
  const testFilePatterns = [
    /(?:^|\/)(?:test|tests|__tests__)\/.+\.[cm]?[jt]sx?$/,
    /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  ];
  const matchingTestFiles = files.filter((f) => testFilePatterns.some((p) => p.test(f)));

  if (matchingTestFiles.length > 0) {
    return {
      framework: null,
      command: null,
      confidence: 'ambiguous',
      status: 'MANUAL_REVIEW',
      recommendation: `Found ${matchingTestFiles.length} test file(s) but no recognized test framework in dependencies. Manual engineering review required to configure test script.`,
    };
  }

  // No test framework and no test files
  return {
    framework: null,
    command: null,
    confidence: 'none',
    status: 'NOT_RUN',
    recommendation: 'No automated test suite detected. Install a test framework (such as Vitest or Jest) and implement unit/integration tests before configuring "npm test".',
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
      // Ensure negation rule exists AND comes after the last '.env.*' pattern
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

  // Filter only actionable defect findings (FAIL or WARNING)
  const actionableFindings = findings.filter((f) => f.status === 'FAIL' || f.status === 'WARNING');

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
      } catch {}
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
      } catch {}
    }

    // 3. BUILD-002 / BUILD-001: Missing test script in package.json
    // CRITICAL: Must NEVER generate fake passing test scripts like 'echo "Tests passing" && exit 0'
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

            if (discovery.status === 'RECOMMENDED' && discovery.command) {
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
                description: `Configures verified "test" script using discovered ${discovery.framework} test runner.`,
                framework: discovery.framework,
              });
            }
          }
        }
      } catch {}
    }
  }

  return patches;
}
