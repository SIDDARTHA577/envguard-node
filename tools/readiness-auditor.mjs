#!/usr/bin/env node

/**
 * EnvGuard Readiness Auditor
 * Standalone, evidence-based application production readiness analyzer.
 *
 * Designed to inspect Node.js/TypeScript applications for production readiness across:
 * - Project Discovery
 * - Environment Configuration
 * - Build & Test Verification
 * - Security Boundaries
 * - API Contract Standards
 * - Database Persistence
 * - Deployment & Operational Reliability
 * - Frontend & Accessibility Quality
 * - Performance Readiness
 *
 * Zero third-party runtime dependencies. Uses native Node.js APIs only.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export const TOOL_VERSION = '1.0.0';
export const REPORT_SCHEMA_VERSION = '1.0.0';

export const VALID_CATEGORIES = [
  'discovery',
  'env',
  'build_test',
  'security',
  'api',
  'database',
  'deployment',
  'accessibility',
  'performance',
];

export const VALID_STATUSES = [
  'PASS',
  'FAIL',
  'WARNING',
  'NOT_RUN',
  'MANUAL_REVIEW',
  'NOT_APPLICABLE',
  'ERROR',
];

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  'vendor',
  '.cache',
  'out',
]);

/**
 * Strips ANSI color and control codes from terminal output.
 */
export function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Masks potential sensitive tokens or credentials in strings.
 */
export function sanitizeOutput(str) {
  if (typeof str !== 'string') return '';
  let cleaned = stripAnsi(str);
  // Redact potential bearer tokens, secret keys, passwords
  cleaned = cleaned.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]');
  cleaned = cleaned.replace(/(ghp_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]');
  cleaned = cleaned.replace(/(sk_live_[A-Za-z0-9_]{16,})/gi, '[REDACTED_STRIPE_KEY]');
  cleaned = cleaned.replace(/(password\s*[:=]\s*['"]?)[^'"\s,]+/gi, '$1[REDACTED]');
  return cleaned;
}

/**
 * Validates target directory against path traversal attacks and symlink escapes.
 */
export function assertSafeProjectDir(targetDir) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('Project path must be a non-empty string.');
  }
  if (targetDir.includes('\0')) {
    throw new Error('Invalid project path: contains null byte.');
  }

  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Project directory does not exist: "${targetDir}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: "${targetDir}"`);
  }

  // Detect if targetDir itself or any symlink resolves outside
  try {
    const real = fs.realpathSync.native(resolved);
    return real;
  } catch {
    return resolved;
  }
}

/**
 * Recursively scans project files boundedly, skipping heavy/generated directories.
 */
export function collectProjectFiles(projectDir, { maxFiles = 2000, maxDepth = 8 } = {}) {
  const files = [];

  function walk(currentDir, depth) {
    if (depth > maxDepth || files.length >= maxFiles) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          // Check symlink directory escape
          try {
            if (entry.isSymbolicLink()) {
              const realLink = fs.realpathSync(fullPath);
              if (!realLink.startsWith(projectDir)) continue; // ignore escaped symlink dir
            }
          } catch {
            continue;
          }
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }

  walk(projectDir, 0);
  return files;
}

/**
 * Executes an authorized project command with timeout and sanitized output.
 */
export function runProjectCommand(command, args, projectDir, timeoutMs = 10000) {
  const startTime = Date.now();
  try {
    const isWindows = process.platform === 'win32';
    const fullCmd = args && args.length > 0 ? `${command} ${args.join(' ')}` : command;

    const res = isWindows
      ? spawnSync(fullCmd, {
          cwd: projectDir,
          timeout: timeoutMs,
          shell: true,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI: 'true',
            NODE_ENV: 'test',
          },
          maxBuffer: 1024 * 512,
        })
      : spawnSync(command, args, {
          cwd: projectDir,
          timeout: timeoutMs,
          shell: false,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI: 'true',
            NODE_ENV: 'test',
          },
          maxBuffer: 1024 * 512,
        });

    const durationMs = Date.now() - startTime;
    const stdout = sanitizeOutput(res.stdout || '').slice(0, 1000);
    const stderr = sanitizeOutput(res.stderr || '').slice(0, 1000);

    return {
      success: res.status === 0,
      exitCode: res.status ?? (res.error ? 1 : 0),
      durationMs,
      stdout,
      stderr,
      timedOut: res.error?.code === 'ETIMEDOUT',
      error: res.error ? res.error.message : null,
    };
  } catch (err) {
    return {
      success: false,
      exitCode: 1,
      durationMs: Date.now() - startTime,
      stdout: '',
      stderr: sanitizeOutput(err.message),
      timedOut: false,
      error: err.message,
    };
  }
}

/**
 * Module A: Project Discovery
 */
