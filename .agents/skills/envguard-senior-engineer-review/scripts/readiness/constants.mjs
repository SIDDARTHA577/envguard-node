import fs from 'node:fs';
import path from 'node:path';

export const TOOL_VERSION = '1.0.0';
export const REPORT_SCHEMA_VERSION = '1.1.0';

export const EXIT_CODES = {
  SUCCESS: 0,
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
  'INFORMATIONAL',
  'NOT_RUN',
  'MANUAL_REVIEW',
  'NOT_APPLICABLE',
  'ERROR',
];

/**
 * Granular verification states distinguishing dependency declaration from actual execution.
 */
export const TEST_VERIFICATION_STATES = {
  FRAMEWORK_DECLARED: 'FRAMEWORK_DECLARED',
  RUNNER_AVAILABLE: 'RUNNER_AVAILABLE',
  TEST_FILES_FOUND: 'TEST_FILES_FOUND',
  TEST_EXECUTED: 'TEST_EXECUTED',
  TESTS_PASSED: 'TESTS_PASSED',
  TESTS_FAILED: 'TESTS_FAILED',
  NOT_RUN: 'NOT_RUN',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
};

export const VALID_FORMATS = ['json', 'markdown', 'both'];

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.nuxt',
  '.output',
  'coverage',
  '.nyc_output',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
]);

/**
 * Strips ANSI terminal escape codes from output strings.
 */
export function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Sanitizes command output and error messages to prevent accidental secret leakage.
 * Redacts tokens, passwords, database URLs, and private keys.
 */
export function sanitizeOutput(str) {
  if (typeof str !== 'string') return '';
  let cleaned = stripAnsi(str);
  // Redact specific known key prefixes first
  cleaned = cleaned.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]');
  cleaned = cleaned.replace(/(ghp_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]');
  cleaned = cleaned.replace(/(sk_live_[A-Za-z0-9_]{16,})/gi, '[REDACTED_STRIPE_KEY]');
  cleaned = cleaned.replace(/(AKIA[0-9A-Z]{16})/gi, '[REDACTED_AWS_KEY]');
  cleaned = cleaned.replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/gi, '[REDACTED_SLACK_TOKEN]');
  cleaned = cleaned.replace(/(postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^:\s@]+:[^@\s]+@/gi, '$1://[REDACTED_CREDS]@');
  // Redact generic key=value pairs, ignoring already redacted values
  cleaned = cleaned.replace(/((?:password|secret|token|api_key|auth)\s*[:=]\s*['"]?)(?!\[REDACTED)[^'"\s,]+/gi, '$1[REDACTED]');
  return cleaned;
}

/**
 * Escapes markdown-sensitive characters in strings to avoid formatting corruption.
 */
export function escapeMarkdown(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Validates and normalizes project directory path.
 * Rejects traversal and null byte injections.
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
 * Validates that an output directory is safe to write reports into.
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
 * Recursively scans directory collecting relative paths up to a bounded depth and count.
 */
export function collectProjectFiles(projectDir, { maxFiles = 2000, maxDepth = 8 } = {}) {
  const files = [];

  function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth || files.length >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const name = entry.name;
      if (IGNORED_DIRECTORIES.has(name)) continue;

      const fullPath = path.join(currentDir, name);
      const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }

  walk(projectDir, 0);
  return files;
}

/**
 * Safe fallback parser for YAML OpenAPI specifications without external dependencies.
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
