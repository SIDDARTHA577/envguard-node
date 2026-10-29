# EnvGuard (`envguard-node`)

[![CI](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/ci.yml/badge.svg)](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/codeql.yml/badge.svg)](https://github.com/SIDDARTHA577/envguard-node/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js: 18 | 20 | 22](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

> **Secure, dependency-free environment configuration validation for Node.js, CI/CD, and AI-assisted development.**

---

## 1. Value Proposition

Configuration errors and missing environment variables cause broken deployments, startup crashes, and serious credential leaks:

- **Missing variables** cause applications to fail deep into request handling when a database query or payment gateway is first invoked.
- **Leaky diagnostic errors**: Standard assertion and validation tools often print evaluated values upon failure (`Expected port number, received "postgres://user:super_secret_password@db..."`), leaking sensitive credentials into terminal logs, Datadog/Sentry error trackers, or CI stdout.
- **Untyped strings**: Everything in `process.env` is a string, creating subtle bugs when evaluating ports (`"3000"`), booleans (`"false"` is truthy in JavaScript), or URLs.

**EnvGuard** provides type-safe schema validation with an ironclad security guarantee: **no environment value is ever rendered in errors, terminal diagnostics, stack traces, or JSON outputs.**

---

## 2. Before and After EnvGuard

### Without EnvGuard (Ad-Hoc / Risky)
```javascript
// Unchecked types and potential credential leakage in error logs
const port = parseInt(process.env.PORT, 10); // NaN if missing
if (!process.env.DATABASE_URL) {
  // If logged, custom errors often echo process.env or sensitive variables!
  throw new Error(`Database URL is invalid: ${process.env.DATABASE_URL}`);
}
const isProduction = Boolean(process.env.IS_PROD); // "false" becomes true!
```

### With EnvGuard (Type-Safe & Leak-Proof)
```typescript
import { guard, s } from 'envguard-node';

const config = guard({
  PORT: s.port().default(3000),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] }).sensitive(),
  IS_PROD: s.boolean().default(false),
}, undefined, { throwOnError: true }).data;

// config is strictly typed:
// config.PORT -> number
// config.DATABASE_URL -> string
// config.IS_PROD -> boolean
```

---

## 3. Supported Node.js Versions

Tested continuously on active Node.js LTS releases across **Linux (Ubuntu)** and **Windows**:
- Node.js `22.x`
- Node.js `20.x` (LTS)
- Node.js `18.x`

Zero runtime dependencies. Pure Node.js standard libraries only (`node:fs`, `node:path`, `node:url`).

---

## 4. Installation

Install via your preferred package manager:

```bash
# npm
npm install envguard-node

# pnpm
pnpm add envguard-node

# yarn
yarn add envguard-node
```

For project-local CLI usage in scripts and CI:
```bash
npm install -D envguard-node
```

---

## 5. Quickstart (30 Seconds)

### Step 1: Initialize Configuration
```bash
npx envguard init
```
This safely creates a starter `envguard.config.json` and a clean `.env.example` without overwriting existing files.

### Step 2: Validate Environment
```bash
# Run validation against your environment
npx envguard check

# Or test against a specific environment file
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

| Validator | Options / Description | Example |
|---|---|---|
| `s.string(opts?)` | Strings; `min`, `max`, `pattern`, `choices`, `trim` | `s.string({ min: 16 }).trim()` |
| `s.number(opts?)` | Coerces floats and integers; `min`, `max` | `s.number({ min: 0 })` |
| `s.integer(opts?)` | Whole numbers only | `s.integer().default(100)` |
| `s.port(opts?)` | Network ports `1` through `65535` | `s.port().default(8080)` |
| `s.boolean(opts?)` | Coerces `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"` | `s.boolean().default(false)` |
| `s.url(opts?)` | WHATWG absolute URLs with protocol check | `s.url({ protocols: ['https:'] })` |
| `s.enum(values)` | Union of allowed string values | `s.enum(['dev', 'prod'] as const)` |

### Modifiers
- `.optional()`: Marks variable as optional (`T | undefined`).
- `.default(val)`: Supplies a fallback value when the variable is missing or empty string (`""`).
- `.sensitive()`: Marks field as sensitive secret for documentation.
- `.describe(text)`: Attaches documentation metadata.
- `.custom(fn, desc?)`: Pure custom validation `(val: T) => boolean | string`.

---

## 7. CLI Reference & Exit Codes

```bash
# Check current environment
envguard check

# Check with an explicit schema file
envguard check --schema ./envguard.config.json

# Check against a specified .env file
envguard check --env-file .env.production

# Produce versioned, machine-readable JSON for automated scripts
envguard check --format json

# Strict mode: fail if unexpected variables exist in the environment
envguard check --strict

# Initialize starter configuration and safe .env.example
envguard init [--type json|js] [--force]
```

### Deterministic Exit Codes

| Exit Code | Status | Meaning |
|---|---|---|
| `0` | Success | All environment variables matched the schema. |
| `1` | Validation Failed | One or more variables were missing or invalid. CI step fails. |
| `2` | Configuration Error | Schema file not found, bad syntax, or invalid CLI flag. |

---

## 8. Real-World Integration Examples

Complete, runnable examples are provided in the [`examples/`](./examples/) directory:

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
| `envguard-audit` | Scans codebase for `process.env` references and proposes a safe schema without reading secrets. |
| `envguard-setup` | Automates EnvGuard installation and entrypoint integration tailored to the project's package manager. |
| `envguard-review` | Inspects environment handling for common security vulnerabilities and unmasked error logging. |
| `envguard-ci` | Integrates validation into GitHub Actions or Docker entrypoints. |
| `envguard-migrate` | Migrates legacy ad-hoc `process.env` reads to EnvGuard step-by-step with zero regressions. |

See [`docs/agent-installation.md`](./docs/agent-installation.md) for installation and usage instructions across each host.

---

## 10. Security Model & Privacy

- **Zero Outbound Network Traffic**: EnvGuard runs 100% locally. It contains no telemetry, analytics, or background tracking.
- **Architectural Value Redaction**: Evaluated environment values are discarded rather than masked with asterisks after the fact. Errors contain only the variable name and the failed constraint.
- **Safe Dotenv Parser**: Built-in state machine parser. Does NOT execute arbitrary shell commands, backticks, or subshells.
- **Prototype Pollution Protection**: Rejects `__proto__`, `constructor`, and `prototype` keys during schema ingestion.
- **Limitations**: EnvGuard validates the *shape, type, and format* of configuration; it does not connect to external third-party services to verify whether API keys are active.

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
