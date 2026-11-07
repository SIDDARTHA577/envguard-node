---
name: envguard-migrate
description: Guides the safe, step-by-step migration of an existing Node.js codebase from raw process.env or ad-hoc validation (dotenv, joi, envalid) to EnvGuard with zero regressions.
---

# `envguard-migrate` Skill

Guides the safe, incremental migration of an existing codebase from raw `process.env` lookups or legacy configuration libraries (`dotenv`, `envalid`, `joi`) to EnvGuard with zero regressions.

## When to Trigger
- The user asks to migrate an application from `dotenv`, `envalid`, or `joi` to EnvGuard.
- The user wants to replace scattered, untyped `process.env` references with a centralized, type-safe configuration object.
- Modernizing configuration validation in an established codebase.

## When NOT to Trigger
- Greenfield projects with no existing code to migrate (use `envguard-setup`).
- Conducting an initial static discovery scan without modifying files (use `envguard-audit`).
- User only wants a security review of current practices (use `envguard-review`).

## Supported Projects & Environments
- Node.js applications with existing `dotenv`, `envalid`, `joi`, or raw `process.env` usage.
- TypeScript and JavaScript codebases.
- Monorepos and single-package projects.

## Required Tools & Permissions
- Tools: Grep / search, file reader, file writer, test runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to update configuration and source files.

## Expected Inputs
- Project source code directory.
- Existing environment initialization files (`.env`, `dotenv.config()`, `cleanEnv(...)`).

## Step-by-Step Workflow

### Step 1: Inventory Existing Configuration & Fallbacks
- Locate all direct `process.env` calls across the codebase:
  ```bash
  grep -rn "process.env" src/
  ```
- Note default fallback values (e.g. `process.env.PORT || 3000`) and parse types.

### Step 2: Create Centralized EnvGuard Schema
- Build a dedicated typed config file (e.g. `src/config/env.ts`):
  ```typescript
  import { guard, s } from 'envguard-node';

  const result = guard({
    PORT: s.port().default(3000),
    DATABASE_URL: s.url().sensitive(),
    NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  }, process.env, { throwOnError: true });

  export const env = result.data;
  ```

### Step 3: Incrementally Refactor Source Files
- Replace direct `process.env.VAR` reads with `env.VAR` imports file-by-file:
  ```typescript
  // Before:
  const port = parseInt(process.env.PORT || '3000', 10);

  // After:
  import { env } from './config/env.js';
  const port = env.PORT; // type: number
  ```

### Step 4: Remove Deprecated Dependencies
- Once all references are migrated, remove legacy dependencies (`envalid`, `dotenv`) if no longer needed.
- Update `package.json` and lockfile.

## Validation Steps
- Run the project test suite (`npm test`) after each file modification to guarantee zero behavioral regressions.
- Execute type checking (`npm run typecheck` or `npx tsc --noEmit`) to verify strict type alignment.

## Expected Outputs
- Centralized `src/config/env.ts` (or `env.js`).
- Refactored source files using the typed `env` export.
- Clean test run demonstrating zero regressions.

## Failure Handling
- If tests fail after a file modification, revert that file immediately and investigate fallback mismatches.
- If existing runtime behavior relies on unvalidated dynamic keys, document the exception and preserve compatibility.

## Safety & Privacy Boundaries
- **NEVER** alter existing variable names or default fallback semantics without explicit approval.
- **NEVER** commit or expose real secrets during migration.
- Always verify all unit tests pass before committing changes.

## Example User Prompts
- "Migrate raw process.env references to EnvGuard with envguard-migrate"
- "Replace envalid with EnvGuard with zero regressions"
- "Safely transition our dotenv configuration to EnvGuard"
