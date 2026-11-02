---
name: envguard-setup
description: Guides the installation and configuration of EnvGuard in a Node.js/TypeScript project, generating appropriate schema files, .env.example, and startup validation checks tailored to the project's package manager.
---

# `envguard-setup` Skill

Use this skill when installing and configuring EnvGuard in a project for the first time.

## Safety & Security Constraints

1. **Preserve Package Manager Conventions**:
   - Inspect whether the project uses `npm`, `pnpm`, or `yarn` (via lockfiles) and use the matching tool.
2. **Non-Destructive Initialization**:
   - Never overwrite existing `.env`, `.env.example`, or configuration files without confirmation.
3. **No Arbitrary Code Execution**:
   - Do not invoke dynamic shell commands with untrusted arguments.

---

## Workflow Steps

### Step 1: Detect Project Tooling
- Check for `package.json`, `tsconfig.json`, and lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
- Determine whether the project is ESM (`"type": "module"`) or CommonJS.

### Step 2: Install EnvGuard
- Run the appropriate package manager command:
  - npm: `npm install envguard-node`
  - pnpm: `pnpm add envguard-node`
  - yarn: `yarn add envguard-node`

### Step 3: Initialize Configuration
- Run `npx envguard init` to create a starter configuration and `.env.example`.
- If the project is pure TypeScript, recommend `envguard.config.ts` or `envguard.config.json`.

### Step 4: Inject Startup Validation
- Integrate validation at the very top of the application's entrypoint (`index.ts`, `server.ts`, or `app.js`):
  ```typescript
  import { guard } from 'envguard-node';
  import configSchema from './envguard.config.js';

  // Fail fast before establishing server or database connections
  const config = guard(configSchema, undefined, { throwOnError: true }).data;
  ```

