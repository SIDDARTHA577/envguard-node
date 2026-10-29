---
name: envguard-audit
description: Scans a codebase for environment variable usage (e.g. process.env, import.meta.env), identifies required configuration keys, and recommends a type-safe EnvGuard schema and safe .env.example without exposing secret values.
---

# `envguard-audit` Skill

Use this skill when auditing a repository or onboarding a project to EnvGuard. It performs a non-destructive static scan of source code to detect environment variable references, deduce candidate types (port, url, boolean, string), and suggest a structured configuration schema.

## Safety & Security Constraints

1. **NEVER Read or Print Real Secrets**:
   - Do NOT display contents of local `.env`, `.env.local`, or secret files.
   - Do NOT print actual values of environment variables in conversation output.
2. **Deterministic & Non-Destructive**:
   - Do NOT overwrite existing code or configuration without explicit user consent.
   - Report uncertainty clearly when a variable's type cannot be definitively determined from source code.
3. **Safe Recommendations**:
   - All generated `.env.example` templates MUST use synthetic placeholder values (e.g. `postgres://user:pass@localhost:5432/mydb`).

---

## Workflow Steps

### Step 1: Scan for Environment References
Grep or search for standard Node.js / JavaScript environment access patterns:
- `process.env.VARIABLE_NAME`
- `process.env['VARIABLE_NAME']`
- `import.meta.env.VARIABLE_NAME`

### Step 2: Analyze Inferred Types
Examine surrounding code to infer constraints:
- Passed to `Number()`, `parseInt()`, or used as port -> `s.port()` or `s.integer()`
- Passed to `new URL()`, `fetch()`, or database clients (`pg`, `prisma`, `mongoose`) -> `s.url()`
- Compared against `'true'`, `'1'`, or boolean checks -> `s.boolean()`
- Checked against specific string literals -> `s.enum([...])`
- High-entropy tokens, API keys, passwords -> mark `.sensitive()`

### Step 3: Present Proposed Schema and `.env.example`
Provide the developer with a proposed `envguard.config.json` or `envguard.config.js` and matching `.env.example`.

---

## Realistic Example Output

```typescript
import { s, defineSchema } from 'envguard-node';

export default defineSchema({
  PORT: s.port().default(3000),
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] }).sensitive().describe('Database connection URL'),
  STRIPE_SECRET_KEY: s.string({ min: 24 }).sensitive().describe('Payment provider API key'),
});
```
