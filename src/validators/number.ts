import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export interface NumberValidatorOptions {
  min?: number;
  max?: number;
}

export class NumberValidator extends BaseValidator<number> {
  public readonly type: string = 'number';

  constructor(protected readonly options: NumberValidatorOptions = {}) {
    super();
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<number> {
    let num: number;

    if (typeof raw === 'number') {
      num = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '') {
        return {
          valid: false,
          errors: [
            this.createError(
              key,
              'invalid_type',
              `Variable "${key}" must be a valid number.`,
              { expected: 'number', receivedType: 'empty string' }
            ),
          ],
        };
      }
      num = Number(trimmed);
    } else {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a valid number. Received: ${typeof raw}.`,
            { expected: 'number', receivedType: typeof raw }
          ),
        ],
      };
    }

    if (isNaN(num) || !isFinite(num)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a valid finite number.`,
            { expected: 'number', receivedType: 'NaN/Infinity' }
          ),
        ],
      };
    }

    if (this.options.min !== undefined && num < this.options.min) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'out_of_range',
            `Variable "${key}" must be at least ${this.options.min}.`,
            { expected: `>= ${this.options.min}` }
          ),
        ],
      };
    }

    if (this.options.max !== undefined && num > this.options.max) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'out_of_range',
            `Variable "${key}" must be at most ${this.options.max}.`,
            { expected: `<= ${this.options.max}` }
          ),
        ],
      };
    }

    return { valid: true, value: num };
  }
}

export class IntegerValidator extends NumberValidator {
  public override readonly type = 'integer';

  protected override coerceAndValidate(raw: unknown, key: string): ValidatorResult<number> {
    const parentResult = super.coerceAndValidate(raw, key);
    if (!parentResult.valid) {
      return parentResult;
    }

    const num = parentResult.value;
    if (!Number.isInteger(num)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be an integer without decimal fractions.`,
            { expected: 'integer', receivedType: 'float' }
          ),
        ],
      };
    }

    return { valid: true, value: num };
  }
}
