import fs from 'node:fs';
import path from 'node:path';
import { guard } from '../guard.js';
import { loadConfigFile } from '../config/loader.js';
import { parseDotenvWithMetadata } from '../parser/dotenv.js';
import { formatTerminalReport, formatJsonReport } from './reporter.js';
import { executeInit } from './init.js';
import { EnvGuardConfigError, EnvGuardSchemaError } from '../errors.js';

export const VERSION = '1.0.0';

export const HELP_TEXT = `
EnvGuard CLI - Production-ready environment variable validation

USAGE:
  envguard <command> [options]

COMMANDS:
  check     Validate environment variables against a schema
  init      Generate a starter configuration file and .env.example
  help      Display help information
  version   Show version number

CHECK OPTIONS:
  --schema <file>     Path to schema file (default: auto-detected)
  --env-file <file>   Path to .env file to load (default: process.env)
  --format <type>     Output format: "terminal" (default) or "json"
  --strict            Fail if unexpected environment variables are present
  -h, --help          Show help for the check command

INIT OPTIONS:
  --type <format>     Configuration file type: "json" (default) or "js"
  --force             Overwrite existing files without prompting
  -h, --help          Show help for the init command

GLOBAL OPTIONS:
  -v, --version       Show version number
  -h, --help          Show help information

EXIT CODES:
  0   All environment variables passed validation
  1   Validation failed (missing or invalid variables)
  2   CLI error, configuration error, or invalid schema

EXAMPLES:
  envguard check
  envguard check --schema ./envguard.config.json
  envguard check --env-file .env.production --format json
  envguard init --type json
`.trim();

export interface CliParsedArgs {
  command?: string;
  schema?: string;
  envFile?: string;
  format: 'terminal' | 'json';
  strict: boolean;
  type?: 'json' | 'js';
  force: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(rawArgs: string[]): CliParsedArgs {
  const parsed: CliParsedArgs = {
    format: 'terminal',
    strict: false,
    force: false,
    help: false,
    version: false,
  };

  const args = [...rawArgs];
  if (args.length > 0 && !args[0].startsWith('-')) {
    parsed.command = args.shift();
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--version' || arg === '-v') {
      parsed.version = true;
    } else if (arg === '--strict') {
      parsed.strict = true;
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--schema') {
      const next = args[++i];
      if (!next || next.startsWith('-')) {
        throw new EnvGuardConfigError('Missing argument value for --schema');
      }
      parsed.schema = next;
    } else if (arg === '--env-file') {
      const next = args[++i];
      if (!next || next.startsWith('-')) {
        throw new EnvGuardConfigError('Missing argument value for --env-file');
      }
      parsed.envFile = next;
    } else if (arg === '--format') {
      const next = args[++i];
      if (next !== 'terminal' && next !== 'json') {
        throw new EnvGuardConfigError('Invalid value for --format. Expected "terminal" or "json".');
      }
      parsed.format = next;
    } else if (arg === '--type') {
      const next = args[++i];
      if (next !== 'json' && next !== 'js') {
        throw new EnvGuardConfigError('Invalid value for --type. Expected "json" or "js".');
      }
      parsed.type = next;
    } else {
      throw new EnvGuardConfigError(`Unrecognized option: ${arg}`);
    }
  }

  return parsed;
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);

    if (parsed.version || parsed.command === 'version') {
      console.log(`envguard v${VERSION}`);
      return 0;
    }

    if (parsed.help || parsed.command === 'help' || !parsed.command) {
      console.log(HELP_TEXT);
      return 0;
    }

    if (parsed.command === 'init') {
      const result = executeInit({
        type: parsed.type,
        force: parsed.force,
      });

      for (const file of result.created) {
        console.log(`Created: ${file}`);
      }
      for (const skipped of result.skipped) {
        console.log(`Skipped: ${skipped}`);
      }
      return 0;
    }

    if (parsed.command === 'check') {
      const loaded = await loadConfigFile(parsed.schema);
      const warnings: string[] = [];

      let targetEnv: Record<string, string | undefined>;
      if (parsed.envFile) {
        const resolvedEnv = path.resolve(process.cwd(), parsed.envFile);
        if (!fs.existsSync(resolvedEnv)) {
          throw new EnvGuardConfigError(`Specified --env-file does not exist: ${parsed.envFile}`);
        }
        const fileContent = fs.readFileSync(resolvedEnv, 'utf8');
        const parsedMetadata = parseDotenvWithMetadata(fileContent);
        targetEnv = parsedMetadata.env;

        if (parsedMetadata.duplicateKeys.length > 0) {
          const dupList = parsedMetadata.duplicateKeys.join(', ');
          warnings.push(`Duplicate key(s) detected in ${parsed.envFile}: ${dupList}`);
        }
      } else {
        targetEnv = process.env;
      }

      const result = guard(loaded.schema, targetEnv, {
        strict: parsed.strict,
      });

      if (parsed.format === 'json') {
        console.log(
          formatJsonReport(result, {
            envguardVersion: VERSION,
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        );
      } else {
        console.log(
          formatTerminalReport(result, {
            schemaPath: path.basename(loaded.filePath),
            envPath: parsed.envFile || 'process.env',
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        );
      }

      return result.success ? 0 : 1;
    }

    console.error(`Unknown command: "${parsed.command}". Run "envguard --help" for usage.`);
    return 2;
  } catch (err: unknown) {
    if (err instanceof EnvGuardConfigError || err instanceof EnvGuardSchemaError) {
      console.error(`Error: ${(err as Error).message}`);
    } else {
      console.error(`Unexpected CLI error: ${(err as Error).message}`);
    }
    return 2;
  }
}
