import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export interface BooleanValidatorOptions {
  truthy?: string[];
  falsy?: string[];
}

const DEFAULT_TRUTHY = ['true', '1', 'yes', 'on'];
const DEFAULT_FALSY = ['false', '0', 'no', 'off'];

export class BooleanValidator extends BaseValidator<boolean> {
  public readonly type = 'boolean';
  private readonly truthy: Set<string>;
  private readonly falsy: Set<string>;

  constructor(options: BooleanValidatorOptions = {}) {
    super();
    this.truthy = new Set((options.truthy || DEFAULT_TRUTHY).map((s) => s.toLowerCase()));
    this.falsy = new Set((options.falsy || DEFAULT_FALSY).map((s) => s.toLowerCase()));
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<boolean> {
    if (typeof raw === 'boolean') {
      return { valid: true, value: raw };
    }

    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (this.truthy.has(normalized)) {
        return { valid: true, value: true };
      }
      if (this.falsy.has(normalized)) {
        return { valid: true, value: false };
      }
    }

    return {
      valid: false,
      errors: [
        this.createError(
          key,
          'invalid_type',
          `Variable "${key}" must be a boolean (e.g., "true", "false", "1", "0", "yes", "no").`,
          { expected: 'boolean', receivedType: typeof raw }
        ),
      ],
    };
  }
}
