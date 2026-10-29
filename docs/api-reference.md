# EnvGuard API Reference

## Table of Contents

- [`guard(schema, env?, options?)`](#guardschema-env-options)
- [`defineSchema(definition)`](#defineschemadefinition)
- [Schema Validators (`s`)](#schema-validators-s)
  - [`s.string(options?)`](#sstringoptions)
  - [`s.number(options?)`](#snumberoptions)
  - [`s.integer(options?)`](#sintegeroptions)
  - [`s.boolean(options?)`](#sbooleanoptions)
  - [`s.port(options?)`](#sportoptions)
  - [`s.url(options?)`](#surloptions)
  - [`s.enum(values)`](#senumvalues)
- [Common Validator Modifiers](#common-validator-modifiers)
  - [`.optional()`](#optional)
  - [`.required()`](#required)
  - [`.default(value)`](#defaultvalue)
  - [`.sensitive(isSensitive?)`](#sensitiveissensitive)
  - [`.describe(description)`](#describedescription)
  - [`.custom(fn, description?)`](#customfn-description)
  - [`.trim()`](#trim)
  - [`.nonempty()`](#nonempty)
- [Parser Functions](#parser-functions)
  - [`parseDotenv(content, options?)`](#parsedotenvcontent-options)
  - [`parseDotenvWithMetadata(content, options?)`](#parsedotenvwithmetadatacontent-options)
- [Errors](#errors)
- [Type Inference](#type-inference)

---

## `guard(schema, env?, options?)`

Validates an environment object against an EnvGuard schema.

### Parameters
* **`schema`** (`Schema`): The schema object mapping variable keys to EnvGuard validators.
* **`env`** (`Record<string, string | undefined>`, optional): The environment dictionary. Defaults to `process.env` when omitted.
* **`options`** (`GuardOptions`, optional):
  * `throwOnError` (`boolean`, default: `false`): When `true`, throws an `EnvGuardValidationError` upon validation failure.
  * `strict` (`boolean`, default: `false`): When `true`, reports unexpected environment variables present in `env` that are not defined in the schema.
  * `allowEmptyStringAsMissing` (`boolean`, default: `true`): When `true`, empty strings (`""`) in environment values are treated as missing/unset.

### Returns
```ts
interface ValidationResult<T> {
  success: boolean;
  data: T;
  errors: readonly ValidationErrorItem[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    missing: number;
  };
}
```

---

## Schema Validators (`s`)

### `s.string(options?)`
Validates string values.
* Options:
  * `min?: number`: Minimum character length.
  * `max?: number`: Maximum character length.
  * `pattern?: RegExp`: Regular expression pattern match.
  * `choices?: string[]`: Allowlist of allowable string values.
  * `trim?: boolean`: Trims leading and trailing whitespace before evaluating constraints.

### `s.number(options?)`
Validates and coerces numeric values (including decimals and negative values).
* Options:
  * `min?: number`: Minimum allowed value.
  * `max?: number`: Maximum allowed value.

### `s.integer(options?)`
Extends `s.number()` to ensure the value is a whole integer without fractions.

### `s.boolean(options?)`
Coerces string booleans to boolean literals:
* Truthy: `"true"`, `"1"`, `"yes"`, `"on"` -> `true`
* Falsy: `"false"`, `"0"`, `"no"`, `"off"` -> `false`

### `s.port(options?)`
Validates network port numbers. Defaults to integers between `1` and `65535`.

### `s.url(options?)`
Validates absolute URLs via standard WHATWG URL parsing.
* Options:
  * `protocols?: string[]`: e.g. `['http:', 'https:']` or `['postgres:', 'postgresql:']`.

### `s.enum(values)`
Validates that the value matches one of the specified allowed string elements. TypeScript automatically infers union types.

---

## Common Validator Modifiers

- **`.optional()`**: Marks the variable as optional (`T | undefined`).
- **`.default(val)`**: Supplies a fallback value when the variable is missing or empty. Also marks the field as optional.
- **`.sensitive()`**: Explicitly flags the variable as a sensitive secret. (EnvGuard redacts all variable values during error reporting regardless).
- **`.describe(text)`**: Adds descriptive documentation metadata.
- **`.custom(fn, description?)`**: Executes a custom validation function `(value: T) => boolean | string`. If an unhandled exception occurs inside `fn`, it is caught safely and formatted without leaking variables.
- **`.trim()`**: (StringValidator) Trims leading and trailing whitespace.
- **`.nonempty()`**: (StringValidator) Enforces a minimum length of 1 character.

---

## Parser Functions

### `parseDotenv(content, options?)`
Safe zero-eval `.env` parser that strips UTF-8 BOM, skips comments, parses quoted/unquoted values, and guards against prototype pollution.

### `parseDotenvWithMetadata(content, options?)`
Extends `parseDotenv` to return both the parsed `env` dictionary and a list of `duplicateKeys` detected during parsing.
