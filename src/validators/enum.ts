import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export class EnumValidator<const T extends readonly string[]> extends BaseValidator<T[number]> {
  public readonly type = 'enum';
  private readonly allowedSet: Set<string>;

  constructor(public readonly allowedValues: T) {
    super();
    this.allowedSet = new Set(allowedValues);
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<T[number]> {
    if (typeof raw !== 'string') {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a string enum value. Received: ${typeof raw}.`,
            { expected: `one of [${this.allowedValues.join(', ')}]`, receivedType: typeof raw }
          ),
        ],
      };
    }

    if (!this.allowedSet.has(raw)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_format',
            `Variable "${key}" is invalid. Allowed options: ${this.allowedValues.join(', ')}.`,
            { expected: `one of [${this.allowedValues.join(', ')}]` }
          ),
        ],
      };
    }

    return { valid: true, value: raw as T[number] };
  }
}

