---
name: envguard-audit
description: Scans a codebase for environment variable usage (e.g. process.env, import.meta.env), identifies required configuration keys, and recommends a type-safe EnvGuard schema and safe .env.example without exposing secret values.
---

# `envguard-audit` Skill

Scans a codebase to discover environment variable usage, deduce required types and constraints, and propose an EnvGuard schema and a synthetic `.env.example`.

## When to Trigger
- The user requests an audit or inventory of environment variables in a project.
- The project needs an accurate `.env.example` generated from source code.
- Preparing to onboard an application to structured configuration validation.

## When NOT to Trigger
- Modifying or refactoring code without prior discovery (use `envguard-migrate`).
- Setting up build/runtime dependencies (use `envguard-setup`).
- The project does not use environment variables or runtime configurations.

## Supported Projects & Environments
- Node.js applications (CommonJS or ESM).
- TypeScript and JavaScript codebases.
- Monorepos and standalone repositories.
- Web frameworks: Express, Fastify, Next.js, Vite, NestJS, Koa.

## Required Tools & Permissions
- Tools: File search / grep, file reading (`read_file`, `run_command`).
- Permissions: Read-only access to workspace source files. No network or write access required.

## Expected Inputs
- Project root path containing source files (`src/`, `lib/`, `app/`, etc.).
- Optional: existing configuration files (`.env.example`, `package.json`, `tsconfig.json`).

## Step-by-Step Workflow

### Step 1: Scan Source Files for Environment References
Search for environment variable access patterns across all source files:
- `process.env.VARIABLE_NAME`
- `process.env['VARIABLE_NAME']`
- `import.meta.env.VARIABLE_NAME`

### Step 2: Deduce Types & Sensitivity Heuristics
Analyze surrounding code for usage hints:
- Numeric conversions (`Number(...)`, `parseInt(...)`) or port assignments -> `s.port()` or `s.integer()`
- Protocol checks or URL instantiation (`new URL(...)`, DB connection strings) -> `s.url()`
- Boolean comparisons (`=== 'true'`, `=== '1'`) -> `s.boolean()`
- Specific finite values or string checks -> `s.enum([...])`
- High-entropy tokens, passwords, keys (`SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `AUTH`) -> mark `.sensitive()`

### Step 3: Check Existing Configuration Files
- Inspect `.env.example` if present to identify documented keys.
- Check `.gitignore` to ensure real `.env` files are excluded.

### Step 4: Generate Recommendations
- Propose an EnvGuard schema definition.
- Propose a clean `.env.example` template with synthetic placeholders.

## Validation Steps
- Verify that every discovered environment key in source code is mapped in the proposed schema.
- Confirm all sensitive keys are flagged with `.sensitive()`.
- Ensure no real credentials appear in the proposed `.env.example`.

## Expected Outputs
- An inventory table of all discovered environment variables with inferred types.
- A proposed TypeScript or JSON EnvGuard schema.
- A proposed `.env.example` file using purely synthetic placeholder values.

## Failure Handling
- If source files cannot be read or parsed, report the affected paths and request permission.
- If a variable's type is ambiguous, default to `s.string()` and explain the assumption.

## Safety & Privacy Boundaries
- **NEVER** inspect, read, or print real production credentials or local `.env` values.
- **NEVER** write or overwrite workspace files during an audit without explicit consent.
- **NEVER** transmit repository source code or environment names externally.

## Example User Prompts
- "Audit this project's environment variables with envguard-audit"
- "Scan my codebase for all process.env calls and suggest an EnvGuard schema"
- "Generate a safe .env.example template for this repository"
