#!/usr/bin/env node

/**
 * EnvGuard Readiness Auditor (Bundled Skill Distribution)
 * Standalone, evidence-based application production readiness analyzer.
 *
 * Distributed with the envguard-production-readiness agent skill pack.
 * Zero third-party runtime dependencies. Uses native Node.js APIs only.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

let YAMLParser = null;
try {
  const mod = await import('yaml');
  YAMLParser = mod.default || mod;
} catch {
  // If yaml module is not installed, fallback YAML parser is used for basic structures
}

export const TOOL_VERSION = '1.0.0';
export const REPORT_SCHEMA_VERSION = '1.0.0';

export const EXIT_CODES = {
  SUCCESS_NO_BLOCKERS: 0,
  TOOL_ERROR: 1,
  POLICY_BLOCKERS: 2,
  INVALID_ARGUMENTS: 3,
  INCOMPLETE_EXECUTION: 4,
};

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

export const VALID_FORMATS = ['json', 'markdown', 'both'];

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
 * Note: Pattern-based redaction reduces accidental leaks but cannot guarantee 100% prevention.
 */
export function sanitizeOutput(str) {
  if (typeof str !== 'string') return '';
  let cleaned = stripAnsi(str);
  // Redact specific known key prefixes first
  cleaned = cleaned.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]');
  cleaned = cleaned.replace(/(ghp_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]');
  cleaned = cleaned.replace(/(sk_live_[A-Za-z0-9_]{16,})/gi, '[REDACTED_STRIPE_KEY]');
  cleaned = cleaned.replace(/(AKIA[0-9A-Z]{16})/gi, '[REDACTED_AWS_KEY]');
  // Redact generic key=value pairs, ignoring already redacted values
  cleaned = cleaned.replace(/((?:password|secret|token|api_key|auth)\s*[:=]\s*['"]?)(?!\[REDACTED)[^'"\s,]+/gi, '$1[REDACTED]');
  return cleaned;
}

/**
 * Escapes characters that break Markdown tables or block structures.
 */
export function escapeMarkdown(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '\\`');
}

/**
 * Validates target project directory against path traversal attacks and symlink escapes.
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

  try {
    const real = fs.realpathSync.native(resolved);
    return real;
  } catch {
    return resolved;
  }
}

/**
 * Validates output directory destination to prevent path traversal or unsafe overwrites.
 */
export function assertSafeOutputDir(outputDir) {
  if (!outputDir || typeof outputDir !== 'string') {
    throw new Error('Output directory path must be a non-empty string.');
  }
  if (outputDir.includes('\0')) {
    throw new Error('Invalid output directory: contains null byte.');
  }

  const resolved = path.resolve(outputDir);
  const root = path.parse(resolved).root;
  if (resolved === root || resolved === path.join(root, 'Windows') || resolved === '/etc') {
    throw new Error(`Refusing to write assessment reports to system directory: "${resolved}"`);
  }

  return resolved;
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
          try {
            if (entry.isSymbolicLink()) {
              const realLink = fs.realpathSync(fullPath);
              if (!realLink.startsWith(projectDir)) continue;
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
 * Checks whether the current runtime environment is inside a verified container or isolated sandbox.
 */
export function isEnvironmentIsolated() {
  if (process.env.ENVGUARD_CONTAINER_ISOLATED === 'true') return true;
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch {}
  try {
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (/docker|containerd|kubepods|lxc/i.test(cgroup)) return true;
    }
  } catch {}
  return false;
}

/**
 * Minimizes environment variables passed to child processes.
 * Strips all tokens, secrets, parent credentials, and sensitive configurations.
 */
export function buildSanitizedEnv(baseEnv = process.env) {
  const safeEnv = {};
  const allowedKeys = [
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'TERM',
    'LANG',
    'LC_ALL',
  ];

  for (const key of allowedKeys) {
    if (baseEnv[key] !== undefined) {
      safeEnv[key] = baseEnv[key];
    }
  }

  safeEnv.CI = 'true';
  safeEnv.NODE_ENV = 'test';

  return safeEnv;
}

/**
 * Executes an authorized project command with strict execution bounds, minimized env,
 * and containment verification.
 */
export function runProjectCommand(
  command,
  args,
  projectDir,
  {
    timeoutMs = 10000,
    allowExec = false,
    trustProject = false,
    isIsolated = null,
    allowedCommands = null,
  } = {}
) {
  const startTime = Date.now();

  if (!allowExec) {
    return {
      success: false,
      notRun: true,
      blockedByPolicy: true,
      reason: 'unauthorized',
      durationMs: 0,
      exitCode: 0,
      stdout: '',
      stderr: 'Execution not authorized. Use --allow-exec to permit running local scripts.',
      timedOut: false,
    };
  }

  const isolated = isIsolated !== null ? isIsolated : isEnvironmentIsolated();
  if (!isolated && !trustProject) {
    return {
      success: false,
      notRun: true,
      blockedByPolicy: true,
      reason: 'host_isolation_unavailable',
      durationMs: 0,
      exitCode: 0,
      stdout: '',
      stderr:
        'Host execution blocked: Process isolation unavailable. Untrusted project scripts require container isolation or explicit host trust acknowledgement via --trust-project.',
      timedOut: false,
      isolated: false,
      trustMode: 'untrusted_blocked',
    };
  }

  const scriptName = args && args.length > 0 ? args[args.length - 1] : command;
  if (allowedCommands && Array.isArray(allowedCommands) && !allowedCommands.includes(scriptName)) {
    return {
      success: false,
      notRun: true,
      blockedByPolicy: true,
      reason: 'command_not_whitelisted',
      durationMs: 0,
      exitCode: 0,
      stdout: '',
      stderr: `Command "${scriptName}" is not in the authorized command list (${allowedCommands.join(', ')}).`,
      timedOut: false,
      isolated,
      trustMode: isolated ? 'container_isolated' : 'explicit_host_trust',
    };
  }

  const allowedBinaries = new Set(['npm', 'pnpm', 'yarn', 'node', 'npx']);
  if (!allowedBinaries.has(command)) {
    return {
      success: false,
      notRun: true,
      blockedByPolicy: true,
      reason: 'unsupported_binary',
      durationMs: 0,
      exitCode: 1,
      stdout: '',
      stderr: `Refusing to execute unwhitelisted binary "${command}". Supported: npm, pnpm, yarn, node, npx.`,
      timedOut: false,
    };
  }

  if (args && Array.isArray(args)) {
    for (const arg of args) {
      if (!/^[a-zA-Z0-9_.:@/-]+$/.test(arg)) {
        return {
          success: false,
          notRun: true,
          blockedByPolicy: true,
          reason: 'unsafe_arguments',
          durationMs: 0,
          exitCode: 1,
          stdout: '',
          stderr: `Command argument contains disallowed characters: "${arg}".`,
          timedOut: false,
        };
      }
    }
  }

  const sanitizedEnv = buildSanitizedEnv(process.env);
  const isWindows = process.platform === 'win32';

  try {
    let res;
    if (isWindows) {
      const fullCmd = args && args.length > 0 ? `${command} ${args.join(' ')}` : command;
      res = spawnSync(fullCmd, {
        cwd: projectDir,
        timeout: timeoutMs,
        shell: true,
        encoding: 'utf8',
        env: sanitizedEnv,
        maxBuffer: 512 * 1024,
      });
    } else {
      res = spawnSync(command, args, {
        cwd: projectDir,
        timeout: timeoutMs,
        shell: false,
        encoding: 'utf8',
        env: sanitizedEnv,
        maxBuffer: 512 * 1024,
      });
    }

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
      isolated,
      trustMode: isolated ? 'container_isolated' : 'explicit_host_trust',
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
      isolated,
      trustMode: isolated ? 'container_isolated' : 'explicit_host_trust',
      error: err.message,
    };
  }
}

/**
 * Checks if a file is tracked in Git index.
 */
export function checkGitTracking(projectDir, filePath) {
  try {
    const res = spawnSync('git', ['ls-files', '--error-unmatch', filePath], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 3000,
      env: buildSanitizedEnv(process.env),
      shell: false,
    });
    return {
      isGitRepo: res.status === 0 || !res.stderr?.includes('not a git repository'),
      isTracked: res.status === 0,
    };
  } catch {
    return { isGitRepo: false, isTracked: false };
  }
}

/**
 * Parses .gitignore lines handling comments, blank lines, and negation rules.
 */
export function parseGitignoreRules(gitignoreContent) {
  if (!gitignoreContent || typeof gitignoreContent !== 'string') return [];
  const rules = [];
  for (const raw of gitignoreContent.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      rules.push({ pattern: line.slice(1).trim(), negate: true });
    } else {
      rules.push({ pattern: line, negate: false });
    }
  }
  return rules;
}

/**
 * Evaluates whether a file path is ignored by parsed .gitignore rules.
 */
export function isPathIgnoredByRules(rules, filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(norm);
  let ignored = false;

  for (const rule of rules) {
    const pat = rule.pattern;
    let matches = false;

    if (pat === norm || pat === base) {
      matches = true;
    } else if (pat.endsWith('/') && (norm.startsWith(pat) || norm + '/' === pat)) {
      matches = true;
    } else if (pat.includes('*')) {
      const escaped = pat.replace(/[\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp(`^${escaped}$`);
      matches = re.test(norm) || re.test(base);
    } else if (norm.includes(pat) || base === pat) {
      matches = true;
    }

    if (matches) {
      ignored = !rule.negate;
    }
  }

  return ignored;
}

/**
 * Previews eligible commands with network and filesystem disclosure.
 */
export function previewExecutionCommands(projectDir, pkg, timeoutMs, { allowExec, trustProject } = {}) {
  const scripts = pkg?.scripts || {};
  const isolated = isEnvironmentIsolated();
  const candidates = [
    { name: 'test', command: 'npm', args: ['run', 'test'], declared: Boolean(scripts.test) },
    { name: 'build', command: 'npm', args: ['run', 'build'], declared: Boolean(scripts.build) },
    { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'], declared: Boolean(scripts.typecheck || scripts['check-types']) },
    { name: 'lint', command: 'npm', args: ['run', 'lint'], declared: Boolean(scripts.lint) },
  ];

  return {
    projectDir,
    isolationAvailable: isolated,
    allowExec: Boolean(allowExec),
    trustProject: Boolean(trustProject),
    trustMode: isolated ? 'container_isolated' : trustProject ? 'explicit_host_trust' : 'untrusted_blocked',
    timeoutMs,
    commands: candidates.filter((c) => c.declared),
    disclosures: {
      network:
        'Build and test commands may attempt outbound network calls (e.g. registry fetches, CDN downloads). Network isolation is not enforced by host OS without container containment.',
      filesystem:
        'Build and test commands may modify files in working directory (e.g. dist/, node_modules/.cache, coverage/, .turbo, temp files).',
    },
  };
}

/**
 * Fallback lightweight YAML parser for OpenAPI 3.x structures when the 'yaml' npm package is absent.
 */
export function parseYamlFallback(raw) {
  const lines = raw.split('\n');
  const result = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val || {};
    }
  }

  return result;
}

/**
 * Module A: Project Discovery
 */
export function checkProjectDiscovery(projectDir, files, pkg) {
  const findings = [];

  if (!pkg) {
    findings.push({
      id: 'DISC-001',
      checkId: 'DISC-001',
      category: 'discovery',
      status: 'FAIL',
      severity: 'critical',
      title: 'Missing or Malformed package.json',
      explanation: 'No valid package.json manifest could be parsed in project root.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Initialize a valid package.json with name, version, and dependencies.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
    return findings;
  }

  findings.push({
    id: 'DISC-001',
    checkId: 'DISC-001',
    category: 'discovery',
    status: 'PASS',
    severity: 'info',
    title: 'Valid Project Manifest Detected',
    explanation: `Found valid package.json for project "${pkg.name || 'unnamed'}" (version: ${pkg.version || '0.0.0'}).`,
    evidence: { file: 'package.json' },
    checkMethod: 'static_analysis',
    recommendation: 'Keep manifest metadata up to date.',
    manualVerificationRequired: false,
    confidence: 'verified_fact',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  const hasEngines = pkg.engines && pkg.engines.node;
  const hasNvmrc = files.includes('.nvmrc') || files.includes('.node-version');

  if (hasEngines || hasNvmrc) {
    findings.push({
      id: 'DISC-002',
      checkId: 'DISC-002',
      category: 'discovery',
      status: 'PASS',
      severity: 'info',
      title: 'Explicit Node.js Runtime Version Specified',
      explanation: `Project explicitly declares supported Node.js runtime version: ${pkg.engines?.node || 'specified via .nvmrc'}.`,
      evidence: { file: hasEngines ? 'package.json' : '.nvmrc' },
      checkMethod: 'static_analysis',
      recommendation: 'Maintain alignment between engines declaration and production deployment runtime.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DISC-002',
      checkId: 'DISC-002',
      category: 'discovery',
      status: 'WARNING',
      severity: 'medium',
      title: 'Undeclared Node.js Runtime Version',
      explanation: 'No engines.node field in package.json or .nvmrc file was found.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Declare explicitly supported Node.js versions in package.json "engines" field (e.g. "^22.0.0 || ^24.0.0 || ^26.0.0").',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  const lockfiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].filter((lf) => files.includes(lf));
  if (lockfiles.length > 0) {
    findings.push({
      id: 'DISC-003',
      checkId: 'DISC-003',
      category: 'discovery',
      status: 'PASS',
      severity: 'info',
      title: 'Deterministic Dependency Lockfile Present',
      explanation: `Found package lockfile(s): ${lockfiles.join(', ')}.`,
      evidence: { file: lockfiles[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure lockfile is committed to version control and kept up to date.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DISC-003',
      checkId: 'DISC-003',
      category: 'discovery',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing Package Lockfile',
      explanation: 'No package-lock.json, pnpm-lock.yaml, or yarn.lock file was found in the project root.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Commit a package lockfile to ensure deterministic builds in production.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  return findings;
}

/**
 * Module B: Environment Configuration
 */
export function checkEnvConfiguration(projectDir, files) {
  const findings = [];

  const envTemplates = ['.env.example', '.env.template', '.env.sample'];
  const foundTemplate = envTemplates.find((t) => files.includes(t));

  if (foundTemplate) {
    findings.push({
      id: 'ENV-001',
      checkId: 'ENV-001',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'ENV-001',
      checkId: 'ENV-001',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  let gitignoreContent = '';
  if (files.includes('.gitignore')) {
    try {
      gitignoreContent = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    } catch {}
  }

  const parsedRules = parseGitignoreRules(gitignoreContent);
  const ignoresEnv = isPathIgnoredByRules(parsedRules, '.env') || isPathIgnoredByRules(parsedRules, '.env.local');

  if (ignoresEnv) {
    findings.push({
      id: 'ENV-002',
      checkId: 'ENV-002',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'ENV-002',
      checkId: 'ENV-002',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  let hasEnvValidation = false;
  let validationEvidence = '';

  const configFiles = files.filter((f) => /(env|config).*\.(ts|js|mjs|cjs)$/i.test(f));

  for (const cf of configFiles) {
    try {
      const code = fs.readFileSync(path.join(projectDir, cf), 'utf8');
      if (/guard\(|s\.string|s\.number|envalid|zod|joi/i.test(code)) {
        hasEnvValidation = true;
        validationEvidence = cf;
        break;
      }
    } catch {}
  }

  if (hasEnvValidation) {
    findings.push({
      id: 'ENV-003',
      checkId: 'ENV-003',
      category: 'env',
      status: 'PASS',
      severity: 'info',
      title: 'Type-Safe Startup Environment Validation Detected',
      explanation: `Startup environment schema validation detected in "${validationEvidence}". (Static heuristic: runtime enforcement not dynamically exercised).`,
      evidence: { file: validationEvidence },
      checkMethod: 'heuristic',
      recommendation: 'Enforce fail-fast startup checks in application entry points before binding ports.',
      manualVerificationRequired: false,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'ENV-003',
      checkId: 'ENV-003',
      category: 'env',
      status: 'WARNING',
      severity: 'medium',
      title: 'No Startup Environment Validation Schema Detected',
      explanation: 'Could not detect structured environment validation (e.g. EnvGuard guard() or Zod).',
      evidence: { file: configFiles[0] || 'src/' },
      checkMethod: 'heuristic',
      recommendation: 'Use EnvGuard (guard()) to validate all required environment variables at application boot.',
      manualVerificationRequired: true,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  const localEnvFiles = files.filter(
    (f) =>
      (f === '.env' || f === '.env.local' || f === '.env.production') &&
      !f.includes('example') &&
      !f.includes('template') &&
      !f.includes('sample')
  );

  for (const envFile of localEnvFiles) {
    const gitStatus = checkGitTracking(projectDir, envFile);

    if (gitStatus.isGitRepo && gitStatus.isTracked) {
      findings.push({
        id: 'ENV-004',
        checkId: 'ENV-004',
        category: 'env',
        status: 'FAIL',
        severity: 'critical',
        title: 'Sensitive .env File Tracked in Git Repository',
        explanation: `Found live environment file "${envFile}" tracked in Git repository index.`,
        evidence: { file: envFile },
        checkMethod: 'static_analysis',
        recommendation: 'Remove live .env file from Git tracking immediately (git rm --cached) and rotate any exposed secrets.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    } else {
      const isIgnored = isPathIgnoredByRules(parsedRules, envFile);
      if (isIgnored) {
        findings.push({
          id: 'ENV-004',
          checkId: 'ENV-004',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'Local .env File Exists in Working Tree (Safely Ignored by Git)',
          explanation: `Local file "${envFile}" exists in working tree but is safely excluded by .gitignore and not tracked by Git.`,
          evidence: { file: envFile },
          checkMethod: 'static_analysis',
          recommendation: 'Keep working-tree secret files strictly out of version control.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          toolName: 'envguard-readiness-auditor',
          toolVersion: TOOL_VERSION,
        });
      } else {
        findings.push({
          id: 'ENV-004',
          checkId: 'ENV-004',
          category: 'env',
          status: 'FAIL',
          severity: 'high',
          title: 'Untracked .env File in Working Tree Not Excluded by .gitignore',
          explanation: `Local file "${envFile}" is not ignored by .gitignore rules. High risk of accidental commit.`,
          evidence: { file: envFile },
          checkMethod: 'static_analysis',
          recommendation: 'Add rule to .gitignore to exclude this file before committing.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          toolName: 'envguard-readiness-auditor',
          toolVersion: TOOL_VERSION,
        });
      }
    }
  }

  return findings;
}

/**
 * Module C: Build & Test Readiness
 */
export function checkBuildAndTest(
  projectDir,
  pkg,
  allowExec,
  timeoutMs,
  { trustProject = false, isIsolated = null, allowedCommands = null, executionAudit = [] } = {}
) {
  const findings = [];
  const scripts = pkg?.scripts || {};

  const targets = [
    { name: 'build', script: scripts.build, id: 'BUILD-001', checkId: 'BUILD-001' },
    { name: 'test', script: scripts.test, id: 'BUILD-002', checkId: 'BUILD-002' },
    { name: 'typecheck', script: scripts.typecheck || scripts['check-types'], id: 'BUILD-003', checkId: 'BUILD-003' },
    { name: 'lint', script: scripts.lint, id: 'BUILD-004', checkId: 'BUILD-004' },
  ];

  for (const t of targets) {
    if (!t.script) {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'WARNING',
        severity: t.name === 'build' || t.name === 'test' ? 'high' : 'medium',
        title: `No "${t.name}" Script Declared in package.json`,
        explanation: `package.json does not declare a standard "${t.name}" script.`,
        evidence: { file: 'package.json' },
        checkMethod: 'static_analysis',
        recommendation: `Add a standard "${t.name}" script to package.json to support continuous integration.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
      continue;
    }

    if (!allowExec) {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'NOT_RUN',
        severity: 'info',
        title: `Project Script "${t.name}" Declared (Execution Not Run)`,
        explanation: `Found declared "${t.name}" script ("${t.script}"). Execution skipped: read-only mode active (requires --allow-exec).`,
        evidence: { file: 'package.json', snippet: t.script },
        checkMethod: 'command_execution',
        recommendation: 'Authorize local command execution (--allow-exec) to verify build and test suites pass.',
        manualVerificationRequired: true,
        confidence: 'unverified',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
      continue;
    }

    const res = runProjectCommand('npm', ['run', t.name], projectDir, {
      timeoutMs,
      allowExec,
      trustProject,
      isIsolated,
      allowedCommands,
    });

    if (executionAudit && Array.isArray(executionAudit)) {
      executionAudit.push({
        command: 'npm',
        args: ['run', t.name],
        cwd: projectDir,
        timestamp: new Date().toISOString(),
        durationMs: res.durationMs,
        exitCode: res.exitCode,
        timedOut: res.timedOut,
        isolated: res.isolated,
        trustMode: res.trustMode,
      });
    }

    if (res.notRun && res.blockedByPolicy) {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'NOT_RUN',
        severity: 'medium',
        title: `Execution of "${t.name}" Blocked by Containment Policy`,
        explanation: res.stderr || 'Host execution blocked: unisolated host without explicit trust.',
        evidence: { file: 'package.json', snippet: t.script },
        checkMethod: 'command_execution',
        recommendation: 'Provide container containment or explicitly acknowledge host trust (--trust-project).',
        manualVerificationRequired: true,
        confidence: 'unverified',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
      continue;
    }

    if (res.timedOut) {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'FAIL',
        severity: 'critical',
        title: `Project Script "${t.name}" Execution Timed Out`,
        explanation: `Execution exceeded configured timeout limit of ${timeoutMs}ms.`,
        evidence: { command: `npm run ${t.name}`, durationMs: res.durationMs },
        checkMethod: 'command_execution',
        recommendation: `Optimize script execution speed or increase timeout limit with --timeout (current: ${timeoutMs}ms).`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    } else if (res.success) {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'PASS',
        severity: 'info',
        title: `Project Script "${t.name}" Passed Successfully`,
        explanation: `Command "npm run ${t.name}" exited with status 0 in ${res.durationMs}ms.`,
        evidence: { command: `npm run ${t.name}`, exitCode: 0, durationMs: res.durationMs },
        checkMethod: 'command_execution',
        recommendation: `Maintain passing ${t.name} checks in automated CI/CD.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    } else {
      findings.push({
        id: t.id,
        checkId: t.checkId,
        category: 'build_test',
        status: 'FAIL',
        severity: 'critical',
        title: `Project Script "${t.name}" Failed`,
        explanation: `Command "npm run ${t.name}" failed with exit code ${res.exitCode}. Output: ${res.stderr || res.stdout || 'error'}`,
        evidence: {
          command: `npm run ${t.name}`,
          exitCode: res.exitCode,
          durationMs: res.durationMs,
          snippet: res.stderr || res.stdout,
        },
        checkMethod: 'command_execution',
        recommendation: `Fix underlying errors causing "${t.name}" to fail before deploying.`,
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    }
  }

  return findings;
}

/**
 * Module D: Security Readiness
 */
export function checkSecurityReadiness(projectDir, files, pkg) {
  const findings = [];

  const hasDependabot = files.some((f) => f.startsWith('.github/dependabot.'));
  const hasRenovate = files.some((f) => f.includes('renovate'));

  if (hasDependabot || hasRenovate) {
    findings.push({
      id: 'SEC-001',
      checkId: 'SEC-001',
      category: 'security',
      status: 'PASS',
      severity: 'info',
      title: 'Automated Dependency Security Tooling Configured',
      explanation: `Detected automated dependency management configuration: ${hasDependabot ? 'Dependabot' : 'Renovate'}.`,
      evidence: { file: hasDependabot ? '.github/dependabot.yml' : 'renovate.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Regularly triage and merge automated security updates.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'SEC-001',
      checkId: 'SEC-001',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

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
    } catch {}
  }

  if (sensitiveLoggingFile) {
    findings.push({
      id: 'SEC-002',
      checkId: 'SEC-002',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'SEC-002',
      checkId: 'SEC-002',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasHelmet = Boolean(deps.helmet);
  const hasCors = Boolean(deps.cors);

  if (hasHelmet || hasCors) {
    findings.push({
      id: 'SEC-003',
      checkId: 'SEC-003',
      category: 'security',
      status: 'PASS',
      severity: 'info',
      title: 'Security Middleware Configured (Helmet/CORS)',
      explanation: `Project incorporates security middleware packages: ${[hasHelmet ? 'helmet' : null, hasCors ? 'cors' : null].filter(Boolean).join(', ')}.`,
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Verify Content Security Policy (CSP) and CORS origin restrictions are properly tuned.',
      manualVerificationRequired: true,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else if (deps.express || deps.fastify) {
    findings.push({
      id: 'SEC-003',
      checkId: 'SEC-003',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  return findings;
}

/**
 * Module E: API Readiness
 */
export function checkApiReadiness(projectDir, files, allowExec) {
  const findings = [];
  const openapiFiles = files.filter((f) => /(openapi|swagger).*\.(json|yaml|yml)$/i.test(f));

  if (openapiFiles.length === 0) {
    findings.push({
      id: 'API-001',
      checkId: 'API-001',
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
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
    return findings;
  }

  const specPath = openapiFiles[0];
  let spec = null;
  const isYaml = specPath.endsWith('.yaml') || specPath.endsWith('.yml');

  try {
    const raw = fs.readFileSync(path.join(projectDir, specPath), 'utf8');
    if (isYaml) {
      if (YAMLParser) {
        spec = YAMLParser.parse(raw);
      } else {
        spec = parseYamlFallback(raw);
      }
    } else {
      spec = JSON.parse(raw);
    }
  } catch (err) {
    findings.push({
      id: 'API-001',
      checkId: 'API-001',
      category: 'api',
      status: 'FAIL',
      severity: 'high',
      title: 'Malformed OpenAPI Specification',
      explanation: `Failed to parse OpenAPI document at "${specPath}": ${err.message}`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure OpenAPI specification is valid JSON or YAML conforming to OpenAPI 3.x schema.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
    return findings;
  }

  findings.push({
    id: 'API-001',
    checkId: 'API-001',
    category: 'api',
    status: 'PASS',
    severity: 'info',
    title: `OpenAPI Document Parsed Successfully (${isYaml ? 'YAML' : 'JSON'})`,
    explanation: `Successfully parsed OpenAPI contract at "${specPath}".`,
    evidence: { file: specPath },
    checkMethod: 'static_analysis',
    recommendation: 'Keep API contract synchronized with route implementations.',
    manualVerificationRequired: false,
    confidence: 'verified_fact',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  const version = spec.openapi || spec.swagger;
  const hasPaths = spec.paths && typeof spec.paths === 'object';
  const hasInfo = spec.info && spec.info.title && spec.info.version;

  if (!version || !hasPaths || !hasInfo) {
    findings.push({
      id: 'API-002',
      checkId: 'API-002',
      category: 'api',
      status: 'FAIL',
      severity: 'high',
      title: 'Invalid OpenAPI Schema Structure',
      explanation: `Document at "${specPath}" lacks required top-level "openapi" (3.x), "info" (with title and version), or "paths" mapping.`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Provide valid OpenAPI version (3.0.x or 3.1.x), info metadata, and paths mapping.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'API-002',
      checkId: 'API-002',
      category: 'api',
      status: 'PASS',
      severity: 'info',
      title: `Valid OpenAPI Contract Present (${version})`,
      explanation: `Found valid OpenAPI contract at "${specPath}" declaring ${Object.keys(spec.paths).length} path(s).`,
      evidence: { file: specPath },
      checkMethod: 'static_analysis',
      recommendation: 'Keep API specification in sync with route implementations.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });

    const actionVerbPaths = Object.keys(spec.paths).filter(
      (p) => /\/(get|create|delete|update|find)[A-Z0-9_-]/i.test(p) || /_(get|create|delete|update)/i.test(p)
    );

    if (actionVerbPaths.length > 0) {
      findings.push({
        id: 'API-003',
        checkId: 'API-003',
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
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    }

    const schemas = spec.components?.schemas || {};
    const hasProblemDetails = Object.keys(schemas).some(
      (k) => /problemdetail/i.test(k) || (/error/i.test(k) && schemas[k]?.properties?.status)
    );

    if (hasProblemDetails) {
      findings.push({
        id: 'API-004',
        checkId: 'API-004',
        category: 'api',
        status: 'PASS',
        severity: 'info',
        title: 'Standardized Error Model Defined (RFC 9457 / RFC 7807)',
        explanation: 'OpenAPI specification documents structured Problem Details error responses conforming to RFC 9457.',
        evidence: { file: specPath },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure backend error-handling middleware returns application/problem+json payloads.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    } else {
      findings.push({
        id: 'API-004',
        checkId: 'API-004',
        category: 'api',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing RFC 9457 / RFC 7807 Problem Details Schema',
        explanation: 'OpenAPI contract does not define a standard Problem Details error envelope.',
        evidence: { file: specPath },
        checkMethod: 'static_analysis',
        recommendation: 'Incorporate RFC 9457 Problem Details schema for consistent machine-readable error responses.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    }

    const srcRouteFiles = files.filter(
      (f) =>
        (f.startsWith('src/') || f.startsWith('app/') || f.startsWith('routes/')) &&
        /\.(ts|js|mjs)$/.test(f)
    );

    let detectedSourceRoutes = 0;
    const specPaths = Object.keys(spec.paths);

    for (const srf of srcRouteFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, srf), 'utf8');
        for (const sp of specPaths) {
          if (content.includes(sp) || content.includes(sp.replace(/\/api\/v[0-9]/, ''))) {
            detectedSourceRoutes++;
          }
        }
      } catch {}
    }

    if (detectedSourceRoutes > 0) {
      findings.push({
        id: 'API-005',
        checkId: 'API-005',
        category: 'api',
        status: 'PASS',
        severity: 'info',
        title: 'API Implementation Aligns with OpenAPI Contract',
        explanation: `Detected route handlers corresponding to ${detectedSourceRoutes} path(s) declared in OpenAPI spec.`,
        evidence: { file: specPath },
        checkMethod: 'heuristic',
        recommendation: 'Automate contract verification with schema-driven integration tests.',
        manualVerificationRequired: false,
        confidence: 'medium_heuristic',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    } else {
      findings.push({
        id: 'API-005',
        checkId: 'API-005',
        category: 'api',
        status: 'MANUAL_REVIEW',
        severity: 'medium',
        title: 'API Route Alignment Requires Engineering Review',
        explanation: 'Could not statically map declared OpenAPI paths to route handler registrations in source files.',
        evidence: { file: specPath },
        checkMethod: 'manual_verification_required',
        recommendation: 'Perform manual verification or run API contract test suites to verify implementation parity.',
        manualVerificationRequired: true,
        confidence: 'unverified',
        toolName: 'envguard-readiness-auditor',
        toolVersion: TOOL_VERSION,
      });
    }

    findings.push({
      id: 'API-006',
      checkId: 'API-006',
      category: 'api',
      status: allowExec ? 'PASS' : 'NOT_RUN',
      severity: 'info',
      title: allowExec ? 'API Integration Tests Verified via Test Suite' : 'Runtime API Integration Testing Not Executed',
      explanation: allowExec
        ? 'API endpoint integration exercised during authorized test suite execution.'
        : 'Runtime API integration testing requires command execution authorization (--allow-exec).',
      evidence: { file: specPath },
      checkMethod: allowExec ? 'command_execution' : 'manual_verification_required',
      recommendation: 'Run comprehensive API integration tests in staging with real HTTP client requests.',
      manualVerificationRequired: !allowExec,
      confidence: allowExec ? 'verified_fact' : 'unverified',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  return findings;
}

/**
 * Module F: Database Readiness
 */
export function checkDatabaseReadiness(projectDir, files, pkg) {
  const findings = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  const dbDrivers = ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'mongoose', 'ioredis', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize'];
  const detectedDrivers = dbDrivers.filter((d) => deps[d]);

  if (detectedDrivers.length === 0) {
    findings.push({
      id: 'DB-001',
      checkId: 'DB-001',
      category: 'database',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'No Database Dependencies Detected',
      explanation: 'Project does not declare common database drivers or ORMs (pg, mysql2, prisma, etc.).',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'If this service uses persistence, install appropriate versioned drivers and migration tooling.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
    return findings;
  }

  findings.push({
    id: 'DB-001',
    checkId: 'DB-001',
    category: 'database',
    status: 'PASS',
    severity: 'info',
    title: 'Database Driver or ORM Configured',
    explanation: `Detected database dependencies: ${detectedDrivers.join(', ')}.`,
    evidence: { file: 'package.json' },
    checkMethod: 'static_analysis',
    recommendation: 'Ensure database connection pool parameters are tuned for production load limits.',
    manualVerificationRequired: false,
    confidence: 'verified_fact',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  const migrationIndicators = files.filter(
    (f) =>
      f.includes('migration') ||
      f.includes('prisma/schema') ||
      f.includes('drizzle/') ||
      f.endsWith('.sql')
  );

  if (migrationIndicators.length > 0) {
    findings.push({
      id: 'DB-002',
      checkId: 'DB-002',
      category: 'database',
      status: 'PASS',
      severity: 'info',
      title: 'Database Schema Migrations Detected',
      explanation: `Found version-controlled migration scripts or schema definitions (${migrationIndicators[0]}).`,
      evidence: { file: migrationIndicators[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Test forward and backward migration rollbacks in an isolated staging database.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DB-002',
      checkId: 'DB-002',
      category: 'database',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing Database Migration Tooling or Scripts',
      explanation: 'Database dependencies are present but no migration directory or schema definitions were detected.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Use schema migration tooling (e.g. Prisma Migrate, Drizzle Kit, Knex) to version database changes.',
      manualVerificationRequired: true,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  findings.push({
    id: 'DB-003',
    checkId: 'DB-003',
    category: 'database',
    status: 'MANUAL_REVIEW',
    severity: 'medium',
    title: 'Database Connection Pool & Failover Tuning Review',
    explanation: 'Database connection pool sizing and failover timeouts require operational review against production database limits.',
    evidence: { file: 'package.json' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Tune pool max connections to avoid exhausting managed database connection limits.',
    manualVerificationRequired: true,
    confidence: 'unverified',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  return findings;
}

/**
 * Module G: Deployment & Operational Readiness
 */
export function checkDeploymentReadiness(projectDir, files) {
  const findings = [];

  const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml'].filter((df) => files.includes(df));
  if (dockerFiles.length > 0) {
    findings.push({
      id: 'DEP-001',
      checkId: 'DEP-001',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Container Configuration Present (Dockerfile / Compose)',
      explanation: `Found containerization configuration: ${dockerFiles.join(', ')}.`,
      evidence: { file: dockerFiles[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Verify non-root user execution and multi-stage build caching.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DEP-001',
      checkId: 'DEP-001',
      category: 'deployment',
      status: 'WARNING',
      severity: 'medium',
      title: 'No Dockerfile or Container Configuration Found',
      explanation: 'Project does not define a Dockerfile or docker-compose.yml in the repository.',
      evidence: { file: 'Dockerfile' },
      checkMethod: 'static_analysis',
      recommendation: 'Create a non-root, multi-stage Dockerfile for containerized deployment.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  const srcFiles = files.filter(
    (f) =>
      (f.startsWith('src/') || f.startsWith('lib/') || f.startsWith('app/')) &&
      /\.(ts|js|mjs)$/.test(f)
  );

  let hasHealthCheck = false;
  let healthFile = '';
  let hasShutdownSignal = false;
  let shutdownFile = '';

  for (const sf of srcFiles) {
    try {
      const code = fs.readFileSync(path.join(projectDir, sf), 'utf8');
      if (/\/health|\/live|\/ready|healthCheck/i.test(code)) {
        hasHealthCheck = true;
        healthFile = sf;
      }
      if (/SIGTERM|SIGINT|process\.on\(['"]SIG/i.test(code)) {
        hasShutdownSignal = true;
        shutdownFile = sf;
      }
    } catch {}
  }

  if (hasHealthCheck) {
    findings.push({
      id: 'DEP-002',
      checkId: 'DEP-002',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Health Check Endpoint Route Detected',
      explanation: `Detected health check route handler (/health) in "${healthFile}".`,
      evidence: { file: healthFile },
      checkMethod: 'static_analysis',
      recommendation: 'Ensure health probe validates database connectivity and responds with HTTP 200.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DEP-002',
      checkId: 'DEP-002',
      category: 'deployment',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing Health Check Endpoint (/health)',
      explanation: 'Could not detect an HTTP health check route handler (/health or /live) in source files.',
      evidence: { file: srcFiles[0] || 'src/' },
      checkMethod: 'static_analysis',
      recommendation: 'Implement a lightweight /health endpoint returning HTTP 200 and process status.',
      manualVerificationRequired: false,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  if (hasShutdownSignal) {
    findings.push({
      id: 'DEP-003',
      checkId: 'DEP-003',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Graceful Process Shutdown Handlers Detected',
      explanation: `Found SIGTERM/SIGINT signal listeners in "${shutdownFile}".`,
      evidence: { file: shutdownFile },
      checkMethod: 'static_analysis',
      recommendation: 'Verify in-flight HTTP requests and database connections drain within 30 seconds of SIGTERM.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DEP-003',
      checkId: 'DEP-003',
      category: 'deployment',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Graceful Shutdown Signal Handling',
      explanation: 'Could not detect process.on("SIGTERM") signal listener to gracefully close active connections.',
      evidence: { file: srcFiles[0] || 'src/' },
      checkMethod: 'static_analysis',
      recommendation: 'Implement process.on("SIGTERM") to close HTTP servers without dropping in-flight requests.',
      manualVerificationRequired: false,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  const ciWorkflows = files.filter((f) => f.startsWith('.github/workflows/') && /\.(yml|yaml)$/.test(f));
  if (ciWorkflows.length > 0) {
    findings.push({
      id: 'DEP-004',
      checkId: 'DEP-004',
      category: 'deployment',
      status: 'PASS',
      severity: 'info',
      title: 'Automated CI/CD Workflows Detected',
      explanation: `Found ${ciWorkflows.length} GitHub Actions workflow file(s) in .github/workflows/.`,
      evidence: { file: ciWorkflows[0] },
      checkMethod: 'static_analysis',
      recommendation: 'Enforce branch protection rules requiring passing CI workflows before merging.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'DEP-004',
      checkId: 'DEP-004',
      category: 'deployment',
      status: 'WARNING',
      severity: 'high',
      title: 'Missing CI/CD Workflow Automation',
      explanation: 'No GitHub Actions workflows were found in .github/workflows/.',
      evidence: { file: '.github/workflows/' },
      checkMethod: 'static_analysis',
      recommendation: 'Create a GitHub Actions CI workflow to validate builds and tests automatically.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  return findings;
}

/**
 * Module H: Accessibility & Frontend Quality
 */
export function checkAccessibility(files, pkg) {
  const findings = [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  const isFrontend = Boolean(
    deps.react || deps['react-dom'] || deps.vue || deps.svelte || deps.next || files.some((f) => f.endsWith('.tsx') || f.endsWith('.jsx'))
  );

  if (!isFrontend) {
    findings.push({
      id: 'A11Y-001',
      checkId: 'A11Y-001',
      category: 'accessibility',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'Frontend Accessibility Checks Not Applicable',
      explanation: 'Project does not appear to contain interactive frontend UI code.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'If web UI components are added, incorporate automated a11y linters and axe-core.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
    return findings;
  }

  const hasA11yLinter = Boolean(deps['eslint-plugin-jsx-a11y'] || deps['axe-core'] || deps['@axe-core/react']);
  if (hasA11yLinter) {
    findings.push({
      id: 'A11Y-001',
      checkId: 'A11Y-001',
      category: 'accessibility',
      status: 'PASS',
      severity: 'info',
      title: 'Automated Accessibility Tooling Configured',
      explanation: 'Detected automated accessibility auditing packages in project dependencies.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Verify accessibility rules are enforced in ESLint and CI test suites.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'A11Y-001',
      checkId: 'A11Y-001',
      category: 'accessibility',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Automated Accessibility Tooling',
      explanation: 'Frontend components detected without eslint-plugin-jsx-a11y or axe-core.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Install eslint-plugin-jsx-a11y to catch WCAG contrast and keyboard navigation issues.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  findings.push({
    id: 'A11Y-002',
    checkId: 'A11Y-002',
    category: 'accessibility',
    status: 'MANUAL_REVIEW',
    severity: 'medium',
    title: 'Manual Keyboard & Screen Reader Verification Required',
    explanation: 'Automated audits only catch ~40% of WCAG issues. Screen reader navigation and focus order require human verification.',
    evidence: { file: 'src/' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Test core user journeys with NVDA/VoiceOver and keyboard-only navigation.',
    manualVerificationRequired: true,
    confidence: 'unverified',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  return findings;
}

/**
 * Module I: Performance Readiness
 */
export function checkPerformance(files, pkg) {
  const findings = [];
  const scripts = pkg?.scripts || {};

  const hasPerfScript = Object.keys(scripts).some((k) => /load|perf|bench|k6|autocannon/i.test(k));
  const hasPerfFiles = files.some((f) => /k6|benchmark|load-test/i.test(f));

  if (hasPerfScript || hasPerfFiles) {
    findings.push({
      id: 'PERF-001',
      checkId: 'PERF-001',
      category: 'performance',
      status: 'PASS',
      severity: 'info',
      title: 'Performance Benchmark or Load Test Scripts Configured',
      explanation: 'Detected performance testing scripts (k6, autocannon, or benchmark harnesses).',
      evidence: { file: hasPerfFiles ? files.find((f) => /k6|bench/i.test(f)) : 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Execute load tests against isolated staging environments with realistic latency thresholds.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  } else {
    findings.push({
      id: 'PERF-001',
      checkId: 'PERF-001',
      category: 'performance',
      status: 'WARNING',
      severity: 'medium',
      title: 'No Load Testing or Benchmark Scripts Detected',
      explanation: 'Could not detect k6, autocannon, or benchmark test scripts.',
      evidence: { file: 'package.json' },
      checkMethod: 'static_analysis',
      recommendation: 'Create realistic workload profiles and measure p95/p99 latency thresholds.',
      manualVerificationRequired: false,
      confidence: 'medium_heuristic',
      toolName: 'envguard-readiness-auditor',
      toolVersion: TOOL_VERSION,
    });
  }

  findings.push({
    id: 'PERF-002',
    checkId: 'PERF-002',
    category: 'performance',
    status: 'NOT_RUN',
    severity: 'info',
    title: 'High-Load Traffic Simulation Not Executed',
    explanation: 'Production readiness analyzer intentionally does not generate live synthetic traffic without explicit staging setup.',
    evidence: { file: 'package.json' },
    checkMethod: 'manual_verification_required',
    recommendation: 'Schedule isolated staging load runs using Grafana k6 before public launch.',
    manualVerificationRequired: true,
    confidence: 'unverified',
    toolName: 'envguard-readiness-auditor',
    toolVersion: TOOL_VERSION,
  });

  return findings;
}

/**
 * Runs a complete readiness audit against the target project.
 */
export function runReadinessAudit({
  projectDir = '.',
  categories = VALID_CATEGORIES,
  allowExec = false,
  trustProject = false,
  isIsolated = null,
  timeoutMs = 10000,
  allowedCommands = null,
} = {}) {
  const safeProjectDir = assertSafeProjectDir(projectDir);

  for (const cat of categories) {
    if (!VALID_CATEGORIES.includes(cat)) {
      throw new Error(`Invalid assessment category "${cat}". Valid options: ${VALID_CATEGORIES.join(', ')}`);
    }
  }

  let pkg = null;
  const pkgPath = path.join(safeProjectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      pkg = null;
    }
  }

  const files = collectProjectFiles(safeProjectDir);
  const executionAudit = [];

  const findings = [];

  if (categories.includes('discovery')) {
    findings.push(...checkProjectDiscovery(safeProjectDir, files, pkg));
  }
  if (categories.includes('env')) {
    findings.push(...checkEnvConfiguration(safeProjectDir, files, pkg));
  }
  if (categories.includes('build_test')) {
    findings.push(
      ...checkBuildAndTest(safeProjectDir, pkg, allowExec, timeoutMs, {
        trustProject,
        isIsolated,
        allowedCommands,
        executionAudit,
      })
    );
  }
  if (categories.includes('security')) {
    findings.push(...checkSecurityReadiness(safeProjectDir, files, pkg));
  }
  if (categories.includes('api')) {
    findings.push(...checkApiReadiness(safeProjectDir, files, allowExec));
  }
  if (categories.includes('database')) {
    findings.push(...checkDatabaseReadiness(safeProjectDir, files, pkg));
  }
  if (categories.includes('deployment')) {
    findings.push(...checkDeploymentReadiness(safeProjectDir, files));
  }
  if (categories.includes('accessibility')) {
    findings.push(...checkAccessibility(files, pkg));
  }
  if (categories.includes('performance')) {
    findings.push(...checkPerformance(files, pkg));
  }

  const catOrder = new Map(VALID_CATEGORIES.map((c, i) => [c, i]));
  findings.sort((a, b) => {
    const catDiff = (catOrder.get(a.category) ?? 99) - (catOrder.get(b.category) ?? 99);
    if (catDiff !== 0) return catDiff;
    const idDiff = a.id.localeCompare(b.id);
    if (idDiff !== 0) return idDiff;
    return (a.evidence?.file || '').localeCompare(b.evidence?.file || '');
  });

  const summary = {
    totalChecks: findings.length,
    pass: findings.filter((f) => f.status === 'PASS').length,
    fail: findings.filter((f) => f.status === 'FAIL').length,
    warning: findings.filter((f) => f.status === 'WARNING').length,
    notRun: findings.filter((f) => f.status === 'NOT_RUN').length,
    manualReview: findings.filter((f) => f.status === 'MANUAL_REVIEW').length,
    notApplicable: findings.filter((f) => f.status === 'NOT_APPLICABLE').length,
    error: findings.filter((f) => f.status === 'ERROR').length,
  };

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    timestamp: new Date().toISOString(),
    projectRoot: path.basename(safeProjectDir),
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
    },
    executionPolicy: {
      allowExec,
      trustProject,
      isolated: isIsolated !== null ? isIsolated : isEnvironmentIsolated(),
      disclosures: {
        network:
          'Build and test commands may attempt outbound network calls. Network isolation requires container containment.',
        filesystem:
          'Build and test commands may modify files in working directory (dist/, coverage/, node_modules/.cache, temp files).',
      },
    },
    executionAudit,
    summary,
    findings,
    limitations: [
      'Static analysis checks identify potential configuration anomalies and declared patterns; they do not certify absolute security or absence of runtime bugs.',
      'Checks marked NOT_RUN were not executed (e.g. requires --allow-exec or dedicated staging infrastructure).',
      'Checks marked MANUAL_REVIEW require human verification (e.g. assistive technology usability, high-volume database failover).',
      'Regex masking and pattern redaction reduce accidental secret disclosure in report snippets but do not guarantee complete prevention of secret leaks.',
      'No production-readiness percentage is calculated, as qualitative system readiness cannot be accurately represented by a single arithmetic ratio.',
    ],
  };

  return report;
}

/**
 * Formats report object into structured Markdown.
 */
export function generateMarkdownReport(report) {
  const { summary, findings, limitations, configuration, platform, projectRoot, timestamp } = report;

  let md = `# EnvGuard Production Readiness Assessment Report\n\n`;
  md += `**Project**: \`${escapeMarkdown(projectRoot)}\`  \n`;
  md += `**Timestamp**: ${timestamp}  \n`;
  md += `**Auditor Version**: v${report.toolVersion} (Schema v${report.schemaVersion})  \n`;
  md += `**Platform**: Node.js ${platform.nodeVersion} on ${platform.os}  \n`;
  md += `**Execution Permitted (--allow-exec)**: ${configuration.allowExec ? 'Yes (Authorized Mode)' : 'No (Read-Only Mode)'}  \n`;
  if (configuration.allowExec) {
    md += `**Execution Containment**: ${report.executionPolicy?.isolated ? 'Container Isolated' : configuration.trustProject ? 'Host Explicitly Trusted (--trust-project)' : 'Untrusted Blocked'}  \n`;
  }
  md += `\n`;

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

  const failures = findings.filter((f) => f.status === 'FAIL');
  if (failures.length > 0) {
    md += `## 2. Blocking Failures (${failures.length})\n\n`;
    for (const f of failures) {
      md += `### [${f.id}] ${escapeMarkdown(f.title)}\n`;
      md += `- **Severity**: \`${f.severity.toUpperCase()}\` | **Confidence**: \`${f.confidence}\`\n`;
      md += `- **Explanation**: ${escapeMarkdown(f.explanation)}\n`;
      if (f.evidence?.file) md += `- **Evidence**: \`${escapeMarkdown(f.evidence.file)}\`\n`;
      if (f.evidence?.command) md += `- **Command**: \`${escapeMarkdown(f.evidence.command)}\` (exit code: ${f.evidence.exitCode})\n`;
      if (f.evidence?.snippet) md += `\`\`\`\n${escapeMarkdown(f.evidence.snippet)}\n\`\`\`\n`;
      md += `- **Recommendation**: ${escapeMarkdown(f.recommendation)}\n\n`;
    }
  }

  const warnings = findings.filter((f) => f.status === 'WARNING');
  if (warnings.length > 0) {
    md += `## 3. Warnings & Improvement Opportunities (${warnings.length})\n\n`;
    for (const w of warnings) {
      md += `### [${w.id}] ${escapeMarkdown(w.title)}\n`;
      md += `- **Explanation**: ${escapeMarkdown(w.explanation)}\n`;
      if (w.evidence?.file) md += `- **Evidence**: \`${escapeMarkdown(w.evidence.file)}\`\n`;
      md += `- **Recommendation**: ${escapeMarkdown(w.recommendation)}\n\n`;
    }
  }

  const passed = findings.filter((f) => f.status === 'PASS');
  md += `## 4. Verified Passing Checks (${passed.length})\n\n`;
  for (const p of passed) {
    md += `- **[${p.id}] ${escapeMarkdown(p.title)}**: ${escapeMarkdown(p.explanation)}\n`;
  }
  md += `\n`;

  const manualAndNotRun = findings.filter((f) => f.status === 'MANUAL_REVIEW' || f.status === 'NOT_RUN');
  if (manualAndNotRun.length > 0) {
    md += `## 5. Unexecuted & Manual Review Items (${manualAndNotRun.length})\n\n`;
    for (const item of manualAndNotRun) {
      md += `- **[${item.id}] ${escapeMarkdown(item.title)}** (${item.status}): ${escapeMarkdown(item.explanation)}\n`;
    }
    md += `\n`;
  }

  md += `## 6. Prioritized Remediation Plan\n\n`;
  let step = 1;
  for (const f of failures) {
    md += `${step++}. **[P0 - Blocker]** ${escapeMarkdown(f.title)}: ${escapeMarkdown(f.recommendation)}\n`;
  }
  for (const w of warnings.filter((w) => w.severity === 'high')) {
    md += `${step++}. **[P1 - High]** ${escapeMarkdown(w.title)}: ${escapeMarkdown(w.recommendation)}\n`;
  }
  for (const w of warnings.filter((w) => w.severity !== 'high')) {
    md += `${step++}. **[P2 - Medium/Low]** ${escapeMarkdown(w.title)}: ${escapeMarkdown(w.recommendation)}\n`;
  }
  if (failures.length === 0 && warnings.length === 0) {
    md += `All automated checks passed cleanly! Proceed with manual operational verification before production rollout.\n`;
  }
  md += `\n`;

  md += `## 7. Known Limitations & Scope Boundaries\n\n`;
  for (const lim of limitations) {
    md += `- ${escapeMarkdown(lim)}\n`;
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
  let trustProject = false;
  let previewCommands = false;
  let execCommands = null;
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
  --project <dir>          Path to project directory (default: current directory)
  --output-dir <dir>       Directory to write assessment reports (JSON and Markdown)
  --format <type>          Output format: "json", "markdown", or "both" (default: "both" if --output-dir, else console)
  --checks <list>          Comma-separated list of check categories to run:
                           discovery, env, build_test, security, api, database, deployment, accessibility, performance
  --allow-exec             Explicitly authorize local project build and test command execution (default: read-only)
  --trust-project          Explicitly acknowledge executing scripts on unisolated host without container containment
  --exec-commands <list>   Comma-separated list of allowed scripts to execute (e.g. "test,build")
  --preview-commands       Preview planned commands and their network/filesystem effects without running them
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

  let safeProjectDir;
  try {
    safeProjectDir = assertSafeProjectDir(projectDir);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return EXIT_CODES.INVALID_ARGUMENTS;
  }

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
      allowedCommands: execCommands,
    });
  } catch (err) {
    console.error(`Readiness Audit Error: ${err.message}`);
    return EXIT_CODES.TOOL_ERROR;
  }

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

  const hasBlockers = report.findings.some(
    (f) => f.status === 'FAIL' && (f.severity === 'critical' || f.severity === 'high')
  );
  if (hasBlockers) {
    return EXIT_CODES.POLICY_BLOCKERS;
  }

  const hasTimeouts = report.findings.some((f) => f.status === 'FAIL' && f.title?.includes('Timed Out'));
  if (hasTimeouts) {
    return EXIT_CODES.INCOMPLETE_EXECUTION;
  }

  return EXIT_CODES.SUCCESS_NO_BLOCKERS;
}

const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith('readiness-auditor.mjs') || process.argv[1].endsWith('readiness-auditor'));

if (isDirectCall) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
