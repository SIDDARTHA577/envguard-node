import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export interface PortValidatorOptions {
  min?: number;
  max?: number;
}

export class PortValidator extends BaseValidator<number> {
  public readonly type = 'port';
  private readonly min: number;
  private readonly max: number;

  constructor(options: PortValidatorOptions = {}) {
    super();
    this.min = options.min ?? 1;
    this.max = options.max ?? 65535;
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<number> {
    let port: number;

    if (typeof raw === 'number') {
      port = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!/^\d+$/.test(trimmed)) {
        return {
          valid: false,
          errors: [
            this.createError(
              key,
              'invalid_format',
              `Variable "${key}" must be a valid positive port number.`,
              { expected: `integer ${this.min}-${this.max}`, receivedType: 'non-numeric' }
            ),
          ],
        };
      }
      port = Number(trimmed);
    } else {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a port number. Received: ${typeof raw}.`,
            { expected: `port (${this.min}-${this.max})`, receivedType: typeof raw }
          ),
        ],
      };
    }

    if (!Number.isInteger(port)) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" port must be an integer.`,
            { expected: 'integer', receivedType: 'float' }
          ),
        ],
      };
    }

    if (port < this.min || port > this.max) {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'out_of_range',
            `Variable "${key}" port must be between ${this.min} and ${this.max}.`,
            { expected: `${this.min} <= port <= ${this.max}` }
          ),
        ],
      };
    }

    return { valid: true, value: port };
  }
}
