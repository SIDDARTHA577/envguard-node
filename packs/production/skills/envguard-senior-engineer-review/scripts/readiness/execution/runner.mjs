import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { sanitizeOutput } from '../constants.mjs';

/**
 * Standardized execution trust models for EnvGuard project command execution.
 */
export const TRUST_MODELS = {
  TRUSTED_LOCAL_PROJECT: 'TRUSTED_LOCAL_PROJECT',
  ISOLATED_UNTRUSTED_PROJECT: 'ISOLATED_UNTRUSTED_PROJECT',
  STATIC_ONLY: 'STATIC_ONLY',
};

/**
 * Inspects host environment indicators for possible container containment.
 * NOTE: Signals like /.dockerenv or cgroup labels are environment indicators,
 * NOT cryptographically verified sandbox boundaries.
 *
 * @returns {{ detected: boolean, indicator: string | null }}
 */
export function detectContainerEnvironment() {
  if (process.env.ENVGUARD_CONTAINER_ISOLATED === 'true') {
    return { detected: true, indicator: 'ENVGUARD_CONTAINER_ISOLATED=true' };
  }
  try {
    if (fs.existsSync('/.dockerenv')) {
      return { detected: true, indicator: '/.dockerenv' };
    }
  } catch {}
  try {
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (/docker|containerd|kubepods|lxc/i.test(cgroup)) {
        return { detected: true, indicator: '/proc/1/cgroup container label' };
      }
    }
  } catch {}
  return { detected: false, indicator: null };
}

/**
 * Checks whether the current process is running inside an isolated container environment.
 * Maintained for backward compatibility; inspects detection indicators.
 *
 * @returns {boolean}
 */
export function isEnvironmentIsolated() {
  return detectContainerEnvironment().detected;
}

/**
 * Minimizes environment variables passed to child processes.
 * Strips all tokens, secrets, parent credentials, and sensitive configurations.
 *
 * @param {object} [baseEnv=process.env]
 * @returns {object} Sanitized environment key-value map
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

  // Enforce standardized non-interactive test flags
  safeEnv.CI = 'true';
  safeEnv.NODE_ENV = 'test';

  return safeEnv;
}

/**
 * Validates working directory path security.
 *
 * @param {string} projectDir
 * @returns {{ valid: boolean, error?: string, resolvedDir?: string }}
 */
