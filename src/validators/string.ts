import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export interface StringValidatorOptions {
  min?: number;
  max?: number;
  pattern?: RegExp;
  choices?: string[];
  trim?: boolean;
}

export class StringValidator extends BaseValidator<string> {
  public readonly type = 'string';

  constructor(private readonly options: StringValidatorOptions = {}) {
    super();
  }

  /**
   * Automatically trims leading and trailing whitespace before evaluating constraints.
   */
  public trim(): StringValidator {
    const clone = this.clone() as StringValidator;
    (clone as unknown as { options: StringValidatorOptions }).options = {
      ...this.options,
      trim: true,
    };
    return clone;
  }

  /**
   * Enforces that the string contains at least one character.
   */
  public nonempty(): StringValidator {
    const clone = this.clone() as StringValidator;
    (clone as unknown as { options: StringValidatorOptions }).options = {
      ...this.options,
      min: Math.max(this.options.min ?? 1, 1),
    };
    return clone;
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<string> {
    if (typeof raw !== 'string') {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a string. Received: ${typeof raw}.`,
            { expected: 'string', receivedType: typeof raw }
          ),
        ],
      };
    }

    const val = this.options.trim ? raw.trim() : raw;

    if (this.options.min !== undefined && val.length < this.options.min) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'out_of_range',
            `Variable "${key}" length must be at least ${this.options.min} characters.`,
            { expected: `>= ${this.options.min} characters` }
          ),
        ],
      };
    }

    if (this.options.max !== undefined && val.length > this.options.max) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'out_of_range',
            `Variable "${key}" length must not exceed ${this.options.max} characters.`,
            { expected: `<= ${this.options.max} characters` }
          ),
        ],
      };
    }

    if (this.options.pattern && !this.options.pattern.test(val)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_format',
            `Variable "${key}" does not match required pattern ${this.options.pattern.toString()}.`,
            { expected: this.options.pattern.toString() }
          ),
        ],
      };
    }

    if (this.options.choices && !this.options.choices.includes(val)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_format',
            `Variable "${key}" must be one of: ${this.options.choices.join(', ')}.`,
            { expected: this.options.choices.join(', ') }
          ),
        ],
      };
    }

    return { valid: true, value: val };
  }
}
