---
name: envguard-production-readiness
description: Guides comprehensive, evidence-based application production readiness assessments across environment configuration, build and tests, security posture, API contracts, database persistence, and operational reliability.
---

# `envguard-production-readiness` Skill

Guides engineers and AI agents in conducting rigorous, evidence-based application production readiness assessments. Audits real project configurations across environment security, build and test verification, security boundaries, REST/OpenAPI contracts, database persistence, and operational reliability. Distinguishes verified facts, warnings, blocking failures, and unverified assumptions without claiming absolute certification.

## When to Trigger
- Evaluating an application, service, or API for deployment readiness before shipping to staging or production.
- Running the standalone EnvGuard Readiness Auditor (`tools/readiness-auditor.mjs`) on a local repository.
- Generating structured production readiness reports (machine-readable JSON and human-readable Markdown).
- Auditing operational configurations including health checks, graceful shutdown handlers, containerization, and CI/CD pipelines.
- Formulating a prioritized remediation plan for critical deployment blockers and security risks.

## When NOT to Trigger
- Designing high-level distributed architecture from scratch before code exists (use `envguard-system-design`).
- Setting up initial EnvGuard environment validation for the first time (use `envguard-setup`).
- Conducting focused WCAG screen reader accessibility testing exclusively (use `envguard-accessibility`).
- Writing raw database migrations or tuning SQL indexes in isolation (use `envguard-database`).

## Supported Projects & Environments
- Runtimes: Node.js (22.x, 24.x, 26.x), Bun, TypeScript, modern JavaScript (ESM / CommonJS).
- Web & API Frameworks: Express, Fastify, Next.js, NestJS, React, Vue, Svelte.
- Container & Deployment Tech: Docker, Docker Compose, Kubernetes, GitHub Actions, GitLab CI.
- Operating Systems: Linux (Ubuntu/Debian), macOS, Windows.

## Required Tools & Permissions
- Tools: File reader, file writer, command runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read-only permission by default. Explicit authorization (`--allow-exec`) required to execute local build, test, or lint commands.
- Subprocess Safeguards: Command timeouts (10s default), sanitized stdout/stderr, non-elevated privileges.

## Expected Inputs
- Target project repository root directory.
- Optional scope parameter specifying categories: `discovery`, `env`, `build_test`, `security`, `api`, `database`, `deployment`, `accessibility`, `performance`.
- Execution authorization grant (`--allow-exec`) if dynamic command verification is requested by the user.

## Step-by-Step Workflow

### Step 1: Pre-Flight Safety & Authorization Check
- Confirm the target directory is safe and contained within the authorized project root (prevent path traversal).
- Determine execution mode:
  - **Default (Read-Only)**: Static inspection of configurations, manifests, schemas, and source code. Test/build execution is reported as `NOT_RUN`.
  - **Authorized (`--allow-exec`)**: Explicitly permitted execution of declared `package.json` scripts (`build`, `test`, `typecheck`, `lint`) with bounded timeouts.
- **Rule**: Never run arbitrary untrusted scripts, database drop commands, or unapproved network requests.

### Step 2: Execute Readiness Scan
- Run the standalone auditor tool against the target project:
  ```bash
  node tools/readiness-auditor.mjs scan --project ./my-app --format both --output-dir ./reports
  ```
- Or with explicit execution approval:
  ```bash
  node tools/readiness-auditor.mjs scan --project ./my-app --allow-exec --format both --output-dir ./reports
  ```

