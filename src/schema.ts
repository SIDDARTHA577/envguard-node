import { StringValidator, type StringValidatorOptions } from './validators/string.js';
import {
  NumberValidator,
  IntegerValidator,
  type NumberValidatorOptions,
} from './validators/number.js';
import { BooleanValidator, type BooleanValidatorOptions } from './validators/boolean.js';
import { PortValidator, type PortValidatorOptions } from './validators/port.js';
import { UrlValidator, type UrlValidatorOptions } from './validators/url.js';
import { EnumValidator } from './validators/enum.js';
import { EnvGuardSchemaError } from './errors.js';
import type { Schema } from './types.js';

export const s = {
  string: (options?: StringValidatorOptions) => new StringValidator(options),
  number: (options?: NumberValidatorOptions) => new NumberValidator(options),
  integer: (options?: NumberValidatorOptions) => new IntegerValidator(options),
  boolean: (options?: BooleanValidatorOptions) => new BooleanValidator(options),
  port: (options?: PortValidatorOptions) => new PortValidator(options),
  url: (options?: UrlValidatorOptions) => new UrlValidator(options),
  enum: <const T extends readonly string[]>(allowedValues: T) => {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      throw new EnvGuardSchemaError('Enum validator requires a non-empty array of allowed values.');
    }
    return new EnumValidator(allowedValues);
  },
};

export const schema = s;

/**
 * Validates and freezes a schema object definition.
 */
export function defineSchema<T extends Schema>(definition: T): T {
  if (!definition || typeof definition !== 'object') {
    throw new EnvGuardSchemaError('Schema must be a non-null object.');
  }

  const ownKeys = Object.getOwnPropertyNames(definition);
  for (const key of ownKeys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new EnvGuardSchemaError(`Schema contains forbidden reserved property key: "${key}"`);
    }
    const validator = (definition as Record<string, unknown>)[key];
    if (!key || typeof key !== 'string') {
      throw new EnvGuardSchemaError(`Schema contains an invalid key: ${String(key)}`);
    }
    if (
      !validator ||
      typeof validator !== 'object' ||
      typeof (validator as { validate?: unknown }).validate !== 'function'
    ) {
      throw new EnvGuardSchemaError(
        `Field "${key}" in schema must be a valid EnvGuard validator instance.`
      );
    }
  }

  return Object.freeze({ ...definition });
}

