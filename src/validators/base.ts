import type {
  Validator,
  ValidatorResult,
  ValidationErrorItem,
  IssueType,
} from '../types.js';

export abstract class BaseValidator<T> implements Validator<T> {
  public abstract readonly type: string;
  public isRequired = true;
  public isSensitive = false;
  public defaultValue?: T;
  public description?: string;
  public customValidators: Array<{
    fn: (value: T) => boolean | string;
    description?: string;
  }> = [];

  public optional(): Validator<T | undefined> {
    const clone = this.clone() as unknown as BaseValidator<T | undefined>;
    clone.isRequired = false;
    return clone as unknown as Validator<T | undefined>;
  }

  public required(): Validator<T> {
    const clone = this.clone();
    clone.isRequired = true;
    return clone;
  }

  public default(val: T): Validator<T> {
    const clone = this.clone();
    clone.defaultValue = val;
    // Having a default value satisfies required status
    clone.isRequired = false;
    return clone;
  }

  public sensitive(isSensitive = true): Validator<T> {
    const clone = this.clone();
    clone.isSensitive = isSensitive;
    return clone;
  }

  public describe(description: string): Validator<T> {
    const clone = this.clone();
    clone.description = description;
    return clone;
  }

  public custom(fn: (value: T) => boolean | string, description?: string): Validator<T> {
    const clone = this.clone();
    clone.customValidators = [...clone.customValidators, { fn, description }];
    return clone;
  }

  protected createError(
    key: string,
    issue: IssueType,
    message: string,
    options?: { expected?: string; receivedType?: string }
  ): ValidationErrorItem {
    return {
      key,
      type: this.type,
      issue,
      message,
      expected: options?.expected,
      receivedType: options?.receivedType,
    };
  }

  protected abstract coerceAndValidate(raw: unknown, key: string): ValidatorResult<T>;

  protected clone(): this {
    const copy = Object.create(Object.getPrototypeOf(this));
    Object.assign(copy, this);
    copy.customValidators = [...this.customValidators];
    return copy;
  }

  public validate(raw: unknown, key: string): ValidatorResult<T> {
    const isMissing = raw === undefined || raw === null || raw === '';

    if (isMissing) {
      if (this.defaultValue !== undefined) {
        return { valid: true, value: this.defaultValue };
      }
      if (!this.isRequired) {
        return { valid: true, value: undefined as unknown as T };
      }
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'missing',
            `Environment variable "${key}" is required but not set.`,
            { expected: this.type }
          ),
        ],
      };
    }

    // Coerce and validate type
    const result = this.coerceAndValidate(raw, key);
    if (!result.valid) {
      return result;
    }

    // Run custom validators safely
    const coercedVal = result.value;
    for (const { fn, description } of this.customValidators) {
      try {
        const checkResult = fn(coercedVal);
        if (checkResult === false) {
          const detail = description ? `: ${description}` : '.';
          return {
            valid: false,
            errors: [
              this.createError(
                key,
                'custom_check_failed',
                `Custom validation failed for "${key}"${detail}`
              ),
            ],
          };
        } else if (typeof checkResult === 'string') {
          return {
            valid: false,
            errors: [
              this.createError(
                key,
                'custom_check_failed',
                `Custom validation failed for "${key}": ${checkResult}`
              ),
            ],
          };
        }
      } catch {
        // Guarantee no secrets or internal leak in exception message
        return {
          valid: false,
          errors: [
            this.createError(
              key,
              'custom_check_failed',
              `Custom validator threw an error for "${key}".`
            ),
          ],
        };
      }
    }

    return { valid: true, value: coercedVal };
  }
}
