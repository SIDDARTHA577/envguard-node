# EnvGuard (`envguard-node`)

> Production-ready, zero-secrets-leakage environment variable validation library and CLI for Node.js and TypeScript.

---

## 1. The Problem EnvGuard Solves

Missing or misconfigured environment variables are among the most common causes of production outages, deployment failures, and security mishaps in Node.js applications:

- Applications crash halfway through startup when a forgotten variable is accessed deep inside a controller or service.
- Standard assertion libraries or manual checks often echo raw values into logs, exceptions, or terminal displays during errors, inadvertently exposing database credentials, API keys, and auth secrets.
- Inconsistent types: environment variables are always strings in `process.env`, leading to bugs when evaluating ports, booleans (e.g. `"false"` being truthy in JavaScript), or URLs.

**EnvGuard** provides type-safe, declarative environment validation with an ironclad architectural guarantee: **no environment value is ever rendered in error messages, stack traces, terminal reports, or machine-readable JSON outputs.**

---

## 2. Who Should Use It

- **Backend Engineers & Teams**: Catch missing credentials and invalid configurations immediately during boot before initializing servers or database connection pools.
- **DevOps & Platform Engineers**: Validate `.env` files and runtime configurations inside CI/CD pipelines (GitHub Actions, GitLab CI, Docker entrypoints) with deterministic exit codes.
- **Open-Source Maintainers**: Ensure sample `.env.example` configurations remain synchronized with application requirements.

---

## 3. Installation

Install as a dependency using your preferred package manager:

```bash
# npm
npm install envguard-node

# yarn
yarn add envguard-node

# pnpm
pnpm add envguard-node
```

If using the CLI in local scripts or CI:

```bash
npm install --save-dev envguard-node
```

---

## 4. Quick-Start Example

```typescript
import { guard, s } from 'envguard-node';

// Define configuration shape
const schema = {
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  PORT: s.port().default(3000),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] })
    .sensitive()
    .describe('PostgreSQL database connection URL'),
  API_SECRET: s.string({ min: 16 })
    .sensitive()
    .describe('Third-party API key'),
};

// Validate against process.env
const result = guard(schema);

if (!result.success) {
  console.error('Configuration validation failed:');
  for (const err of result.errors) {
    // Variable name and issue type are reported, never the underlying secret value
    console.error(` - [${err.issue.toUpperCase()}] ${err.key}: ${err.message}`);
  }
  process.exit(1);
}

// result.data is strictly typed with coerced values
const { PORT, DATABASE_URL, NODE_ENV } = result.data;
console.log(`Starting server on port ${PORT} in ${NODE_ENV} mode...`);
```

---

## 5. CLI Usage

EnvGuard includes a standalone command-line interface:

```bash
# Run validation against auto-detected config (envguard.config.json or .js)
npx envguard check

# Validate against an explicit schema file
npx envguard check --schema ./envguard.config.json

# Validate against a specific .env file
npx envguard check --env-file .env.production

# Produce machine-readable JSON output for automated CI scripts
npx envguard check --format json

# Strict mode: fail if unexpected variables exist in the environment
npx envguard check --strict

# Initialize a starter configuration and safe .env.example
npx envguard init
```

---

## 6. Library Usage

### Programmatic API

```typescript
import { guard, s, EnvGuardValidationError } from 'envguard-node';

const appSchema = {
  PORT: s.port().default(8080),
  CACHE_TTL: s.number().default(3600),
  DEBUG_MODE: s.boolean().default(false),
};

// 1. Explicit environment object (deterministic, ideal for unit testing)
const testEnv = { PORT: '9000', CACHE_TTL: '60', DEBUG_MODE: 'true' };
const testResult = guard(appSchema, testEnv);
// testResult.data -> { PORT: 9000, CACHE_TTL: 60, DEBUG_MODE: true }

// 2. Throwing on validation failure
try {
  const result = guard(appSchema, process.env, { throwOnError: true });
} catch (error) {
  if (error instanceof EnvGuardValidationError) {
    console.error(error.message); // Safe summary without leaking values
  }
}
```

