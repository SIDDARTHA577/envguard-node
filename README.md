# EnvGuard (`envguard-node`)

[![CI](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/ci.yml/badge.svg)](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/codeql.yml/badge.svg)](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js: >=20.0.0](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

> **Dependency-free environment configuration validation for Node.js, CI/CD pipelines, and AI-assisted development.**

---

> [!IMPORTANT]
> **Pre-Release Notice**: `envguard-node` is currently in development and has **not yet been published to the public npm registry**. Running `npm install envguard-node` will return HTTP 404 until the initial release is approved and published.
> To use or evaluate EnvGuard today, follow the tested **[Local Source Installation](#installation-and-testing-pre-release)** instructions below.

---

## 1. Problem & Value Proposition

Missing or malformed environment variables are among the most frequent causes of runtime outages and configuration errors in Node.js applications:

- **Late-failure during runtime**: A missing API key or connection string often causes crashes deep into request handling rather than failing fast at startup.
- **Accidental secret exposure in diagnostics**: Standard validation libraries and ad-hoc assertions frequently echo evaluated values upon failure (`Expected port number, received "postgres://user:secret@..."`), causing credentials to be logged to terminal output, monitoring services, or CI/CD logs.
- **Untyped string inputs**: Everything in `process.env` is a string, causing subtle logic bugs when parsing ports (`"3000"`), booleans (`"false"` is truthy in JavaScript), or URLs.

**EnvGuard** provides type-safe schema validation designed from the ground up to **omit raw environment values from validation error objects, terminal reports, and JSON diagnostics**.

---

## 2. Before and After EnvGuard

### Without EnvGuard (Ad-Hoc / Risky)
```javascript
// Potential crashes, untyped inputs, and raw values echoed in errors
const port = parseInt(process.env.PORT, 10); // NaN if missing
if (!process.env.DATABASE_URL) {
  // Dangerous: Custom error or logger may echo the sensitive variable!
  throw new Error(`Database URL missing or invalid: ${process.env.DATABASE_URL}`);
}
const isProduction = Boolean(process.env.IS_PROD); // "false" evaluates to true!
```

### With EnvGuard (Type-Safe & Secret-Redacted)
```typescript
import { guard, s } from 'envguard-node';

const config = guard({
  PORT: s.port().default(3000),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] }).sensitive(),
  IS_PROD: s.boolean().default(false),
}, undefined, { throwOnError: true }).data;

// config is strictly typed with coerced values:
// config.PORT -> number
// config.DATABASE_URL -> string
// config.IS_PROD -> boolean
```

---

## 3. Supported Node.js Versions

EnvGuard officially supports maintained Node.js LTS and current releases across **Linux (Ubuntu)** and **Windows**:
- Node.js `24.x` (Current / Future LTS)
- Node.js `22.x` (Active LTS)
- Node.js `20.x` (Maintenance LTS)

> [!NOTE]
> Node.js 18 reached official End-of-Life (EOL) on April 30, 2025. Modern test tooling and V8 APIs (e.g. `node:util` `styleText`) require Node.js `>=20.0.0`. Older Node versions are not supported.

Zero runtime dependencies. Pure Node.js standard libraries only (`node:fs`, `node:path`, `node:url`).

---

## 4. Installation & Setup

### Local Source Installation (Pre-Release / Current)

Since `envguard-node` is not yet on the public npm registry, install from source or a local tarball:

```bash
# Clone the repository
git clone https://github.com/SIDDARTHA577/envguard-node.git
cd envguard-node

# Install dependencies and build
npm install
npm run build

# Link globally for local development
npm link

# In your consumer project:
npm link envguard-node
```

Alternatively, build a self-contained tarball:
```bash
npm pack
# Installs the generated archive in your target application
npm install /path/to/envguard-node-1.0.0.tgz
```

### Future Public npm Installation (Post-Publication Workflow)

*The following commands will become active upon official release approval:*

```bash
# Library dependency
npm install envguard-node

# Project-local CLI dependency for scripts and CI
npm install -D envguard-node
```

> **Note on Naming**: The npm package name is `envguard-node`. The installed command-line executable is `envguard` (invoked via `npx envguard`).

---

## 5. Quickstart (30 Seconds)

### Step 1: Initialize Configuration
```bash
npx envguard init
```
This safely creates a starter `envguard.config.json` and a clean `.env.example` without silently overwriting existing files.

### Step 2: Validate Environment
```bash
# Validate against current environment
npx envguard check

# Validate against a specific environment file
npx envguard check --env-file .env.example
```

---

## 6. Programmatic API Reference

EnvGuard supports both **ESM (`import`)** and **CommonJS (`require`)**:

```typescript
// ESM
import { guard, s, defineSchema } from 'envguard-node';

// CommonJS
const { guard, s, defineSchema } = require('envguard-node');
```

### Validators & Modifiers

| Validator | Options / Constraints | Example |
|---|---|---|
| `s.string(opts?)` | Strings; `min`, `max`, `pattern`, `choices`, `trim` | `s.string({ min: 16 }).trim()` |
| `s.number(opts?)` | Numeric coercion (floats and integers); `min`, `max` | `s.number({ min: 0 })` |
| `s.integer(opts?)` | Whole numbers only | `s.integer().default(100)` |
| `s.port(opts?)` | Network ports `1` through `65535` | `s.port().default(8080)` |
| `s.boolean(opts?)` | Coerces `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"` | `s.boolean().default(false)` |
| `s.url(opts?)` | Absolute URLs with optional protocol whitelist | `s.url({ protocols: ['https:'] })` |
| `s.enum(values)` | Union of allowed string values | `s.enum(['dev', 'prod'] as const)` |

### Modifiers
- `.optional()`: Allows variable to be omitted (`T | undefined`).
- `.default(val)`: Fallback value when variable is missing or empty string (`""`).
- `.sensitive()`: Flags variable as sensitive for documentation purposes.
- `.describe(text)`: Attaches documentation metadata.
- `.custom(fn, desc?)`: Pure custom validation `(val: T) => boolean | string`.
- `.trim()`: (StringValidator) Trims leading/trailing whitespace.
- `.nonempty()`: (StringValidator) Enforces minimum length of 1 character.

---

## 7. CLI Reference & Exit Codes

```bash
# Check current environment
npx envguard check

# Check with an explicit schema file
npx envguard check --schema ./envguard.config.json

# Check against a specified .env file
npx envguard check --env-file .env.production

# Machine-readable JSON output for automated CI processing
npx envguard check --format json

# Strict mode: fail if unexpected variables exist
npx envguard check --strict

# Initialize starter configuration and safe .env.example
npx envguard init [--type json|js] [--force]
```

### Deterministic Exit Codes

| Exit Code | Status | Meaning |
|---|---|---|
| `0` | Success | All environment variables passed validation. |
| `1` | Validation Failed | One or more variables were missing or invalid. CI step fails. |
| `2` | Configuration Error | Schema file not found, bad syntax, or invalid CLI flag. |

---

## 8. Real-World Integration Examples

Runnable examples are provided in [`examples/`](./examples/):

- [`examples/basic-app/`](./examples/basic-app/): Minimal Node.js application startup.
- [`examples/express-app/`](./examples/express-app/): HTTP server pre-flight validation preventing broken sockets.
- [`examples/docker-app/`](./examples/docker-app/): Multi-stage container entrypoint validation with `.dockerignore`.
- [`examples/multi-env/`](./examples/multi-env/): Composable schemas with strict production overrides.
- [`examples/cli-workflow/`](./examples/cli-workflow/): Automated CI validation pipeline.

---

## 9. AI Coding Agent Skills

EnvGuard provides installable skills for AI coding agents (**Google Antigravity**, **Claude Code**, and **OpenAI Codex**):

| Skill | Purpose |
|---|---|
| `envguard-audit` | Scans codebase for `process.env` references and proposes a schema without reading secrets. |
| `envguard-setup` | Automates EnvGuard installation and entrypoint integration tailored to the project's package manager. |
| `envguard-review` | Inspects environment handling for common security vulnerabilities and unmasked error logging. |
| `envguard-ci` | Integrates validation into GitHub Actions or Docker entrypoints. |
| `envguard-migrate` | Migrates legacy ad-hoc `process.env` reads to EnvGuard step-by-step with zero regressions. |

See [`docs/agent-installation.md`](./docs/agent-installation.md) for installation and usage instructions across each host.

---

## 10. Security Model & Explicit Boundaries

- **Redacted Built-In Diagnostics**: EnvGuard's built-in error messages, serialized errors, terminal reports, and JSON diagnostics are designed and tested not to include raw environment variable values.
- **Application Responsibility**: EnvGuard cannot prevent data leaks if application code or custom validator functions independently log, print, or expose secrets via external logging utilities.
- **Not a Secrets Manager**: EnvGuard validates the *presence, format, and type* of configuration variables. It does not replace secrets management systems (e.g. AWS Secrets Manager, HashiCorp Vault, 1Password) and does not verify whether external API keys are active against remote services.
- **Zero Outbound Network Traffic**: EnvGuard runs 100% locally with zero telemetry, analytics, or background tracking.
- **Safe Dotenv Parser**: Pure JavaScript parser. Does NOT execute shell commands, backticks, or subshell substitutions.
- **Prototype Pollution Protection**: Explicitly rejects `__proto__`, `constructor`, and `prototype` keys during schema ingestion and JSON loading.

---

## 11. Security Vulnerability Reporting

Please report security vulnerabilities privately:
- Submit an advisory via [GitHub Private Vulnerability Reporting](https://github.com/SIDDARTHA577/envguard-node/security/advisories/new).
- Or email `190904900+SIDDARTHA577@users.noreply.github.com`.
- Full disclosure policy: [SECURITY.md](./SECURITY.md).

---

## 12. Contributing

We welcome community pull requests and bug reports! See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

```bash
# Clone and install dependencies
git clone https://github.com/SIDDARTHA577/envguard-node.git
cd envguard-node
npm install

# Run checks
npm run typecheck
npm run lint
npm test
npm run test:pack
```

---

## 13. Roadmap & Adoption

- [Product Roadmap](./docs/roadmap.md): Planned framework adapters and features.
- [Adoption & Metrics Guide](./docs/adoption-guide.md): Guide to measuring verified open-source metrics.
- [Engineering Audit](./docs/engineering-audit.md): Complete technical baseline and architecture decisions.

---

## 14. License

[MIT License](./LICENSE) © 2026 SIDDARTHA577.
