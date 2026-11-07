# EnvGuard v1.0.0 Release Notes

- **Package:** `envguard-node`
- **CLI Executable:** `envguard`
- **Version:** `1.0.0`
- **Release Date:** November 2, 2026
- **Release Baseline Commit SHA:** `5ea15dc4cb10caf8b5f68d859906115509c207e2`
- **License:** MIT
- **Supported Runtimes:** Node.js 22.x (Maintenance LTS), 24.x (Maintenance LTS), 26.x (Active LTS)
- **Target Operating Systems:** Linux (Ubuntu - CI verified via ubuntu-latest), Windows (Windows Server - CI verified via windows-latest), macOS (Runtime compatible; not currently CI verified)

---

## 1. Overview & Purpose

EnvGuard is a production-grade TypeScript library and command-line tool for runtime environment variable validation, secret leak mitigation, and automated CI configuration drift detection.

Unlike bloated schema libraries or single-purpose dotenv parsers, EnvGuard delivers:
- **Zero external runtime dependencies**: No third-party packages installed in production runtimes.
- **Strict type coercion and fail-fast startup validation**: Stops misconfigured containers or serverless invocations before bad configurations reach production code.
- **Accidental secret exposure mitigation**: Automatic secret masking (`[REDACTED]`) across logs, console output, and JSON reports.
- **Dual ESM & CommonJS distribution**: Seamless integration with modern ESM (`import`) and legacy CommonJS (`require()`) runtimes.
- **First-class AI Agent Skills**: Turnkey skills for Claude Code, OpenAI Codex, Cursor, and Antigravity.

---

## 2. Key Features & Code Examples

### 2.1 Programmatic Schema Definition

```typescript
import { guard, s } from 'envguard-node';

const result = guard({
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  PORT: s.port().default(3000),
  DATABASE_URL: s.url().sensitive(),
  API_KEY: s.string({ min: 16 }).sensitive(),
  ENABLE_METRICS: s.boolean().default(false),
  WORKERS: s.integer({ min: 1, max: 32 }).default(4),
});

if (!result.success) {
  console.error('Environment validation failed:', result.errors);
  process.exit(1);
}

export const env = result.data;

// Fully type-safe inference:
console.log(`Server starting on port ${env.PORT} in ${env.NODE_ENV} mode with ${env.WORKERS} workers.`);
```

### 2.2 ReDoS-Safe Dotenv Parser

EnvGuard features a built-in parser for `.env` files with deterministic linear comment scanning, eliminating polynomial regular expression hazards while supporting unquoted, quoted, and multiline values:

```typescript
import { parseDotenv } from 'envguard-node';

const parsed = parseDotenv(`
# Application Settings
APP_ENV=production
# Trailing comment safe parsing
MAX_RETRIES=5 # maximum network retries
DB_SECRET="very-secure-password#with-hash"
`);
```

### 2.3 CLI Command-Line Interface

The package ships with an executable named `envguard`. In projects where `envguard-node` is installed:

```bash
# Verify environment variables against schema
npm exec --package=envguard-node -- envguard check

# Emit machine-readable JSON reports for CI/CD pipelines
npm exec --package=envguard-node -- envguard check --format json

# Initialize a new config file and .env.example
npm exec --package=envguard-node -- envguard init
```

---

## 3. Supported Node.js Versions & Platforms

In strict alignment with the official Node.js Working Group release schedule as of November 2026:
- **Node.js 26.x**: Active LTS
- **Node.js 24.x**: Maintenance LTS
- **Node.js 22.x**: Maintenance LTS
- *Note: Node.js 18.x and Node.js 20.x have reached End-of-Life (EOL) and are not supported.*

Operating system verification status:
- Linux (ubuntu-latest GitHub Actions runner): **CI verified**
- Windows (windows-latest GitHub Actions runner): **CI verified**
- macOS: **Runtime compatible; not currently CI verified**

---

## 4. Security Architecture & Design Guarantees