---

## 7. Schema Options & Validators

| Validator | Description | Example / Options |
|---|---|---|
| `s.string(options?)` | String validation | `s.string({ min: 8, max: 64, pattern: /^[A-Z0-9]+$/ })` |
| `s.number(options?)` | Numeric coercion (integers & floats) | `s.number({ min: 0, max: 100 })` |
| `s.integer(options?)` | Whole numbers only | `s.integer({ min: 1 })` |
| `s.port(options?)` | Network port (1–65535) | `s.port().default(3000)` |
| `s.boolean(options?)` | Coerces `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"` | `s.boolean().default(false)` |
| `s.url(options?)` | WHATWG URL validation | `s.url({ protocols: ['https:'] })` |
| `s.enum(allowedValues)` | Union string validation | `s.enum(['dev', 'prod'] as const)` |

### Modifiers
- `.optional()`: Allows variable to be omitted (`T | undefined`).
- `.default(value)`: Supplies a fallback value when variable is missing or empty.
- `.sensitive()`: Marks field as sensitive secret.
- `.describe(description)`: Adds documentation metadata.
- `.custom(fn, description?)`: Pure sync validation logic `(val: T) => boolean | string`.

---

## 8. Validation Errors

Validation failures return structured error items containing:

- `key`: The variable name (e.g., `DATABASE_URL`).
- `type`: Expected validator type.
- `issue`: One of `missing`, `invalid_type`, `out_of_range`, `invalid_format`, `custom_check_failed`, or `unexpected_variable`.
- `message`: Human-readable description of the constraint that failed.
- `expected`: Description of acceptable range or pattern.

**Guaranteed Value Protection**: The actual environment value is **never** attached to the error item, preventing accidental exposure when serializing or printing error lists.

---

## 9. Exit Codes

When running in CLI environments or CI/CD pipelines:

| Code | Status | Meaning |
|---|---|---|
| `0` | Success | All environment variables passed validation. |
| `1` | Validation Failed | One or more variables were missing, unparseable, or out of range. |
| `2` | Configuration Error | Schema file not found, bad syntax, or invalid CLI flag. |

---

## 10. Security & Limitations

### Security Principles
- **No Telemetry / No Network Calls**: Runs strictly offline using Node.js standard libraries.
- **Safe Dotenv Parser**: No `eval`, no command execution, and no shell child processes.
- **Redaction by Architecture**: Evaluated values are discarded from error outputs rather than masked after the fact.

### Limitations
- EnvGuard validates the **format, type, and shape** of environment configuration; it does not connect to external servers to verify whether credentials are authentication-valid.
- Nested object schemas are supported via declarative JSON configurations or custom functions.

---

## 11. Contributing Instructions

Contributions are welcome! Please review our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).

1. Fork and clone the repository.
2. Install dependencies: `npm install`.
3. Verify tests: `npm test`.
4. Ensure no secrets are present in new tests or documentation.
5. Submit a pull request against `main`.

---

## 12. How to Report Vulnerabilities

If you discover a security issue or potential information leak:

- **Do not open a public GitHub issue.**
- Submit an advisory via [GitHub Private Vulnerability Reporting](https://github.com/SIDDARTHA577/envguard-node/security/advisories/new) or email `190904900+SIDDARTHA577@users.noreply.github.com`.
- See [SECURITY.md](./SECURITY.md) for full policy details.

---

## 13. Development and Testing Instructions

```bash
# Clone the project
git clone https://github.com/SIDDARTHA577/envguard-node.git
cd envguard-node

# Install dev dependencies
npm install

# Run Vitest test suite
npm test

# Run TypeScript type checking
npm run typecheck

# Run ESLint
npm run lint

# Compile production bundle
npm run build
```

---

## 14. Current Project Status

- **Version**: `1.0.0`
- **Maintenance**: Actively maintained by `SIDDARTHA577`.
- **Ecosystem Status**: Initial public release. Feedback, issues, and PRs are welcomed from the community.
