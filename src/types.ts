export type IssueType =
  | 'missing'
  | 'invalid_type'
  | 'out_of_range'
  | 'invalid_format'
  | 'custom_check_failed'
  | 'unexpected_variable';

export interface ValidationErrorItem {
  key: string;
  type: string;
  issue: IssueType;
  message: string;
  expected?: string;
  receivedType?: string;
  // NOTE: The raw/actual variable value MUST NEVER be stored here to prevent accidental secret leakage.
}

export interface ValidationSuccess<T> {
  valid: true;
  value: T;
}

export interface ValidationFailure {
  valid: false;
  errors: ValidationErrorItem[];
}

export type ValidatorResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface Validator<T = unknown> {
  readonly type: string;
  readonly isRequired: boolean;
  readonly isSensitive: boolean;
  readonly defaultValue?: T;
  readonly description?: string;
  readonly customValidators: ReadonlyArray<{
    fn: (value: T) => boolean | string;
    description?: string;
  }>;

  validate(raw: unknown, key: string): ValidatorResult<T>;
  optional(): Validator<T | undefined>;
  required(): Validator<T>;
  default(val: T): Validator<T>;
  sensitive(isSensitive?: boolean): Validator<T>;
  describe(description: string): Validator<T>;
  custom(fn: (value: T) => boolean | string, description?: string): Validator<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Schema = Record<string, Validator<any>>;

export type InferOutput<S extends Schema> = {
  [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  missing: number;
}

export interface ValidationResult<T = Record<string, unknown>> {
  success: boolean;
  data: T;
  errors: ValidationErrorItem[];
  summary: ValidationSummary;
}

export interface GuardOptions {
  /**
   * If true, throws an EnvGuardError on validation failure instead of only returning it.
   * Default: false
   */
  throwOnError?: boolean;

  /**
   * If true, warns or fails when environment variables exist that are not defined in the schema.
   * Default: false
   */
  strict?: boolean;

  /**
   * If true, empty strings (`""`) in environment are treated as undefined/missing.
   * Default: true
   */
  allowEmptyStringAsMissing?: boolean;
}