- **Sensitive Value Redaction**: Any field flagged `.sensitive()` or possessing sensitive naming heuristics (`SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `AUTH`, `CREDENTIAL`) is redacted as `[REDACTED]` in validation error output and JSON reports to mitigate accidental secret exposure.
- **ReDoS Prevention**: Trailing comments are identified using a deterministic linear scan (`findTrailingCommentIndex`) rather than polynomial regex backtracking.
- **Safe Object Assignment**: Internal configuration parsing uses `Object.defineProperty` and prototype-pollution-safe dictionary assignment.
- **Zero Runtime Dependencies**: `dependencies` in `package.json` is completely empty (`{}`), substantially reducing third-party dependency exposure in production runtimes, though developers must remain vigilant regarding devDependencies, build systems, and deployment infrastructure.

---

## 5. AI Agent Skills Integration

EnvGuard ships with 5 production-ready AI skills located in `.agents/skills/` (compatible with Antigravity and Codex) and `skills/` (compatible with Claude Code and Cursor):

| Skill Name | Purpose |
| :--- | :--- |
| `envguard-setup` | Automatically installs `envguard-node`, determines package manager, and generates `envguard.config.ts`. |
| `envguard-audit` | Analyzes codebases for `process.env` references, checks coverage, and creates `.env.example`. |
| `envguard-migrate`| Automates migration from `dotenv`, `envalid`, or `joi` to EnvGuard with zero regressions. |
| `envguard-ci` | Integrates validation checks into GitHub Actions, GitLab CI, or Docker entrypoints. |
| `envguard-review` | Audits configurations for unvalidated variables, console.log leaks, and security risks. |

---

## 6. Breaking Changes

- **None**: This is the initial stable release (`v1.0.0`).

---

## 7. Migration Guide

### Migrating from `dotenv`
```diff
- import dotenv from 'dotenv';
- dotenv.config();
- const port = Number(process.env.PORT) || 3000;
+ import { guard, s } from 'envguard-node';
+ const result = guard({ PORT: s.port().default(3000) }, process.env, { throwOnError: true });
+ const port = result.data.PORT;
```

### Migrating from `envalid`
```diff
- import { cleanEnv, str, port } from 'envalid';
- export const env = cleanEnv(process.env, {
-   NODE_ENV: str({ choices: ['development', 'production'] }),
-   PORT: port({ default: 3000 }),
- });
+ import { guard, s } from 'envguard-node';
+ const result = guard({
+   NODE_ENV: s.enum(['development', 'production']).default('development'),
+   PORT: s.port().default(3000),
+ }, process.env, { throwOnError: true });
+ export const env = result.data;
```

Alternatively, when handling validation results programmatically without throwing:
```typescript
const result = guard({ PORT: s.port().default(3000) });
if (!result.success) {
  console.error('Configuration errors:', result.errors);
  process.exit(1);
}
const port = result.data.PORT;
```

---

## 8. Verification & Test Evidence

- **Unit & Integration Suite**: 62 tests passing across 6 test suites (`tests/cli.test.ts`, `tests/dotenv.test.ts`, `tests/guard.test.ts`, `tests/security.test.ts`, `tests/validators.test.ts`, `tests/plugin/manifest.test.ts`).
- **Tarball Smoke Verification**: Full extraction test validating ESM exports, CommonJS exports, and executable CLI execution in an isolated temporary directory.
- **GitHub Actions Matrix**: 7/7 jobs green across Ubuntu/Windows runners on Node 22, 24, and 26. (macOS not currently CI verified).
- **Static Security Analysis**: 0 open CodeQL alerts (`repos/SIDDARTHA577/envguard-node/code-scanning/alerts` is empty).
- **Supply Chain Audit**: 0 vulnerabilities via `npm audit`.

---

## 9. Publish Readiness Checklist (For Repository Owner)

When ready to publish EnvGuard v1.0.0 to npm and GitHub Releases, execute the following verified steps:

```bash
# 1. Ensure you are on the merged main branch with a clean working tree:
git checkout main
git pull origin main

# 2. Create and push the release tag:
git tag v1.0.0
git push origin v1.0.0

# 3. Publish to npm:
npm publish --access public

# 4. Verify npm publication:
npm view envguard-node version

# 5. Create the GitHub release:
gh release create v1.0.0 \
  --title "v1.0.0 - Production-Ready Release" \
  --notes-file docs/release-v1.0.0-notes.md

# 6. Verify automated release workflows on GitHub Actions:
gh run list --branch v1.0.0
```
