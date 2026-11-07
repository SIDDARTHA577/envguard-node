import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { sanitizeOutput } from '../constants.mjs';

/**
 * Checks whether the current process is running inside an isolated container environment.
 * Detects Docker, Kubernetes pods, LXC, or explicit ENVGUARD_CONTAINER_ISOLATED flag.
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

  // Enforce standardized non-interactive test flags
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
    };
  }

  // 2. Containment and host trust check
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

  // 3. Command allowlist validation
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

  // 4. Safe argument validation (prevent shell injection)
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
      // On Windows, npm commands run via shell: true with validated string
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
 * Previews eligible commands with network and filesystem disclosure.
 */
export function previewExecutionCommands(projectDir, pkg, timeoutMs, { allowExec, trustProject } = {}) {
  const scripts = pkg?.scripts || {};
  const isolated = isEnvironmentIsolated();
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