export function validateWorkingDirectory(projectDir) {
  if (!projectDir || typeof projectDir !== 'string') {
    return { valid: false, error: 'Working directory path must be a non-empty string.' };
  }
  if (projectDir.includes('\0')) {
    return { valid: false, error: 'Working directory path contains null bytes.' };
  }
  try {
    const resolved = path.resolve(projectDir);
    if (!fs.existsSync(resolved)) {
      return { valid: false, error: `Working directory does not exist: "${resolved}".` };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Working directory path is not a directory: "${resolved}".` };
    }
    return { valid: true, resolvedDir: resolved };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Executes an authorized project command with strict execution bounds, minimized env,
 * and containment verification.
 *
 * @param {string} command - Binary name (npm, pnpm, yarn, node, npx)
 * @param {string[]} args - Command arguments
 * @param {string} projectDir - Target working directory
 * @param {object} [options={}] - Execution options
 * @returns {object} Execution result
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

  // 1. Authorization check
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
      trustMode: TRUST_MODELS.STATIC_ONLY,
    };
  }

  // 2. Working directory validation
  const dirCheck = validateWorkingDirectory(projectDir);
  if (!dirCheck.valid) {
    return {
      success: false,
      notRun: true,
      blockedByPolicy: true,
      reason: 'invalid_project_dir',
      durationMs: 0,
      exitCode: 1,
      stdout: '',
      stderr: `Invalid execution directory: ${dirCheck.error}`,
      timedOut: false,
      trustMode: TRUST_MODELS.STATIC_ONLY,
    };
  }
  const safeProjectDir = dirCheck.resolvedDir;

  // 3. Containment and trust model resolution
  const containerSignals = detectContainerEnvironment();
  const effectiveIsolated = isIsolated !== null ? Boolean(isIsolated) : containerSignals.detected;

  let trustMode = TRUST_MODELS.STATIC_ONLY;
  if (trustProject) {
    trustMode = TRUST_MODELS.TRUSTED_LOCAL_PROJECT;
  } else if (effectiveIsolated) {
    trustMode = TRUST_MODELS.ISOLATED_UNTRUSTED_PROJECT;
  }

  if (trustMode === TRUST_MODELS.STATIC_ONLY) {
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
      trustMode: TRUST_MODELS.STATIC_ONLY,
    };
  }

  // 4. Command allowlist validation
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
      isolated: effectiveIsolated,
      trustMode,
    };
  }

  // 5. Binary allowlist validation
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
      trustMode,
    };
  }

  // 6. Safe argument validation (prevent shell injection)
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
          trustMode,
        };
      }
      if (arg.includes('..')) {
        return {
          success: false,
          notRun: true,
          blockedByPolicy: true,
          reason: 'unsafe_arguments',
          durationMs: 0,
          exitCode: 1,
          stdout: '',
          stderr: `Command argument contains directory traversal sequence: "${arg}".`,
          timedOut: false,
          trustMode,
        };
      }
    }
  }

  // 7. Timeout bounds (100ms - 60000ms)
  const boundedTimeout = Math.max(100, Math.min(60000, Number(timeoutMs) || 10000));
  const sanitizedEnv = buildSanitizedEnv(process.env);
  const isWindows = process.platform === 'win32';

  try {
    let res;
    if (isWindows) {
      if (command === 'node') {
        res = spawnSync('node', args || [], {
          cwd: safeProjectDir,
          timeout: boundedTimeout,
          shell: false,
          encoding: 'utf8',
          env: sanitizedEnv,
          maxBuffer: 512 * 1024,
        });
      } else {
        // On Windows, package managers (npm, pnpm, yarn, npx) are cmd scripts.
        // We invoke comspec with /d /s /c and shell: false to avoid DEP0190 and prevent shell injection.
        const comspec = process.env.COMSPEC || 'cmd.exe';
        const winArgs = ['/d', '/s', '/c', `${command}.cmd`, ...(args || [])];
        res = spawnSync(comspec, winArgs, {
          cwd: safeProjectDir,
          timeout: boundedTimeout,
          shell: false,
          encoding: 'utf8',
          env: sanitizedEnv,
          maxBuffer: 512 * 1024,
        });
      }
    } else {
      res = spawnSync(command, args || [], {
        cwd: safeProjectDir,
        timeout: boundedTimeout,
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
      isolated: effectiveIsolated,
      trustMode,
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
      isolated: effectiveIsolated,
      trustMode,
      error: err.message,
    };
  }
}

/**
 * Previews eligible commands with network and filesystem disclosure.
 *
 * @param {string} projectDir - Target project root
 * @param {object} pkg - Parsed package.json
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {object} [options={}] - Execution options
 * @returns {object} Preview details
 */
export function previewExecutionCommands(projectDir, pkg, timeoutMs, { allowExec, trustProject } = {}) {
  const scripts = pkg?.scripts || {};
  const containerSignals = detectContainerEnvironment();
  const isolated = containerSignals.detected;

  let trustMode = TRUST_MODELS.STATIC_ONLY;
  if (trustProject) {
    trustMode = TRUST_MODELS.TRUSTED_LOCAL_PROJECT;
  } else if (isolated) {
    trustMode = TRUST_MODELS.ISOLATED_UNTRUSTED_PROJECT;
  }

  const candidates = [
    { name: 'test', command: 'npm', args: ['run', 'test'], declared: Boolean(scripts.test) },
    { name: 'build', command: 'npm', args: ['run', 'build'], declared: Boolean(scripts.build) },
    {
      name: 'typecheck',
      command: 'npm',
      args: ['run', 'typecheck'],
      declared: Boolean(scripts.typecheck || scripts['check-types']),
    },
    { name: 'lint', command: 'npm', args: ['run', 'lint'], declared: Boolean(scripts.lint) },
  ];

  return {
    projectDir,
    isolationAvailable: isolated,
    isolationIndicator: containerSignals.indicator,
    allowExec: Boolean(allowExec),
    trustProject: Boolean(trustProject),
    trustMode,
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
