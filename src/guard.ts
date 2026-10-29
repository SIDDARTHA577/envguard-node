import { defineSchema } from './schema.js';
import { EnvGuardValidationError } from './errors.js';
import type {
  Schema,
  InferOutput,
  ValidationResult,
  ValidationErrorItem,
  GuardOptions,
} from './types.js';

/**
 * Validates environment variables against an EnvGuard schema.
 *
 * @param schemaDefinition The schema to validate against.
 * @param env The environment object to validate. If omitted, explicitly falls back to `process.env`.
 * @param options Validation configuration options.
 */
export function guard<S extends Schema>(
  schemaDefinition: S,
  env?: Record<string, string | undefined>,
  options: GuardOptions = {}
): ValidationResult<InferOutput<S>> {
  const schema = defineSchema(schemaDefinition);
  const targetEnv = env !== undefined ? env : process.env;

  const errors: ValidationErrorItem[] = [];
  const validatedData: Record<string, unknown> = {};

  let validCount = 0;
  let invalidCount = 0;
  let missingCount = 0;

  const schemaKeys = Object.keys(schema);

  for (const key of schemaKeys) {
    const validator = schema[key];
    const rawValue = targetEnv[key];

    const result = validator.validate(rawValue, key);

    if (result.valid) {
      validatedData[key] = result.value;
      validCount++;
    } else {
      invalidCount++;
      for (const err of result.errors) {
        if (err.issue === 'missing') {
          missingCount++;
        }
        errors.push(err);
      }
    }
  }

  // Strict mode: check for unexpected extra environment variables if explicitly requested
  if (options.strict && env !== undefined) {
    const schemaKeySet = new Set(schemaKeys);
    for (const envKey of Object.keys(env)) {
      if (!schemaKeySet.has(envKey)) {
        errors.push({
          key: envKey,
          type: 'unknown',
          issue: 'unexpected_variable',
          message: `Unexpected variable "${envKey}" found in environment under strict mode.`,
        });
        invalidCount++;
      }
    }
  }

  const success = errors.length === 0;

  const validationResult: ValidationResult<InferOutput<S>> = {
    success,
    data: validatedData as InferOutput<S>,
    errors: Object.freeze(errors) as unknown as ValidationErrorItem[],
    summary: {
      total: schemaKeys.length,
      valid: validCount,
      invalid: invalidCount,
      missing: missingCount,
    },
  };

  if (!success && options.throwOnError) {
    throw new EnvGuardValidationError(errors);
  }

  return validationResult;
}

export { defineSchema } from './schema.js';
export const validate = guard;
