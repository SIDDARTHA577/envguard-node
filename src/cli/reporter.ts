import type { ValidationResult } from '../types.js';

export function formatTerminalReport(
  result: ValidationResult,
  options: { schemaPath?: string; envPath?: string } = {}
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('====================================================');
  lines.push('  EnvGuard Configuration Validation Report');
  lines.push('====================================================');
  if (options.schemaPath) {
    lines.push(`Schema file  : ${options.schemaPath}`);
  }
  if (options.envPath) {
    lines.push(`Env source   : ${options.envPath}`);
  }
  lines.push('----------------------------------------------------');

  if (result.success) {
    lines.push(' Status: PASSED');
    lines.push(` Checked ${result.summary.total} variable(s): all valid.`);
    lines.push('----------------------------------------------------');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(` Status: FAILED with ${result.errors.length} issue(s)`);
  lines.push('');

  lines.push('Issues:');
  for (const err of result.errors) {
    lines.push(`  - [${err.issue.toUpperCase()}] ${err.key} (${err.type}):`);
    lines.push(`      ${err.message}`);
    if (err.expected) {
      lines.push(`      Expected: ${err.expected}`);
    }
  }

  lines.push('');
  lines.push('Summary:');
  lines.push(`  Total checked : ${result.summary.total}`);
  lines.push(`  Valid         : ${result.summary.valid}`);
  lines.push(`  Invalid       : ${result.summary.invalid}`);
  lines.push(`  Missing       : ${result.summary.missing}`);
  lines.push('----------------------------------------------------');
  lines.push('');

  return lines.join('\n');
}

export function formatJsonReport(result: ValidationResult): string {
  // Produce machine-readable JSON without any secret values
  const payload = {
    success: result.success,
    summary: result.summary,
    errors: result.errors.map((e) => ({
      key: e.key,
      type: e.type,
      issue: e.issue,
      message: e.message,
      expected: e.expected,
      receivedType: e.receivedType,
    })),
  };

  return JSON.stringify(payload, null, 2);
}
