import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { buildSanitizedEnv } from './runner.mjs';

/**
 * Checks whether a given relative file path is tracked by Git.
 * Returns an object with isGitRepo and isTracked status.
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
 * Parses .gitignore file content into structured match rules.
 * Supports comments, blank lines, directory markers, and negation rules (!pattern).
 */
export function parseGitignoreRules(gitignoreContent) {
  if (typeof gitignoreContent !== 'string') return [];
  const rules = [];
  const lines = gitignoreContent.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const isNegation = line.startsWith('!');
    const pattern = isNegation ? line.slice(1).trim() : line;

    rules.push({
      pattern,
      isNegation,
    });
  }
  return rules;
}

/**
 * Converts a gitignore glob pattern to a RegExp.
 * Properly escapes regex metacharacters including backslashes to avoid CodeQL sanitization alerts.
 */
function globToRegex(pattern) {
  let pat = pattern;
  if (pat.startsWith('/')) pat = pat.slice(1);
  if (pat.endsWith('/')) pat = pat.slice(0, -1);

  const escaped = pat.replace(/[\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`(^|/)${escaped}(/|$)`);
}

/**
 * Evaluates whether a relative file path is matched by parsed .gitignore rules.
 * Processes rules in order, properly handling negation rules.
 */
export function isPathIgnoredByRules(rules, filePath) {
  if (!Array.isArray(rules) || rules.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');

  let ignored = false;
  for (const rule of rules) {
    const rx = globToRegex(rule.pattern);
    if (rx.test(normalized)) {
      ignored = !rule.isNegation;
    }
  }
  return ignored;
}