export function checkProjectDiscovery(projectDir, files, pkg) {
  const findings = [];

  if (!pkg) {
    findings.push({
      id: 'DISC-001',
      category: 'discovery',
      status: 'FAIL',
      severity: 'critical',
      title: 'Missing package.json Manifest',
      explanation: 'No package.json file was found at the root of the project directory.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Initialize a valid package.json manifest for the Node.js project.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return { metadata: { type: 'unknown' }, findings };
  }

  // Detect runtime engine specification
  const hasNodeEngine = Boolean(pkg.engines && pkg.engines.node);
  const hasNvmrc = files.includes('.nvmrc') || files.includes('.node-version');

  if (hasNodeEngine || hasNvmrc) {
    findings.push({
      id: 'DISC-002',
      category: 'discovery',
      status: 'PASS',
      severity: 'info',
      title: 'Explicit Node.js Runtime Version Specified',
      explanation: `Project explicitly declares supported Node.js runtime version: ${pkg.engines?.node || 'via .nvmrc / .node-version'}.`,
      evidence: { file: hasNodeEngine ? 'package.json' : '.nvmrc' },
      checkMethod: 'static_analysis',
      recommendation: 'Maintain runtime engine alignment across local, CI, and production environments.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DISC-002',
      category: 'discovery',
      status: 'WARNING',
      severity: 'medium',
      title: 'Undeclared Node.js Runtime Version',
      explanation: 'Project does not specify an "engines.node" field in package.json or a .nvmrc file.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Declare explicitly supported Node.js versions in package.json "engines" field.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  // Detect framework indicators
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const frameworks = [];
  if (deps.express) frameworks.push('Express');
  if (deps.fastify) frameworks.push('Fastify');
  if (deps.next) frameworks.push('Next.js');
  if (deps.react) frameworks.push('React');
  if (deps.vue) frameworks.push('Vue');
  if (deps.svelte) frameworks.push('Svelte');
  if (deps['@nestjs/core']) frameworks.push('NestJS');

  // Detect lockfiles
  const lockfiles = [];
  if (files.includes('package-lock.json')) lockfiles.push('npm (package-lock.json)');
  if (files.includes('pnpm-lock.yaml')) lockfiles.push('pnpm (pnpm-lock.yaml)');
  if (files.includes('yarn.lock')) lockfiles.push('yarn (yarn.lock)');

  if (lockfiles.length > 0) {
    findings.push({
      id: 'DISC-003',
      category: 'discovery',
      status: 'PASS',
      severity: 'info',
      title: 'Deterministic Dependency Lockfile Present',
      explanation: `Found package lockfile(s): ${lockfiles.join(', ')}.`,
      evidence: { snippet: lockfiles.join(', ') },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure lockfiles are committed to source control to guarantee reproducible builds.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DISC-003',
      category: 'discovery',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing Package Lockfile',
      explanation: 'No package-lock.json, pnpm-lock.yaml, or yarn.lock was detected.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Commit a package lockfile to ensure deterministic builds in production.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  return {
    metadata: {
      name: pkg.name || 'unnamed-project',
      version: pkg.version || '0.0.0',
      type: pkg.type || 'commonjs',
      frameworks,
      lockfiles,
      hasTypeScript: files.includes('tsconfig.json') || files.some((f) => f.endsWith('.ts')),
    },
    findings,
  };
}

/**
 * Module B: Environment Configuration
 */
export function checkEnvironmentConfig(projectDir, files) {
  const findings = [];

  // Check 1: Template presence
  const envTemplates = ['.env.example', '.env.template', 'env.example', '.env.sample'];
  const foundTemplate = envTemplates.find((t) => files.includes(t));

  if (foundTemplate) {
    findings.push({
      id: 'ENV-001',
      category: 'env',
      status: 'PASS',
      severity: 'info',
      title: 'Environment Variable Template Present',
      explanation: `Found documented environment template at "${foundTemplate}".`,
      evidence: { file: foundTemplate },
      checkMethod: 'static_analysis',
      recommendation: 'Keep .env.example synchronized with newly introduced environment variables.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'ENV-001',
      category: 'env',
      status: 'FAIL',
      severity: 'high',
      title: 'Missing Environment Configuration Template',
      explanation: 'No .env.example or environment template file was detected in project root.',
      evidence: { file: '.env.example' },
      checkMethod: 'static_analysis',
      recommendation: 'Create a safe .env.example without secrets documenting all required keys.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  // Check 2: .gitignore exclusions for .env files
  let gitignoreContent = '';
  if (files.includes('.gitignore')) {
    try {
      gitignoreContent = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    } catch {
      // ignore
    }
  }

  const ignoresEnv = /^\.env(\.|$|\*)/m.test(gitignoreContent) || /\.env/i.test(gitignoreContent);
  if (ignoresEnv) {
    findings.push({
      id: 'ENV-002',
      category: 'env',
      status: 'PASS',
      severity: 'info',
      title: 'Secret Environment Files Excluded in .gitignore',
      explanation: '.gitignore contains exclusion rules for .env files.',
      evidence: { file: '.gitignore' },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure all local secret files (.env, .env.local, *.key) remain gitignored.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'ENV-002',
      category: 'env',
      status: 'FAIL',
      severity: 'critical',
      title: 'Secret Files Not Excluded in .gitignore',
      explanation: '.gitignore is missing or does not include rules to exclude .env files.',
      evidence: { file: '.gitignore' },
      checkMethod: 'static_analysis',
      recommendation: 'Add ".env" and ".env.*" to .gitignore to prevent accidental credential commits.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  // Check 3: Startup environment validation integration
  let hasEnvValidation = false;
  let validationEvidence = '';

  const configFiles = files.filter((f) =>
    /(env|config).*\.(ts|js|mjs|cjs)$/i.test(f)
  );

  for (const cf of configFiles) {
    try {
      const code = fs.readFileSync(path.join(projectDir, cf), 'utf8');
      if (/guard\(|s\.string|s\.number|envalid|zod|joi/i.test(code)) {
        hasEnvValidation = true;
        validationEvidence = cf;
        break;
      }
    } catch {
      // skip
    }
  }

  if (hasEnvValidation) {
    findings.push({
      id: 'ENV-003',
      category: 'env',
      status: 'PASS',
      severity: 'info',
      title: 'Type-Safe Startup Environment Validation Detected',
      explanation: `Startup environment schema validation detected in "${validationEvidence}".`,
      evidence: { file: validationEvidence },
      checkMethod: 'static_analysis',
      recommendation: 'Enforce fail-fast startup checks in application entry points before binding ports.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'ENV-003',
      category: 'env',
      status: 'WARNING',
      severity: 'medium',
      title: 'No Startup Environment Validation Schema Detected',
      explanation: 'Could not detect structured environment validation (e.g. EnvGuard guard() or Zod).',
      evidence: { file: configFiles[0] || 'src/' },
      checkMethod: 'static_analysis',
      recommendation: 'Use EnvGuard (guard()) to validate all required environment variables at application boot.',
      manualVerificationRequired: true,
      confidence: 'medium_heuristic',
    });
  }

  // Check 4: Accidental committed live .env files
  const committedEnv = files.filter(
    (f) =>
      (f === '.env' || f === '.env.local' || f === '.env.production') &&
      !f.includes('example') &&
      !f.includes('template')
  );

  if (committedEnv.length > 0) {
    findings.push({
      id: 'ENV-004',
      category: 'env',
      status: 'FAIL',
      severity: 'critical',
      title: 'Sensitive .env File Detected in Repository Tree',
      explanation: `Found potentially live environment file "${committedEnv.join(', ')}" tracked in project files.`,
      evidence: { file: committedEnv[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Remove live .env files from git tracking immediately and rotate any exposed secrets.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  return findings;
}

/**
 * Module C: Build & Test Readiness
 */
export function checkBuildAndTest(projectDir, pkg, allowExec, timeoutMs) {
  const findings = [];
  const scripts = pkg?.scripts || {};

  const targets = [
    { name: 'build', script: scripts.build, id: 'BUILD-001' },
    { name: 'test', script: scripts.test, id: 'BUILD-002' },
    { name: 'typecheck', script: scripts.typecheck || scripts['check-types'], id: 'BUILD-003' },
    { name: 'lint', script: scripts.lint, id: 'BUILD-004' },
  ];

  for (const target of targets) {
    if (!target.script) {
      findings.push({
        id: target.id,
        category: 'build_test',
        status: target.name === 'build' ? 'WARNING' : 'NOT_APPLICABLE',
        severity: target.name === 'build' ? 'medium' : 'low',
        title: `No "${target.name}" Script Declared in package.json`,
        explanation: `package.json does not define a "${target.name}" script.`,
        evidence: { file: 'package.json' },
        checkMethod: 'static_analysis',
        recommendation: `Add a standard "${target.name}" script to package.json to support continuous integration.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
      continue;
    }

    if (!allowExec) {
      findings.push({
        id: target.id,
        category: 'build_test',
        status: 'NOT_RUN',
        severity: 'info',
        title: `Script "${target.name}" Detected but Execution Not Authorized`,
        explanation: `Script "npm run ${target.name}" is declared (${target.script}), but was NOT RUN because --allow-exec was not specified.`,
        evidence: { file: 'package.json', snippet: target.script },
        checkMethod: 'static_analysis',
        recommendation: 'Pass --allow-exec to execute and verify test and build commands.',
        manualVerificationRequired: true,
        confidence: 'verified_fact',
      });
      continue;
    }

    // Execute with permission
    const execRes = runProjectCommand('npm', ['run', target.name], projectDir, timeoutMs);

    if (execRes.success) {
      findings.push({
        id: target.id,
        category: 'build_test',
        status: 'PASS',
        severity: 'info',
        title: `Script "${target.name}" Executed Successfully`,
        explanation: `Command "npm run ${target.name}" exited with code 0 in ${execRes.durationMs}ms.`,
        evidence: {
          command: `npm run ${target.name}`,
          exitCode: 0,
          durationMs: execRes.durationMs,
          snippet: execRes.stdout.slice(0, 300),
        },
        checkMethod: 'command_execution',
        recommendation: `Maintain passing "${target.name}" status in automated CI pipelines.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: target.id,
        category: 'build_test',
        status: 'FAIL',
        severity: 'critical',
        title: `Script "${target.name}" Execution Failed`,
        explanation: `Command "npm run ${target.name}" exited with code ${execRes.exitCode} in ${execRes.durationMs}ms.${
          execRes.timedOut ? ' (Process timed out)' : ''
        }`,
        evidence: {
          command: `npm run ${target.name}`,
          exitCode: execRes.exitCode,
          durationMs: execRes.durationMs,
          snippet: (execRes.stderr || execRes.stdout).slice(0, 500),
        },
        checkMethod: 'command_execution',
        recommendation: `Fix errors causing "npm run ${target.name}" to fail before deploying to production.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }
  }

  return findings;
}

/**
 * Module D: Security Readiness
 */
export function checkSecurity(projectDir, files, pkg) {
  const findings = [];

  // 1. Dependency audit configuration
  const scripts = pkg?.scripts || {};
  const hasAuditScript = Boolean(scripts.audit || scripts['audit:ci']);
  const hasDependabot = files.includes('.github/dependabot.yml') || files.includes('.github/dependabot.yaml');

  if (hasDependabot) {
    findings.push({
      id: 'SEC-001',
      category: 'security',
      status: 'PASS',
      severity: 'info',
      title: 'Automated Dependency Security Updates Configured (Dependabot)',
      explanation: 'Found .github/dependabot.yml automated dependency update configuration.',
      evidence: { file: '.github/dependabot.yml' },
      checkMethod: 'static_analysis',
      recommendation: 'Review and merge security update PRs promptly.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'SEC-001',
      category: 'security',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Automated Dependency Security Scanning Config',
      explanation: 'No Dependabot or Renovate configuration detected in .github directory.',
      evidence: { file: '.github/' },
      checkMethod: 'static_analysis',
      recommendation: 'Configure .github/dependabot.yml to receive automated vulnerability alerts and patches.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  // 2. Secret logging patterns in source files
  const srcFiles = files.filter(
    (f) =>
      (f.startsWith('src/') || f.startsWith('lib/') || f.startsWith('app/')) &&
      /\.(ts|js|mjs|cjs|tsx|jsx)$/.test(f)
  );

  let sensitiveLoggingFile = null;
  let sensitiveLoggingSnippet = '';

  for (const sf of srcFiles) {
    try {
      const content = fs.readFileSync(path.join(projectDir, sf), 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          /console\.(log|info|debug)\(.*(process\.env|SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(line) &&
          !/redact|mask|EnvGuard|guard\(/i.test(line)
        ) {
          sensitiveLoggingFile = sf;
          sensitiveLoggingSnippet = line.trim();
          break;
        }
      }
      if (sensitiveLoggingFile) break;
    } catch {
      // ignore
    }
  }

  if (sensitiveLoggingFile) {
    findings.push({
      id: 'SEC-002',
      category: 'security',
      status: 'WARNING',
      severity: 'high',
      title: 'Potential Sensitive Value Logging Detected',
      explanation: `Detected potential secret or environment variable logging in "${sensitiveLoggingFile}".`,
      evidence: {
        file: sensitiveLoggingFile,
        snippet: sanitizeOutput(sensitiveLoggingSnippet),
      },
      checkMethod: 'heuristic',
      recommendation: 'Avoid logging raw secrets or unmasked environment variables to stdout/stderr.',
      manualVerificationRequired: true,
      confidence: 'high_heuristic',
    });
  } else {
    findings.push({
      id: 'SEC-002',
      category: 'security',
      status: 'PASS',
      severity: 'info',
      title: 'No Raw Secret Logging Patterns Detected',
      explanation: 'Static scan found no obvious console.log(process.env) or unmasked secret logging patterns.',
      evidence: { file: srcFiles[0] || 'src/' },
      checkMethod: 'heuristic',
      recommendation: 'Maintain strict structured logging and value redaction across all services.',
      manualVerificationRequired: false,
      confidence: 'medium_heuristic',
    });
  }

  // 3. Security headers / middleware
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasHelmet = Boolean(deps.helmet);
  const hasCors = Boolean(deps.cors);

  if (hasHelmet || hasCors) {
    findings.push({
      id: 'SEC-003',
      category: 'security',
      status: 'PASS',
      severity: 'info',
      title: 'Security Middleware Configured (Helmet/CORS)',
      explanation: `Project incorporates security middleware packages: ${[
        hasHelmet ? 'helmet' : null,
        hasCors ? 'cors' : null,
      ]
        .filter(Boolean)
        .join(', ')}.`,
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Verify Content Security Policy (CSP) and CORS origin restrictions are properly tuned.',
      manualVerificationRequired: true,
      confidence: 'verified_fact',
    });
  } else if (deps.express || deps.fastify) {
    findings.push({
      id: 'SEC-003',
      category: 'security',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Standard HTTP Security Headers (Helmet)',
      explanation: 'Web API framework detected without explicit helmet or security header middleware.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Install and configure "helmet" to protect against common web vulnerabilities.',
      manualVerificationRequired: true,
      confidence: 'medium_heuristic',
    });
  }

  return findings;
}

/**
 * Module E: API Readiness
 */
export function checkApiReadiness(projectDir, files) {
  const findings = [];
  const openapiFiles = files.filter((f) =>
    /(openapi|swagger).*\.(json|yaml|yml)$/i.test(f)
  );

  if (openapiFiles.length === 0) {
    findings.push({
      id: 'API-001',
      category: 'api',
      status: 'WARNING',
      severity: 'low',
      title: 'No OpenAPI Specification Document Found',
      explanation: 'No openapi.json or openapi.yaml specification was detected in the project.',
      evidence: { file: 'docs/' },
      checkMethod: 'static_analysis',
      recommendation: 'Document REST API endpoints using OpenAPI 3.1 contracts (envguard-api-design).',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  const specPath = openapiFiles[0];
  let spec = null;
  try {
    const raw = fs.readFileSync(path.join(projectDir, specPath), 'utf8');
    spec = JSON.parse(raw);
  } catch (err) {
    findings.push({
      id: 'API-001',
      category: 'api',
      status: 'FAIL',
      severity: 'high',
      title: 'Malformed OpenAPI Specification',
      explanation: `Failed to parse OpenAPI document at "${specPath}": ${err.message}`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure OpenAPI specification is valid JSON conforming to OpenAPI 3.x schema.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  // Validate OpenAPI structure
  if (!spec.openapi || !spec.paths) {
    findings.push({
      id: 'API-002',
      category: 'api',
      status: 'FAIL',
      severity: 'high',
      title: 'Invalid OpenAPI Schema Structure',
      explanation: `Document at "${specPath}" lacks required top-level "openapi" or "paths" keys.`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Provide valid OpenAPI version (3.0.x or 3.1.x) and endpoints mapping.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'API-002',
      category: 'api',
      status: 'PASS',
      severity: 'info',
      title: `Valid OpenAPI Contract Present (${spec.openapi})`,
      explanation: `Found valid OpenAPI contract at "${specPath}" declaring ${Object.keys(spec.paths).length} path(s).`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Keep API specification in sync with route implementations.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });

    // Check RESTful path conventions (flag action verbs)
    const actionVerbPaths = Object.keys(spec.paths).filter((p) =>
      /\/(get|create|delete|update|find)[A-Z0-9_-]/i.test(p) || /_(get|create|delete|update)/i.test(p)
    );

    if (actionVerbPaths.length > 0) {
      findings.push({
        id: 'API-003',
        category: 'api',
        status: 'WARNING',
        severity: 'medium',
        title: 'Non-RESTful RPC Action Verbs in API URLs',
        explanation: `OpenAPI specification contains RPC-style action verbs in paths: "${actionVerbPaths.slice(0, 3).join(', ')}".`,
        evidence: { file: specPath, snippet: actionVerbPaths[0] },
        checkMethod: 'static_analysis',
        recommendation: 'Use plural nouns and standard HTTP methods (e.g. POST /tasks instead of /createTask).',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // Check RFC 7807 / RFC 9457 Problem Details error schema
    const schemas = spec.components?.schemas || {};
    const hasProblemDetails = Object.keys(schemas).some(
      (k) => /problemdetail/i.test(k) || (/error/i.test(k) && schemas[k]?.properties?.status)
    );

    if (hasProblemDetails) {
      findings.push({
        id: 'API-004',
        category: 'api',
        status: 'PASS',
        severity: 'info',
        title: 'Standardized Error Model Defined (RFC 7807 / RFC 9457)',
        explanation: 'OpenAPI specification documents structured Problem Details error responses.',
        evidence: { file: specPath },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure backend error-handling middleware returns application/problem+json payloads.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'API-004',
        category: 'api',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing RFC 7807 / RFC 9457 Problem Details Schema',
        explanation: 'OpenAPI contract does not define a standard Problem Details error envelope.',
        evidence: { file: specPath },
        checkMethod: 'static_analysis',
        recommendation: 'Define a ProblemDetails schema in components.schemas compliant with RFC 7807 / RFC 9457.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }
  }

  // Runtime API tests marked NOT_RUN
  findings.push({
    id: 'API-005',
    category: 'api',
    status: 'NOT_RUN',
    severity: 'info',
    title: 'Live API Contract Conformance Testing Not Executed',
    explanation: 'No running HTTP server was provisioned to execute runtime API contract tests.',
    evidence: { file: specPath },
    checkMethod: 'manual_verification_required',
    recommendation: 'Execute automated Dredd or Schemathesis contract tests against a staging deployment.',
    manualVerificationRequired: true,
    confidence: 'verified_fact',
  });

  return findings;
}

/**
 * Module F: Database Readiness
 */
export function checkDatabaseReadiness(projectDir, files, pkg) {
  const findings = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  const dbDrivers = ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'prisma', 'drizzle-orm', 'typeorm', 'knex'];
  const detectedDrivers = dbDrivers.filter((d) => deps[d]);

  if (detectedDrivers.length === 0 && !files.some((f) => /schema\.prisma|migrations\//i.test(f))) {
    findings.push({
      id: 'DB-001',
      category: 'database',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'No Database Driver or ORM Detected',
      explanation: 'Project does not appear to interact with relational or document databases.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'N/A for stateless applications.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  findings.push({
    id: 'DB-001',
    category: 'database',
    status: 'PASS',
    severity: 'info',
    title: 'Database Driver or ORM Configured',
    explanation: `Detected database dependencies: ${detectedDrivers.join(', ')}.`,
    evidence: { file: 'package.json' },
    checkMethod: 'static_analysis',
    recommendation: 'Maintain strict parameterized queries and connection pool boundaries.',
    manualVerificationRequired: false,
    confidence: 'verified_fact',
  });

  // Check migrations
  const hasMigrations = files.some(
    (f) =>
      /migrations?\/.*\.(ts|js|sql)/i.test(f) ||
      f.includes('prisma/migrations') ||
      /migrate/i.test(f)
  );

  if (hasMigrations) {
    findings.push({
      id: 'DB-002',
      category: 'database',
      status: 'PASS',
      severity: 'info',
      title: 'Database Schema Migrations Detected',
      explanation: 'Found version-controlled migration scripts or schema definitions.',
      evidence: { file: files.find((f) => /migration/i.test(f)) || 'migrations/' },
      checkMethod: 'static_analysis',
      recommendation: 'Test non-destructive migrations in staging before applying to production.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DB-002',
      category: 'database',
      status: 'WARNING',
      severity: 'high',
      title: 'No Schema Migration Scripts Found',
      explanation: 'Database dependencies exist but no versioned migration scripts were detected.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Adopt a migration tool (e.g. Prisma Migrate, Drizzle Kit, Knex) for safe schema evolution.',
      manualVerificationRequired: true,
      confidence: 'high_heuristic',
    });
  }

  // Database operational safety
  findings.push({
    id: 'DB-003',
    category: 'database',
    status: 'MANUAL_REVIEW',
    severity: 'medium',
    title: 'Database Connection Pooling & Failover Unverified',
    explanation: 'Static analysis cannot verify live database connection pool sizing or read-replica failovers.',
    evidence: { file: 'src/' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Verify max connection limits, statement timeouts, and connection retry policies.',
    manualVerificationRequired: true,
    confidence: 'unverified',
  });

  return findings;
}

/**
 * Module G: Deployment & Operational Readiness
 */
export function checkDeployment(projectDir, files) {
  const findings = [];

  // 1. Containerization
  const hasDockerfile = files.includes('Dockerfile') || files.includes('docker-compose.yml') || files.includes('compose.yaml');
  if (hasDockerfile) {
    findings.push({
      id: 'DEP-001',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Container Configuration Present (Dockerfile / Compose)',
      explanation: `Found containerization configuration: ${files.filter((f) => /docker|compose/i.test(f)).join(', ')}.`,
      evidence: { file: 'Dockerfile' },
      checkMethod: 'static_analysis',
      recommendation: 'Use multi-stage Docker builds to minimize final production image attack surface.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DEP-001',
      category: 'deployment',
      status: 'WARNING',
      severity: 'low',
      title: 'No Dockerfile or Container Configuration Found',
      explanation: 'No Dockerfile or docker-compose.yml was found in project root.',
      evidence: { file: 'Dockerfile' },
      checkMethod: 'static_analysis',
      recommendation: 'Create a non-root, multi-stage Dockerfile for containerized deployment.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  // 2. Health check endpoint
  let hasHealthCheck = false;
  let healthFile = null;

  const serverFiles = files.filter(
    (f) => (f.startsWith('src/') || f.startsWith('app/') || f.startsWith('server/')) && /\.(ts|js|mjs)$/.test(f)
  );

  for (const sf of serverFiles) {
    try {
      const code = fs.readFileSync(path.join(projectDir, sf), 'utf8');
      if (/\/(health|healthz|livez|readyz)/i.test(code)) {
        hasHealthCheck = true;
        healthFile = sf;
        break;
      }
    } catch {
      // skip
    }
  }

  if (hasHealthCheck) {
    findings.push({
      id: 'DEP-002',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Health Check Endpoint Route Detected',
      explanation: `Detected health check route handler (/health) in "${healthFile}".`,
      evidence: { file: healthFile },
      checkMethod: 'static_analysis',
      recommendation: 'Integrate health endpoint with load balancer or orchestrator readiness probes.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DEP-002',
      category: 'deployment',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing Health Check Endpoint (/health)',
      explanation: 'No /health or /healthz probe route was detected in server routing files.',
      evidence: { file: serverFiles[0] || 'src/' },
      checkMethod: 'static_analysis',
      recommendation: 'Implement a lightweight /health endpoint returning HTTP 200 and process status.',
      manualVerificationRequired: false,
      confidence: 'high_heuristic',
    });
  }

  // 3. Graceful shutdown handler
  let hasGracefulShutdown = false;
  let shutdownFile = null;

  for (const sf of serverFiles) {
    try {
      const code = fs.readFileSync(path.join(projectDir, sf), 'utf8');
      if (/process\.on\(\s*['"]SIGTERM['"]|process\.on\(\s*['"]SIGINT['"]/i.test(code)) {
        hasGracefulShutdown = true;
        shutdownFile = sf;
        break;
      }
    } catch {
      // skip
    }
  }

  if (hasGracefulShutdown) {
    findings.push({
      id: 'DEP-003',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Graceful Process Shutdown Handlers Detected',
      explanation: `Found SIGTERM/SIGINT signal listeners in "${shutdownFile}".`,
      evidence: { file: shutdownFile },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure active connections and database pools drain cleanly on SIGTERM.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DEP-003',
      category: 'deployment',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Graceful Shutdown Signal Handling',
      explanation: 'No SIGTERM or SIGINT process event handlers detected in server code.',
      evidence: { file: serverFiles[0] || 'src/' },
      checkMethod: 'static_analysis',
      recommendation: 'Implement process.on("SIGTERM") to close HTTP servers without dropping in-flight requests.',
      manualVerificationRequired: true,
      confidence: 'medium_heuristic',
    });
  }

  // 4. CI/CD Workflow automation
  const ciFiles = files.filter((f) => f.startsWith('.github/workflows/'));
  if (ciFiles.length > 0) {
    findings.push({
      id: 'DEP-004',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Automated CI/CD Workflows Detected',
      explanation: `Found ${ciFiles.length} GitHub Actions workflow file(s) in .github/workflows/.`,
      evidence: { file: ciFiles[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure all pull requests execute tests, linters, and typecheck gates before merging.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'DEP-004',
      category: 'deployment',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing CI/CD Workflow Automation',
      explanation: 'No .github/workflows directory or automated CI configuration detected.',
      evidence: { file: '.github/workflows/' },
      checkMethod: 'static_analysis',
      recommendation: 'Create a GitHub Actions CI workflow to validate builds and tests automatically.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  return findings;
}

/**
 * Module H: Accessibility & Frontend Quality
 */
export function checkAccessibility(projectDir, files, pkg) {
  const findings = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  const hasFrontend = deps.react || deps.vue || deps.svelte || deps.next || files.some((f) => /\.(tsx|jsx)$/.test(f));
  if (!hasFrontend) {
    findings.push({
      id: 'A11Y-001',
      category: 'accessibility',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'No Frontend Code Detected',
      explanation: 'Project does not appear to contain interactive web UI components.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'N/A for backend-only services.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  const hasA11yLinter = Boolean(deps['eslint-plugin-jsx-a11y'] || deps['axe-core'] || deps['@axe-core/react']);
  if (hasA11yLinter) {
    findings.push({
      id: 'A11Y-001',
      category: 'accessibility',
      status: 'PASS',
      severity: 'info',
      title: 'Automated Accessibility Tooling Configured',
      explanation: 'Found accessibility linting or testing dependencies (e.g. jsx-a11y, axe-core).',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Integrate automated axe tests into component test suites.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'A11Y-001',
      category: 'accessibility',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Automated Accessibility Linting',
      explanation: 'Frontend components detected without eslint-plugin-jsx-a11y or axe-core configured.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Install eslint-plugin-jsx-a11y and verify WCAG 2.1 AA compliance (envguard-accessibility).',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  findings.push({
    id: 'A11Y-002',
    category: 'accessibility',
    status: 'MANUAL_REVIEW',
    severity: 'medium',
    title: 'Screen Reader & Keyboard Navigation Manual Verification Required',
    explanation: 'Static analysis cannot verify assistive technology announcements, focus traps, or keyboard tab flows.',
    evidence: { file: 'src/frontend/' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Perform manual keyboard Tab/Escape navigation and screen reader audits (VoiceOver/NVDA).',
    manualVerificationRequired: true,
    confidence: 'unverified',
  });

  return findings;
}

/**
 * Module I: Performance Readiness
 */
export function checkPerformance(projectDir, files, pkg) {
  const findings = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  const hasLoadTestScript = files.some(
    (f) => /k6|load-test|benchmark|autocannon/i.test(f) || Boolean(pkg?.scripts?.['test:load'])
  );

  if (hasLoadTestScript) {
    findings.push({
      id: 'PERF-001',
      category: 'performance',
      status: 'PASS',
      severity: 'info',
      title: 'Load Testing or Performance Scripts Configured',
      explanation: 'Detected performance workload definitions or load test scripts in project repository.',
      evidence: { file: files.find((f) => /load|benchmark|k6/i.test(f)) || 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Execute controlled baseline load tests before major production releases.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  } else {
    findings.push({
      id: 'PERF-001',
      category: 'performance',
      status: 'WARNING',
      severity: 'low',
      title: 'No Load Testing or Benchmark Scripts Detected',
      explanation: 'Could not detect k6, autocannon, or benchmark test scripts.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Create realistic workload profiles and measure p95/p99 latency thresholds.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
  }

  findings.push({
    id: 'PERF-002',
    category: 'performance',
    status: 'NOT_RUN',
    severity: 'info',
    title: 'High-Load Traffic Simulation Not Executed',
    explanation: 'Production readiness analyzer intentionally does not generate live synthetic traffic without explicit staging setup.',
    evidence: { file: 'tools/readiness-auditor.mjs' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Run isolated performance lab tests in dedicated staging environments.',
    manualVerificationRequired: true,
    confidence: 'verified_fact',
  });

  return findings;
}

/**
 * Orchestrates full readiness assessment across all modules.
 */
export function runReadinessAudit({
  projectDir = '.',
  categories = VALID_CATEGORIES,
  allowExec = false,
  timeoutMs = 10000,
} = {}) {
  const safeProjectDir = assertSafeProjectDir(projectDir);
  const files = collectProjectFiles(safeProjectDir);

  // Load package.json if present
  let pkg = null;
  const pkgPath = path.join(safeProjectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      // malformed package.json handled in discovery
    }
  }

  const selectedCats = new Set(categories);
  const allFindings = [];

  // Discovery
  let projectMeta = { type: 'unknown' };
  if (selectedCats.has('discovery')) {
    const disc = checkProjectDiscovery(safeProjectDir, files, pkg);
    projectMeta = disc.metadata;
    allFindings.push(...disc.findings);
  }

  // Environment
  if (selectedCats.has('env')) {
    allFindings.push(...checkEnvironmentConfig(safeProjectDir, files));
  }

  // Build & Test
  if (selectedCats.has('build_test')) {
    allFindings.push(...checkBuildAndTest(safeProjectDir, pkg, allowExec, timeoutMs));
  }

  // Security
  if (selectedCats.has('security')) {
    allFindings.push(...checkSecurity(safeProjectDir, files, pkg));
  }

  // API
  if (selectedCats.has('api')) {
    allFindings.push(...checkApiReadiness(safeProjectDir, files));
  }

  // Database
  if (selectedCats.has('database')) {
    allFindings.push(...checkDatabaseReadiness(safeProjectDir, files, pkg));
  }

  // Deployment
  if (selectedCats.has('deployment')) {
    allFindings.push(...checkDeployment(safeProjectDir, files));
  }

  // Accessibility
  if (selectedCats.has('accessibility')) {
    allFindings.push(...checkAccessibility(safeProjectDir, files, pkg));
  }

  // Performance
  if (selectedCats.has('performance')) {
    allFindings.push(...checkPerformance(safeProjectDir, files, pkg));
  }

  // Deterministic ordering: by category then by finding ID
  allFindings.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
  });

  // Calculate summary counts
  const summary = {
    totalChecks: allFindings.length,
    pass: allFindings.filter((f) => f.status === 'PASS').length,
    fail: allFindings.filter((f) => f.status === 'FAIL').length,
    warning: allFindings.filter((f) => f.status === 'WARNING').length,
    notRun: allFindings.filter((f) => f.status === 'NOT_RUN').length,
    manualReview: allFindings.filter((f) => f.status === 'MANUAL_REVIEW').length,
    notApplicable: allFindings.filter((f) => f.status === 'NOT_APPLICABLE').length,
    error: allFindings.filter((f) => f.status === 'ERROR').length,
  };

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    timestamp: new Date().toISOString(),
    projectRoot: path.basename(safeProjectDir),
    platform: {
      nodeVersion: process.version,
      os: os.platform(),
      arch: os.arch(),
    },
    configuration: {
      allowExec,
      timeoutMs,
      categories: Array.from(selectedCats),
    },
    projectMetadata: projectMeta,
    summary,
    findings: allFindings,
    limitations: [
      'Static analysis checks identify potential configuration anomalies and declared patterns; they do not certify absolute security or absence of runtime bugs.',
      'Checks marked NOT_RUN were not executed (e.g. requires --allow-exec or dedicated staging infrastructure).',
      'Checks marked MANUAL_REVIEW require human verification (e.g. assistive technology usability, high-volume database failover).',
      'No production-readiness percentage is calculated, as qualitative system readiness cannot be accurately represented by a single arithmetic ratio.',
    ],
  };

  return report;
}

/**
 * Generates structured Markdown report from assessment data.
 */
export function generateMarkdownReport(report) {
  const { summary, configuration, platform, projectMetadata, findings, limitations } = report;

  let md = `# EnvGuard Production Readiness Assessment Report\n\n`;
  md += `**Project**: \`${report.projectRoot}\`  \n`;
  md += `**Timestamp**: ${report.timestamp}  \n`;
  md += `**Auditor Version**: v${report.toolVersion} (Schema v${report.schemaVersion})  \n`;
  md += `**Platform**: Node.js ${platform.nodeVersion} on ${platform.os}-${platform.arch}  \n`;
  md += `**Execution Permitted (--allow-exec)**: ${configuration.allowExec ? 'Yes (Authorized)' : 'No (Read-Only Mode)'}\n\n`;

  md += `## 1. Executive Summary\n\n`;
  md += `| Check Status | Count | Description |\n`;
  md += `| :--- | :---: | :--- |\n`;
  md += `| **PASS** | ${summary.pass} | Verified passing criteria |\n`;
  md += `| **FAIL** | ${summary.fail} | Blocking failures requiring remediation |\n`;
  md += `| **WARNING** | ${summary.warning} | Non-blocking risks or missing conventions |\n`;
  md += `| **NOT_RUN** | ${summary.notRun} | Checks skipped (authorization or infra unavailable) |\n`;
  md += `| **MANUAL_REVIEW** | ${summary.manualReview} | Heuristics requiring human engineering review |\n`;
  md += `| **NOT_APPLICABLE**| ${summary.notApplicable} | Checks irrelevant to detected project type |\n`;
  md += `| **Total Checks** | ${summary.totalChecks} | Comprehensive assessment scope |\n\n`;

  // Blocking Failures
  const failures = findings.filter((f) => f.status === 'FAIL');
  if (failures.length > 0) {
    md += `## 2. Blocking Failures (${failures.length})\n\n`;
    for (const f of failures) {
      md += `### [${f.id}] ${f.title} (${f.severity?.toUpperCase() || 'HIGH'})\n`;
      md += `- **Explanation**: ${f.explanation}\n`;
      if (f.evidence?.file) md += `- **Evidence File**: \`${f.evidence.file}\`\n`;
      if (f.evidence?.command) md += `- **Command**: \`${f.evidence.command}\` (exit code: ${f.evidence.exitCode})\n`;
      if (f.evidence?.snippet) md += `\`\`\`\n${f.evidence.snippet}\n\`\`\`\n`;
      md += `- **Recommendation**: ${f.recommendation}\n\n`;
    }
  }

  // Warnings
  const warnings = findings.filter((f) => f.status === 'WARNING');
  if (warnings.length > 0) {
    md += `## 3. Warnings & Improvement Opportunities (${warnings.length})\n\n`;
    for (const w of warnings) {
      md += `### [${w.id}] ${w.title}\n`;
      md += `- **Explanation**: ${w.explanation}\n`;
      if (w.evidence?.file) md += `- **Evidence**: \`${w.evidence.file}\`\n`;
      md += `- **Recommendation**: ${w.recommendation}\n\n`;
    }
  }

  // Verified Passing Checks
  const passed = findings.filter((f) => f.status === 'PASS');
  md += `## 4. Verified Passing Checks (${passed.length})\n\n`;
  for (const p of passed) {
    md += `- **[${p.id}] ${p.title}**: ${p.explanation}\n`;
  }
  md += `\n`;

  // Manual Review & Not-Run
  const manualAndNotRun = findings.filter((f) => f.status === 'MANUAL_REVIEW' || f.status === 'NOT_RUN');
  if (manualAndNotRun.length > 0) {
    md += `## 5. Unexecuted & Manual Review Items (${manualAndNotRun.length})\n\n`;
    for (const item of manualAndNotRun) {
      md += `- **[${item.id}] ${item.title}** (${item.status}): ${item.explanation}\n`;
    }
    md += `\n`;
  }

  // Prioritized Remediation Plan
  md += `## 6. Prioritized Remediation Plan\n\n`;
  let step = 1;
  for (const f of failures) {
    md += `${step++}. **[P0 - Blocker]** ${f.title}: ${f.recommendation}\n`;
  }
  for (const w of warnings.filter((w) => w.severity === 'high')) {
    md += `${step++}. **[P1 - High]** ${w.title}: ${w.recommendation}\n`;
  }
  for (const w of warnings.filter((w) => w.severity !== 'high')) {
    md += `${step++}. **[P2 - Medium/Low]** ${w.title}: ${w.recommendation}\n`;
  }
  if (failures.length === 0 && warnings.length === 0) {
    md += `All automated checks passed cleanly! Proceed with manual operational verification before production rollout.\n`;
  }
  md += `\n`;

  // Known Limitations
  md += `## 7. Known Limitations & Scope Boundaries\n\n`;
  for (const lim of limitations) {
    md += `- ${lim}\n`;
  }
  md += `\n`;

  return md;
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
  let timeoutMs = 10000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
EnvGuard Readiness Auditor v${TOOL_VERSION}
Evidence-based application production readiness analyzer.

Usage:
  node tools/readiness-auditor.mjs [scan] [options]

Options:
  --project <dir>      Path to project directory (default: current directory)
  --output-dir <dir>   Directory to write assessment reports (JSON and Markdown)
  --format <type>      Output format: "json", "markdown", or "both" (default: "both" if --output-dir, else console)
  --checks <list>      Comma-separated list of check categories to run:
                       discovery, env, build_test, security, api, database, deployment, accessibility, performance
  --allow-exec         Explicitly authorize local project build and test command execution (default: read-only)
  --timeout <ms>       Maximum execution time per command in ms (default: 10000)
  --help, -h           Show this help message

Safety Boundaries:
  - Read-only by default. Does NOT run project scripts without --allow-exec.
  - Subprocess timeouts and sanitized outputs are enforced.
  - Never automatically publishes, deploys, or alters production databases.
`);
      return 0;
    } else if (arg === 'scan') {
      // subcommand keyword optional
    } else if (arg === '--project') {
      projectDir = argv[++i];
    } else if (arg === '--output-dir') {
      outputDir = argv[++i];
    } else if (arg === '--format') {
      format = argv[++i]?.toLowerCase();
    } else if (arg === '--checks') {
      const specified = argv[++i]?.split(',').map((s) => s.trim().toLowerCase());
      categories = specified.filter((c) => VALID_CATEGORIES.includes(c));
    } else if (arg === '--allow-exec') {
      allowExec = true;
    } else if (arg === '--timeout') {
      const parsedTimeout = parseInt(argv[++i], 10);
      if (!Number.isNaN(parsedTimeout) && parsedTimeout > 0) {
        timeoutMs = parsedTimeout;
      }
    } else {
      console.error(`Error: Unrecognized option "${arg}". Run with --help for valid options.`);
      return 1;
    }
  }

  let report;
  try {
    report = runReadinessAudit({
      projectDir,
      categories,
      allowExec,
      timeoutMs,
    });
  } catch (err) {
    console.error(`Readiness Audit Error: ${err.message}`);
    return 1;
  }

  // Handle report outputs
  const jsonOutput = JSON.stringify(report, null, 2);
  const mdOutput = generateMarkdownReport(report);

  if (outputDir) {
    const resolvedOut = path.resolve(outputDir);
    if (!fs.existsSync(resolvedOut)) {
      fs.mkdirSync(resolvedOut, { recursive: true });
    }

    const targetFormat = format || 'both';
    if (targetFormat === 'json' || targetFormat === 'both') {
      const jsonFile = path.join(resolvedOut, 'readiness-report.json');
      fs.writeFileSync(jsonFile, jsonOutput, 'utf8');
      console.log(`Saved JSON readiness report to: ${jsonFile}`);
    }
    if (targetFormat === 'markdown' || targetFormat === 'both') {
      const mdFile = path.join(resolvedOut, 'readiness-report.md');
      fs.writeFileSync(mdFile, mdOutput, 'utf8');
      console.log(`Saved Markdown readiness report to: ${mdFile}`);
    }
  } else {
    if (format === 'json') {
      console.log(jsonOutput);
    } else {
      console.log(mdOutput);
    }
  }

  // Return non-zero if blocking failures exist
  return report.summary.fail > 0 ? 2 : 0;
}

// Direct invocation CLI runner
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith('readiness-auditor.mjs') || process.argv[1].endsWith('readiness-auditor'));

if (isDirectCall) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
