---
name: envguard-migrate
description: Guides the safe, step-by-step migration of an existing Node.js codebase from raw process.env or ad-hoc validation (dotenv, joi, envalid) to EnvGuard with zero regressions.
---

# `envguard-migrate` Skill

Use this skill when transitioning an existing project to EnvGuard from raw `process.env` lookups or legacy configuration libraries.

## Migration Principles

1. **Zero Downtime / Zero Regressions**:
   - Preserve all existing variable names and existing default fallbacks.
2. **Propose Plan First**:
   - Present a clear diff and file checklist before modifying code.
3. **Step-by-Step Validation**:
   - Run tests after each file change to guarantee application behavior remains identical.

---

## Migration Steps

### Step 1: Inventory Existing Configuration
Identify all environment variables currently in use:
```bash
# Search for environment reads across src/
grep -rn "process.env" src/
```

### Step 2: Build the EnvGuard Schema
Create a centralized `src/config/env.ts` (or `envguard.config.json`):
```typescript
import { guard, s } from 'envguard-node';

export const env = guard({
  PORT: s.port().default(3000),
  DATABASE_URL: s.url().sensitive(),
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
}).data;
```

### Step 3: Replace Direct `process.env` Reads
Update application files to import the validated, typed `env` object:
```typescript
// Before:
const port = parseInt(process.env.PORT || '3000', 10);

// After:
import { env } from './config/env.js';
const port = env.PORT; // strictly typed as number
```

### Step 4: Verify Tests
Run the project's test suite:
```bash
npm test
```