### Step 3: Nine Modular Assessment Dimensions
1. **Project Discovery**: Detects manifest (`package.json`), runtime versions (`engines.node`, `.nvmrc`), lockfiles (`package-lock.json`, `pnpm-lock.yaml`), and frameworks.
2. **Environment Configuration**: Verifies template presence (`.env.example`), `.gitignore` exclusions for `.env`, startup schema validation (`guard()`), and flags hardcoded secrets.
3. **Build & Test Readiness**: Verifies passing status for build, test, lint, and typecheck scripts. When unapproved, marks as `NOT_RUN`.
4. **Security Readiness**: Audits automated dependency update tooling (Dependabot/Renovate), sensitive logging patterns, security headers (`helmet`), and CORS.
5. **API Contract Readiness**: Validates OpenAPI 3.x schema structure, RFC 7807/9457 Problem Details error models, RESTful URL naming, and collection pagination caps.
6. **Database Readiness**: Checks for database driver/ORM presence, versioned schema migrations (`migrations/`), indexing, and flags live migrations as `MANUAL_REVIEW`.
7. **Deployment & Operations**: Verifies containerization (`Dockerfile`), health check routes (`/health`), graceful shutdown signal listeners (`SIGTERM`), and CI workflows.
8. **Accessibility & Frontend**: Detects accessibility tooling (`eslint-plugin-jsx-a11y`, `axe-core`) and flags screen reader navigation as `MANUAL_REVIEW`.
9. **Performance Readiness**: Identifies load test scripts (k6) and flags live synthetic traffic generation as `NOT_RUN`.

### Step 4: Interpret Standardized Findings
Analyze findings categorized by the standardized status taxonomy:
- **PASS**: Verified passing criteria backed by static evidence or successful command execution.
- **FAIL**: Concrete blocking defect (e.g. failing test suite, unignored `.env` file, malformed OpenAPI spec).
- **WARNING**: Potential architectural risk or missing convention (e.g. missing `/health` route, unconfigured Dependabot).
- **NOT_RUN**: Check intentionally skipped due to lack of execution authorization or unavailable staging infrastructure.
- **MANUAL_REVIEW**: Finding requiring human inspection (e.g. database failover policy, keyboard screen-reader testing).
- **NOT_APPLICABLE**: Check irrelevant to project type (e.g. frontend checks on headless worker microservices).

### Step 5: Route Findings to Specialized EnvGuard Skills
Connect identified issues with focused EnvGuard skills for specialized remediation:
- Environment variable leaks or missing templates -> Route to `envguard-audit` or `envguard-setup` or `envguard-review`.
- Failing CI/CD pipelines -> Route to `envguard-ci`.
- OpenAPI schema violations or missing RFC 7807 models -> Route to `envguard-api-design`.
- Logic bugs, memory leaks, or test gaps -> Route to `envguard-code-review`.
- UI token inconsistency or layout defects -> Route to `envguard-ui-design`.
- WCAG keyboard trap or contrast failures -> Route to `envguard-accessibility`.
- Backend route structure or graceful shutdown -> Route to `envguard-backend`.
- Database schema migration planning -> Route to `envguard-database`.

## Validation Steps
- Verify that both machine-readable JSON (`readiness-report.json`) and Markdown (`readiness-report.md`) reports are generated.
- Ensure that zero real passwords, tokens, or environment values are printed in logs or reports.
- Verify that `NOT_RUN` checks are never falsely classified as `PASS`.
- Confirm that no overall "readiness percentage" is fabricated.

## Expected Outputs
- `readiness-report.json`: Versioned JSON assessment conforming to `catalog/readiness-report.schema.json`.
- `readiness-report.md`: Structured Markdown report including Executive Summary, Blockers, Warnings, Passed Checks, Manual Review Items, and Prioritized Remediation Plan.
- Concrete terminal summary with clean exit code behavior (0 = all passing/warnings, 2 = blocking failures exist).

## Failure Handling
- If target project `package.json` is missing or malformed, record a critical `DISC-001` failure and evaluate remaining files rather than crashing.
- If a project command times out during `--allow-exec`, capture timeout evidence and record a `FAIL` status without hanging the process.

## Safety & Privacy Boundaries
- **NEVER** inspect private `.env` files or display real environment variable secrets.
- **NEVER** execute production database migrations or connect to live customer databases during readiness analysis.
- **NEVER** run high-load performance traffic tests against production environments.
- Subprocess execution is strictly gated behind explicit `--allow-exec` authorization.

## Example User Prompts
- "Analyze my full-stack application for production readiness with envguard-production-readiness"
- "Run the readiness auditor on our backend API in read-only mode and list all blocking issues"
- "Generate a complete production readiness report with authorized test execution using --allow-exec"
