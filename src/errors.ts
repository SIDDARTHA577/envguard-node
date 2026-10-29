import type { ValidationErrorItem } from './types.js';

/**
 * Base error class for EnvGuard runtime validation errors.
 * Ensures error message summarizes the failures without revealing any sensitive values.
 */
export class EnvGuardValidationError extends Error {
  public readonly errors: readonly ValidationErrorItem[];

  constructor(errors: ValidationErrorItem[]) {
    const errorCount = errors.length;
    const summaryList = errors
      .slice(0, 5)
      .map((e) => `${e.key} (${e.issue})`)
      .join(', ');
    const more = errorCount > 5 ? ` and ${errorCount - 5} more` : '';
    
    super(`Environment validation failed with ${errorCount} error(s): ${summaryList}${more}`);
    this.name = 'EnvGuardValidationError';
    this.errors = Object.freeze([...errors]);

    const errorConstructor = Error as unknown as {
      captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, EnvGuardValidationError);
    }
  }
}

/**
 * Error thrown when a schema is malformed or invalidly defined.
 */
export class EnvGuardSchemaError extends Error {
  constructor(message: string) {
    super(`Invalid schema definition: ${message}`);
    this.name = 'EnvGuardSchemaError';

    const errorConstructor = Error as unknown as {
      captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, EnvGuardSchemaError);
    }
  }
}

/**
 * Error thrown when CLI or configuration files cannot be found or loaded.
 */
export class EnvGuardConfigError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = 'EnvGuardConfigError';

    const errorConstructor = Error as unknown as {
      captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, EnvGuardConfigError);
    }
  }
}
