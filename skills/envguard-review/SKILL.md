---
name: envguard-review
description: Reviews environment variable and secret handling in a project for common security vulnerabilities (e.g. unvalidated variables, console.log leaks, missing .gitignore rules, and unmasked error outputs).
---

# `envguard-review` Skill

Conducts a security-focused review of environment variable management, secret handling, accidental leakage vectors, and configuration hygiene.

## When to Trigger
- The user requests a security review of secrets or environment configuration.
- Checking for accidental credential leakage in log statements, error handlers, or git tracking.
- Pre-deployment security verification of `.gitignore`, `.dockerignore`, and schema definitions.

## When NOT to Trigger
- Penetration testing or active network exploitation of running services.
- General application business logic code reviews unrelated to secrets or configuration.
- Generating schemas from scratch without prior code audit (use `envguard-audit`).

## Supported Projects & Environments
- Any Node.js, TypeScript, or JavaScript application.
- Containerized workflows (Docker, Docker Compose).
- Serverless and cloud-native Node.js deployments.

## Required Tools & Permissions
- Tools: Grep / file search, file reader (`read_file`, `run_command`).
- Permissions: Read-only access to repository source and configuration files.

## Expected Inputs
- Repository source code directory.
- Configuration and ignore files (`.gitignore`, `.dockerignore`, Dockerfiles, CI workflows).

## Step-by-Step Workflow

### Step 1: Verify Git & Container Ignore Rules
- Verify `.gitignore` explicitly excludes `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, and `*.local`.
- If Docker is used, verify `.dockerignore` exists and excludes secret and local environment files.

### Step 2: Search for Sensitive Value Leaks
- Search for dangerous logging patterns: `console.log(process.env)`, `logger.info(req.body)`, or custom logs echoing configuration.
- Check exception classes and error handlers to ensure failed validations do not print secret values.

### Step 3: Verify Startup Validation Coverage
- Inspect entry points to confirm required credentials (database URLs, API tokens, JWT keys) are validated at boot time.
- Verify that missing required variables halt startup immediately rather than causing runtime crashes later.

### Step 4: Validate Sensitivity Tags
- Verify that all credentials, passwords, and private tokens in EnvGuard schemas use `.sensitive()` to ensure redaction.

## Validation Steps
- Verify `.git` status to ensure no tracked `.env` files are accidentally committed in git history.
- Run `git ls-files | grep '\.env$'` or similar to confirm clean repository tracking.

## Expected Outputs
- A categorized security report:
  1. **Critical Vulnerabilities**: e.g. committed secret files, unmasked logging of credentials.
  2. **Security Hardening Needs**: e.g. unconstrained port types, unvalidated URLs, missing `.dockerignore`.
  3. **Best Practice Recommendations**: e.g. marking fields `.sensitive()`, adding CI schema drift checks.

## Failure Handling
- If git history cannot be inspected, clearly note the limitation in the final report.
- Clearly distinguish verified vulnerabilities from unverified static pattern warnings.

## Safety & Privacy Boundaries
- **NEVER** display or print actual secrets discovered during review.
- **NEVER** transmit repository findings to external endpoints.
- Do not make exaggerated security claims (e.g. "100% secure" or "guaranteed unhackable").

## Example User Prompts
- "Review my environment variable security and .gitignore with envguard-review"
- "Check this project for potential secret leakage in logs or error handling"
- "Verify environment configuration security before deployment"
