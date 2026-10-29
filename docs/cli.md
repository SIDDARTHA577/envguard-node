# EnvGuard CLI Documentation

`envguard` is a command-line tool designed for CI/CD pipelines, pre-deployment checks, and local development to validate environment configurations before code starts running.

## Installation

```bash
# Locally in your project
npm install -D envguard-node

# Or run directly via npx
npx envguard-node check
```

---

## Commands

### `envguard check`

Validates your environment variables against your configuration schema.

```bash
# Basic check against auto-detected config file and process.env
envguard check

# Check with an explicit schema file
envguard check --schema ./envguard.config.json

# Check against a specific .env file
envguard check --env-file .env.production

# Machine-readable JSON output for automated CI processing
envguard check --format json

# Strict mode: fail if unexpected variables exist
envguard check --strict
```

### `envguard init`

Generates starter configuration and `.env.example` templates safely.

```bash
# Generate JSON configuration (default)
envguard init

# Generate TypeScript / JavaScript configuration
envguard init --type js

# Force overwrite existing configuration files
envguard init --force
```

---

## Exit Codes

| Exit Code | Meaning | Action / Consequence |
|---|---|---|
| `0` | Success | All environment variables matched the schema. |
| `1` | Validation Failed | One or more required variables are missing or invalid. CI step fails. |
| `2` | Configuration Error | Schema file not found, bad syntax, or unhandled CLI error. |

---

## CI / CD Integration Example

In GitHub Actions, GitLab CI, or Docker entrypoints, run `envguard check` before starting services:

```yaml
- name: Validate Production Configuration
  run: npx envguard check --schema envguard.config.json --env-file .env.production
```
