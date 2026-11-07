---
name: envguard-code-review
description: Conducts rigorous, evidence-based code reviews evaluating correctness, edge cases, performance bottlenecks, architectural alignment, test adequacy, security best practices, and breaking changes.
---

# `envguard-code-review` Skill

Guides engineers and AI agents through conducting rigorous, evidence-based code reviews of pull requests, commits, and feature branches. Replaces generic feedback with structured findings across logic correctness, error handling, security boundaries, performance efficiency, and test adequacy.

## When to Trigger
- Reviewing pull requests, git diffs, or newly implemented files before merging to protected branches.
- Inspecting code changes for logical bugs, unhandled promise rejections, race conditions, or off-by-one errors.
- Evaluating database queries, loops, and async patterns for N+1 performance bottlenecks or memory leaks.
- Auditing code modifications for security regressions (SQL injection, XSS, prototype pollution, secret logging).
- Assessing automated test adequacy and determining whether boundary conditions and edge cases are covered.
- Detecting breaking API changes, contract divergence, or backward compatibility risks in shared modules.

## When NOT to Trigger
- Drafting initial system architecture requirements from scratch (use `envguard-system-design`).
- Running automated stylistic formatting or lint fixing without qualitative review (use standard `eslint --fix` or `prettier`).
- Auditing environment configuration files and deployment secrets exclusively (use `envguard-review` or `envguard-audit`).
- Conducting automated accessibility audits on UI components (use `envguard-accessibility`).

## Supported Projects & Environments
- Languages: TypeScript, JavaScript (Node.js, Browser, ESM, CommonJS), HTML, CSS, SQL.
- Source Control: Git, GitHub PRs, GitLab MRs, local staged/unstaged changes.
- Frameworks & Libraries: Express, React, Vite, Next.js, Fastify, Vitest, Jest.
- Development Stacks: Full-stack Node.js/TypeScript applications, CLI tools, libraries.

## Required Tools & Permissions
- Tools: File reader, command runner, diff inspector (`read_file`, `run_command`).
- Permissions: Project workspace read access to review source files, diffs, test logs, and configuration. Read-only by default; write permissions only if requested to generate test patches.

## Expected Inputs
- Git diff, pull request summary, or list of modified source files.
- Problem statement or feature requirements describing the intended behavior.
- Existing test suite results and linting reports.

## Step-by-Step Workflow

### Step 1: Context & Change Scope Analysis
- Inspect the diff or commit range using `git diff` or file inspection.
- Determine the scope: Is this a bug fix, feature addition, refactoring, dependency upgrade, or performance patch?
- Check whether the changes adhere to project conventions, architectural guidelines, and scope boundaries. Flag unrelated edits or scope creep.

### Step 2: Correctness & Logic Verification
- Trace data flow from inputs to outputs:
  - Are null, undefined, and empty array/object inputs handled safely?
  - Are asynchronous operations properly awaited (`Promise.all` vs sequential `await` in loops)?
  - Are there race conditions in shared mutable state or module-level variables?
  - Are array indices, loop termination conditions, and boundary values correct (e.g. `<` vs `<=`)?
- Verify that return types and error statuses match API contracts.

### Step 3: Error & Exception Handling Audit
- Verify that every async function has proper try/catch or error propagation.
- Ensure promises do not fail silently or lead to unhandled rejections.
- Verify that error handlers log actionable diagnostics without leaking internal stack traces, system paths, or database credentials to end users.
- Check that resources (file descriptors, database transactions, network streams) are cleaned up in `finally` blocks.

### Step 4: Security & Sensitive Data Boundary Check
- Check for common vulnerabilities:
  - **Injection**: Ensure SQL queries use parameterized placeholders (`$1`, `?`), never string interpolation.
  - **Prototype Pollution**: Verify object mergers and deep clones guard against `__proto__` and `constructor`.
  - **ReDoS**: Check that regular expressions do not contain nested quantifiers evaluated on untrusted input.
  - **Secret Leakage**: Ensure `console.log()` or telemetry does not output passwords, authorization headers, or environment secrets.
  - **Authorization**: Ensure all protected routes verify user identity and tenancy permissions.

### Step 5: Performance & Resource Efficiency Review
- Detect algorithmic inefficiencies:
  - Avoid N+1 database queries in loops; verify batching or eager loading with `IN (...)` or JOINs.
  - Inspect module-level caches: Do they have size limits or TTLs, or will they cause memory leaks over time?
  - Verify streaming for large file uploads/downloads rather than buffering entire payloads into memory.
  - Check for unnecessary re-renders in React components (missing dependencies in `useEffect`/`useMemo`).

### Step 6: Test Adequacy Assessment
- Inspect test files associated with the change:
  - Do tests exercise the happy path?
  - Do tests exercise edge cases: invalid inputs, empty sets, network failures, unauthorized access?
  - Are mocks realistic, or do they bypass the logic being tested?
  - Do tests assert specific results rather than simply verifying that code executed without throwing?

### Step 7: Formulate Structured Review Report
Organize findings using the standard EnvGuard Review Taxonomy:
- **Blocker / Critical**: Serious logic bug, data corruption risk, severe security vulnerability, or build failure. Must be resolved before merge.
- **Major / High**: Unhandled edge case, memory leak, missing transaction rollback, or breaking API contract. Strongly recommended before merge.
- **Minor / Medium**: Sub-optimal performance pattern, code duplication, or incomplete test coverage.
- **Nit / Suggestion**: Code readability improvement, docstring clarification, or minor naming refinement. Non-blocking.

## Validation Steps
- Execute `npm run lint` and `npm run typecheck` to confirm static analysis passes cleanly.
- Execute `npm test` to confirm all existing and new unit/integration tests pass.
- Verify that every reported finding includes a concrete file path, line reference, problem explanation, and suggested fix.

## Expected Outputs
- Structured Markdown Code Review Report containing:
  1. Summary of changes.
  2. Blocker & Major findings with code snippets and remediation steps.
  3. Minor improvements and suggestions.
  4. Test adequacy evaluation and test coverage recommendations.
  5. Merge recommendation (`Approve`, `Request Changes`, or `Comment`).

## Failure Handling
- If the change cannot be understood without additional business context, clearly state the missing assumptions and ask focused clarifying questions rather than guessing.
- If automated tests fail in CI, prioritize reporting the root cause of the test failure before reviewing stylistic aspects.

## Safety & Privacy Boundaries
- Never paste proprietary business logic or real production customer data into unvetted external services.
- Never approve code changes that disable authentication, bypass EnvGuard schema validation, or turn off security linters.

## Example User Prompts
- "Perform a rigorous code review of pull request #12 with envguard-code-review"
- "Review our new transaction processing service for race conditions, error handling, and memory leaks"
- "Audit these recent TypeScript changes for potential breaking API changes and test coverage gaps"
