// Core validation and schemas
export { guard, validate } from './guard.js';
export { s, schema, defineSchema } from './schema.js';

// Errors
export {
  EnvGuardValidationError,
  EnvGuardSchemaError,
  EnvGuardConfigError,
} from './errors.js';

// Validators
export { BaseValidator } from './validators/base.js';
export { StringValidator, type StringValidatorOptions } from './validators/string.js';
export {
  NumberValidator,
  IntegerValidator,
  type NumberValidatorOptions,
} from './validators/number.js';
export { BooleanValidator, type BooleanValidatorOptions } from './validators/boolean.js';
export { PortValidator, type PortValidatorOptions } from './validators/port.js';
export { UrlValidator, type UrlValidatorOptions } from './validators/url.js';
export { EnumValidator } from './validators/enum.js';

// Parsers and loaders
export {
  parseDotenv,
  parseDotenvWithMetadata,
  type ParseDotenvOptions,
  type ParseDotenvResult,
} from './parser/dotenv.js';
export {
  loadConfigFile,
  parseJsonSchema,
  DEFAULT_CONFIG_FILES,
  type LoadedConfig,
} from './config/loader.js';

// CLI and reporting utilities
export { formatTerminalReport, formatJsonReport } from './cli/reporter.js';
export { executeInit, type InitOptions } from './cli/init.js';
export { runCli, parseArgs, type CliParsedArgs } from './cli/index.js';

// Types
export type {
  Validator,
  ValidatorResult,
  ValidationSuccess,
  ValidationFailure,
  ValidationErrorItem,
  IssueType,
  Schema,
  InferOutput,
  ValidationSummary,
  ValidationResult,
  GuardOptions,
} from './types.js';

