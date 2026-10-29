import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { s } from '../schema.js';
import { EnvGuardConfigError, EnvGuardSchemaError } from '../errors.js';
import type { Schema, Validator } from '../types.js';

export const DEFAULT_CONFIG_FILES = [
  'envguard.config.json',
  'envguard.config.js',
  'envguard.config.mjs',
  'envguard.config.cjs',
  'envguard.config.ts',
  '.envguardrc.json',
];

export interface LoadedConfig {
  filePath: string;
  schema: Schema;
}

export function parseJsonSchema(jsonObj: Record<string, unknown>): Schema {
  const schema: Schema = {};

  for (const [key, def] of Object.entries(jsonObj)) {
    if (typeof def === 'string') {
      // Shorthand syntax e.g. "PORT": "port"
      schema[key] = createValidatorFromType(def, {}, key);
    } else if (def && typeof def === 'object' && !Array.isArray(def)) {
      const typeStr = typeof (def as { type?: unknown }).type === 'string'
        ? (def as { type: string }).type
        : 'string';
      schema[key] = createValidatorFromType(typeStr, def as Record<string, unknown>, key);
    } else {
      throw new EnvGuardSchemaError(
        `Field "${key}" in JSON config must be a type name string or validator specification object.`
      );
    }
  }

  return schema;
}

function createValidatorFromType(
  type: string,
  options: Record<string, unknown>,
  key: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Validator<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validator: Validator<any>;

  switch (type.toLowerCase()) {
    case 'string': {
      const pattern = typeof options.pattern === 'string' ? new RegExp(options.pattern) : undefined;
      const choices = Array.isArray(options.choices) ? (options.choices as string[]) : undefined;
      validator = s.string({
        min: typeof options.min === 'number' ? options.min : undefined,
        max: typeof options.max === 'number' ? options.max : undefined,
        pattern,
        choices,
      });
      break;
    }
    case 'number': {
      validator = s.number({
        min: typeof options.min === 'number' ? options.min : undefined,
        max: typeof options.max === 'number' ? options.max : undefined,
      });
      break;
    }
    case 'integer': {
      validator = s.integer({
        min: typeof options.min === 'number' ? options.min : undefined,
        max: typeof options.max === 'number' ? options.max : undefined,
      });
      break;
    }
    case 'port': {
      validator = s.port({
        min: typeof options.min === 'number' ? options.min : undefined,
        max: typeof options.max === 'number' ? options.max : undefined,
      });
      break;
    }
    case 'boolean': {
      validator = s.boolean();
      break;
    }
    case 'url': {
      const protocols = Array.isArray(options.protocols)
        ? (options.protocols as string[])
        : undefined;
      validator = s.url({ protocols });
      break;
    }
    case 'enum': {
      const values = Array.isArray(options.values || options.enum || options.choices)
        ? (options.values || options.enum || options.choices) as string[]
        : [];
      if (values.length === 0) {
        throw new EnvGuardSchemaError(`Enum validator for "${key}" requires an array of values.`);
      }
      validator = s.enum(values);
      break;
    }
    default:
      throw new EnvGuardSchemaError(
        `Unknown validator type "${type}" specified for key "${key}". Supported types: string, number, integer, port, boolean, url, enum.`
      );
  }

  if (options.required === false) {
    validator = validator.optional();
  }

  if (options.default !== undefined) {
    validator = validator.default(options.default);
  }

  if (options.sensitive === true) {
    validator = validator.sensitive(true);
  }

  if (typeof options.description === 'string') {
    validator = validator.describe(options.description);
  }

  return validator;
}

export async function loadConfigFile(customPath?: string, cwd = process.cwd()): Promise<LoadedConfig> {
  let targetPath: string | null = null;

  if (customPath) {
    const resolved = path.isAbsolute(customPath) ? customPath : path.resolve(cwd, customPath);
    if (!fs.existsSync(resolved)) {
      throw new EnvGuardConfigError(`Specified configuration file was not found: ${customPath}`);
    }
    targetPath = resolved;
  } else {
    for (const file of DEFAULT_CONFIG_FILES) {
      const candidate = path.resolve(cwd, file);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
        break;
      }
    }
  }

  if (!targetPath) {
    throw new EnvGuardConfigError(
      `No EnvGuard configuration file found. Checked: ${DEFAULT_CONFIG_FILES.join(', ')}. Use "envguard init" to create one.`
    );
  }

  const ext = path.extname(targetPath).toLowerCase();

  if (ext === '.json') {
    try {
      const content = fs.readFileSync(targetPath, 'utf8');
      const raw = JSON.parse(content);
      const schemaDef = raw.schema || raw;
      return {
        filePath: targetPath,
        schema: parseJsonSchema(schemaDef),
      };
    } catch (err: unknown) {
      if (err instanceof EnvGuardSchemaError) {
        throw err;
      }
      throw new EnvGuardConfigError(
        `Failed to parse JSON configuration in ${path.basename(targetPath)}: ${(err as Error).message}`
      );
    }
  }

  // JS, MJS, CJS, or TS via dynamic import
  try {
    const fileUrl = pathToFileURL(targetPath).href;
    const imported = await import(fileUrl);
    const schemaDef = imported.default || imported.schema || imported;

    if (!schemaDef || typeof schemaDef !== 'object') {
      throw new EnvGuardConfigError(
        `File ${path.basename(targetPath)} must export an EnvGuard schema as default or "schema".`
      );
    }

    return {
      filePath: targetPath,
      schema: schemaDef,
    };
  } catch (err: unknown) {
    if (err instanceof EnvGuardConfigError || err instanceof EnvGuardSchemaError) {
      throw err;
    }
    throw new EnvGuardConfigError(
      `Failed to load configuration from ${path.basename(targetPath)}: ${(err as Error).message}`
    );
  }
}
