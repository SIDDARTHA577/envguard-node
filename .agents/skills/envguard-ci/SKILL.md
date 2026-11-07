---
name: envguard-ci
description: Integrates EnvGuard validation checks into CI/CD pipelines (GitHub Actions, GitLab CI, Docker entrypoints) to catch configuration drift and missing deployment secrets before shipping code.
---

# `envguard-ci` Skill

Integrates EnvGuard automated environment schema validation into CI/CD pipelines and container entrypoints to detect configuration drift and missing deployment variables early.

## When to Trigger
- The user asks to integrate environment checks into GitHub Actions, GitLab CI, or other CI runners.
- The user wants automated pre-flight configuration validation in Docker container entrypoints.
- Catching missing secrets or configuration schema drift before production deployment.

## When NOT to Trigger
- The project has no CI/CD automation and the user is solely doing local debugging.
- Migrating codebase syntax from raw `process.env` (use `envguard-migrate`).
- Conducting static security audits of local source files (use `envguard-review`).

## Supported Projects & Environments
- GitHub Actions workflows (`.github/workflows/`).
- GitLab CI pipelines (`.gitlab-ci.yml`).
- Dockerfiles and container runtime entrypoints.
- Shell script deployment hooks.

## Required Tools & Permissions
- Tools: File reader, file writer (`read_file`, `write_file`).
- Permissions: Project workspace write permission to edit or create workflow configuration files.

## Expected Inputs
- Existing CI/CD configuration files (or target CI platform preference).
- Application schema path (e.g. `envguard.config.ts` or `envguard.config.json`).
- Template file path (e.g. `.env.example`).

## Step-by-Step Workflow

### Step 1: Inspect Existing CI/CD Infrastructure
- Check `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or `Dockerfile`.
- Identify the appropriate job or build phase to insert the environment validation step.

### Step 2: Configure Least-Privilege CI Step
- In GitHub Actions, ensure workflow job uses least-privilege permissions (`permissions: contents: read`).
- Add a step to validate schema compliance against `.env.example`:
  ```yaml
  - name: Validate Environment Schema Drift
    run: npx envguard check --schema ./envguard.config.json --env-file .env.example
  ```

### Step 3: Configure Deployment Pipeline Pre-flight (Optional)
- For staging or production deployment workflows, validate deployment secrets shape without echoing raw secrets:
  ```yaml
  - name: Pre-Flight Environment Verification
    run: npx envguard check --schema ./envguard.config.json --format json
    env:
      NODE_ENV: production
      PORT: 8080
      DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
      API_KEY: ${{ secrets.PROD_API_KEY }}
  ```

### Step 4: Configure Container Entrypoint (Optional)
- In Dockerfiles, add pre-flight validation before application launch:
  ```dockerfile
  CMD ["sh", "-c", "npx envguard check --schema envguard.config.json && node dist/index.js"]
  ```

## Validation Steps
- Verify YAML syntax in edited workflow files.
- Ensure the CI command returns exit code `1` on invalid configuration and `0` on valid configuration.
- Confirm workflow files do not hardcode real credentials or echo secrets into build logs.

## Expected Outputs
- Updated or newly created workflow YAML file.
- Verified deterministic exit code handling.
- Documentation explaining how developers can test CI checks locally with `envguard check`.

## Failure Handling
- If workflow syntax fails linter validation, revert changes and present the correct schema structure.
- If the project uses an unsupported CI tool, provide a generic portable shell snippet.

## Safety & Privacy Boundaries
- **NEVER** write real secret values into CI workflow YAML files.
- **NEVER** add commands that echo or log unredacted environment values in CI output.
- Always use encrypted repository secrets syntax (`${{ secrets.VAR_NAME }}`).

## Example User Prompts
- "Integrate EnvGuard into CI/CD workflows with envguard-ci"
- "Add an environment validation step to GitHub Actions"
- "Configure Docker pre-flight check with envguard"
