# Phase 15 — Independent Application Verification Report

Status: Completed on branch `test/envguard-independent-apps` (STRICT NO-RELEASE MODE)

## Scope & Methodology

Phase 15 validates EnvGuard Core, CLI/pack distribution, Agent Skill installation/uninstallation, architecture discovery, assessment planning, adapter accuracy, authorized `node --test` execution, database checks, remediation, and rollback against 13 isolated, self-contained application projects created outside the `envguard-node` workspace in ephemeral temporary directories (`os.tmpdir()`).

Verification drivers and regression coverage live in:
- [independent-app-runner.mjs](file:///d:/envguard-node/tools/readiness/validation/independent-app-runner.mjs) (`INDEPENDENT_APP_MATRIX`, `buildIndependentAppFixture`, `runIndependentAppVerification`)
- [independent-apps-verification.test.ts](file:///d:/envguard-node/tests/readiness/independent-apps-verification.test.ts) (17 automated test cases)

## 13-Application Matrix Results

All 13 generated independent projects executed end-to-end (`installSkills` -> `buildInventoryGraph` -> `formulateAssessmentPlan` -> read-only audit -> authorized dynamic audit -> dry-run remediation diff -> apply + re-audit comparison -> `restoreCheckpoint` rollback -> `uninstallSkills`):

| App ID | Stack | Expected Primary Adapter | Phases Planned | Seeded Defects (TP / FN) | Dynamic `BUILD-002` Execution | Remediation & Comparison Improved | Rollback & Skill Lifecycle |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `react-vite` | React + Vite SPA | `nextjs-react` | 5 | 2 / 0 (`ENV-001`, `ENV-002`) | `PASS` (`TESTS_PASSED`) | `true` | `true` |
| `nextjs` | Next.js App Router | `nextjs-react` | 5 | 2 / 0 (`ENV-001`, `ENV-002`) | `PASS` (`TESTS_PASSED`) | `true` | `true` |
| `node-express` | Node.js Express API | `node-typescript` | 5 | 2 / 0 (`ENV-001`, `ENV-002`) | `PASS` (`TESTS_PASSED`) | `true` | `true` |
| `node-mongodb` | Node.js + Mongoose | `node-typescript` | 5 | 3 / 0 (`ENV-001`, `ENV-002`, `DB-002`) | `PASS` (`TESTS_PASSED`) + `DB-001` `PASS` | `true` | `true` |
| `node-postgresql` | Node.js + `pg` + SQL | `node-typescript` | 5 | 3 / 0 (`ENV-001`, `ENV-002`, `DB-002`) | `PASS` (`TESTS_PASSED`) + `DB-001` `PASS` | `true` | `true` |
| `django` | Python Django | `python` | 5 | 1 / 0 (`ENV-002`) | `false` (static only) | `true` | `true` |
| `fastapi` | Python FastAPI | `python` | 5 | 1 / 0 (`ENV-002`) | `false` (static only) | `true` | `true` |
| `spring-boot` | Java Spring Boot | `java-spring` | 5 | 1 / 0 (`ENV-002`) | `false` (static only) | `true` | `true` |
| `react-native-expo` | React Native + Expo | `react-native` | 5 | 1 / 0 (`ENV-002`) | `PASS` (`TESTS_PASSED`) | `true` | `true` |
| `flutter` | Flutter & Dart | `flutter` | 5 | 1 / 0 (`ENV-002`) | `false` (static only) | `true` | `true` |
| `android-kotlin` | Native Android Kotlin | `android` | 5 | 1 / 0 (`ENV-002`) | `false` (static only) | `true` | `true` |
| `ios-swift` | Native iOS Swift | `ios` | 5 | 1 / 0 (`ENV-002`) | `false` (`IOS-TEST-002`: `NOT_RUN`) | `true` | `true` |
| `fullstack-monorepo` | pnpm Workspace (`apps/api`, `apps/web`) | `node-typescript` | 5 | 2 / 0 (`ENV-001`, `ENV-002`) | `PASS` (`TESTS_PASSED` across both workspaces) | `true` | `true` |

## Additional Empirical Checks Executed

1. **Zero False Positives (Clean `node-postgresql`)**: A cleanly configured `node-postgresql` project with reversible migrations (`001_init.sql` + `001_init.down.sql`), parameterized `$1` queries, `.env.example`, `.gitignore`, and real `node --test` tests yielded `0` `FAIL` findings, `DB-001` `PASS`, `DB-002` `PASS`, and `BUILD-002` `PASS` (`TESTS_PASSED`).
2. **Targeted Defect Sensitivity**:
   - Injecting unsafe SQL template interpolation (`pool.query(\`SELECT ... '${email}'\`)`) triggered `DB-004` (`FAIL`, `critical`).
   - Omitting Django CSRF middleware (`CsrfViewMiddleware`) triggered `PY-SEC-005` (`FAIL`).
3. **Offline Packed Core Tarball Verification & Secret Redaction**:
   - Packed `envguard-node-1.0.0.tgz` via `npm pack` (`--pack-destination` inside an isolated temp directory) and installed it via `npm install --offline` into a standalone Express + PostgreSQL consumer project.
   - Executed `validate-env.mjs` with `node`, confirming runtime rejection when `DATABASE_URL` is absent and coerced configuration success (`PORT: 8080`) when valid.
   - Audited the consumer project with a synthetic secret in `.env` and confirmed neither `readiness-report.json` nor `readiness-report.md` disclosed raw secret values.

## Real Bugs Surfaced and Fixed During Phase 15

- **Monorepo Workspace `.gitignore` Check & Comparator Key Consistency ([generic-adapter.mjs](file:///d:/envguard-node/tools/readiness/adapters/generic-adapter.mjs))**:
  `GenericAdapter`'s `ENV-002` check previously inspected only `<projectDir>/.gitignore`, ignoring workspace-level `.gitignore` files created during monorepo remediation (`apps/api/.gitignore`, `apps/web/.gitignore`). In addition, changing `evidence.file` between failure and remediation caused `getFindingKey()` in `comparator.mjs` to classify the resolved finding as missing. Both root and workspace `.gitignore` candidates are now checked, while keeping `evidence.file: '.gitignore'` stable across states (`resolvedFile` carries the resolved path when distinct).
- **Assessment Plan Phase Count Metric ([independent-app-runner.mjs](file:///d:/envguard-node/tools/readiness/validation/independent-app-runner.mjs))**:
  Corrected `buildInventoryGraph` import to `../engine/index.mjs` and updated `planPhaseCount` to read object keys on `plan.phases` (`5` phases).

## Explicit Boundaries & Non-Claims

- Test projects are deterministic, self-contained independent fixtures generated in ephemeral `os.tmpdir()` workspaces rather than live public repositories fetched over the network.
- Non-Node dynamic test runners (`pytest`, Maven/Gradle, `flutter test`, `xcodebuild`) were not executed on this Windows sandbox host and remain accurately classified as static-only or `NOT_RUN` (`IOS-TEST-002`).
- No npm publication, Git tag, GitHub Release, or marketplace publication was performed.

