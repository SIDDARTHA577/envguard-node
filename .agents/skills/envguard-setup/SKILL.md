---
name: envguard-setup
description: Guides the installation and configuration of EnvGuard in a Node.js/TypeScript project, generating appropriate schema files, .env.example, and startup validation checks tailored to the project's package manager.
---

# `envguard-setup` Skill

Guides the installation, configuration file generation, and startup fail-fast validation integration of EnvGuard in Node.js and TypeScript projects.

## When to Trigger
- The user asks to install or configure EnvGuard in a project.
- The project needs fail-fast runtime environment validation at startup.
- Initializing `envguard.config.ts` or `envguard.config.json` with matching `.env.example`.

## When NOT to Trigger
- EnvGuard is already installed and properly validating configurations.
- Conducting a non-destructive audit without installing packages (use `envguard-audit`).
- Migrating legacy libraries with extensive existing refactoring needs (use `envguard-migrate`).

## Supported Projects & Environments
- Node.js 22.x, 24.x, and 26.x.
- Package managers: `npm`, `pnpm`, `yarn`, `bun`.
- Module formats: modern ESM (`"type": "module"`) and CommonJS.
- TypeScript (`tsconfig.json`) or plain JavaScript environments.

## Required Tools & Permissions
- Tools: File reader, file writer, command execution (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to install packages and write configuration files.

## Expected Inputs
- Project root path containing `package.json`.
- Desired environment variables or existing `.env.example`.

## Step-by-Step Workflow

### Step 1: Detect Project Tooling & Module System
- Inspect `package.json` for module system (`"type": "module"` for ESM, otherwise CommonJS).
- Detect the active package manager via lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`).
- Check for TypeScript presence via `tsconfig.json` or devDependencies.

### Step 2: Install `envguard-node`
- Run the detected package manager install command:
  - npm: `npm install envguard-node`
  - pnpm: `pnpm add envguard-node`
  - yarn: `yarn add envguard-node`

### Step 3: Initialize Configuration File
- Generate `envguard.config.ts` (or `envguard.config.js` / `envguard.config.json`) defining the schema.
- Create or update `.env.example` with safe placeholder values matching the schema.

### Step 4: Inject Startup Fail-Fast Check
- Integrate validation at the earliest entry point (`src/index.ts`, `src/server.ts`, or `src/app.js`):
  ```typescript
  import { guard } from 'envguard-node';
  import configSchema from './envguard.config.js';

  const config = guard(configSchema, undefined, { throwOnError: true }).data;
  export { config };
  ```

## Validation Steps
- Verify `package.json` includes `envguard-node` in dependencies.
- Execute `npx envguard check` to verify configuration syntax.
- Run `npm test` or the project build command to ensure no type or runtime regression.

## Expected Outputs
- `package.json` updated with `envguard-node`.
- A newly created `envguard.config.ts` or `envguard.config.json`.
- A synchronized `.env.example` file.
- Entrypoint updated with fail-fast initialization.

## Failure Handling
- If installation fails due to package manager errors, display the exact error and suggest manual installation.
- If overwriting an existing configuration file is required, prompt for explicit user confirmation.

## Safety & Privacy Boundaries
- **NEVER** write or overwrite actual `.env` files containing secrets.
- **NEVER** log or expose raw environment values during setup commands.
- Ensure `.gitignore` ignores `.env` and `.env.local` before completing setup.

## Example User Prompts
- "Configure startup environment validation with envguard-setup"
- "Install and set up EnvGuard in this project"
- "Initialize envguard.config.ts and fail-fast startup checks"
