---
name: envguard-senior-engineer-review
description: Flagship senior software architect review coordinating full-stack discovery, system design assessment, multi-adapter verification, capacity planning, SRE reliability analysis, and ADR generation.
---

# `envguard-senior-engineer-review` Skill

EnvGuard's flagship senior engineering and architecture review capability. Operates as an integrated principal software architect and staff engineering team reviewing complete multi-tier applications across web frontends, mobile clients, backend APIs, distributed databases, message queues, container infrastructure, and CI/CD pipelines. Evaluates 17 primary system design concepts, identifies architectural bottlenecks and failure modes, executes authorized verification checks, formulates reviewable Architecture Decision Records (ADRs), and generates comprehensive pre-deployment engineering reports.

## When to Trigger
- Conducting a comprehensive, end-to-end architectural review of an application or monorepo before production deployment.
- Evaluating system design scalability, failure modes, and capacity requirements for expected traffic growth.
- Reviewing complete multi-tier systems across frontend, mobile, backend API, database, and cloud infrastructure.
- Determining whether an architecture is appropriately designed or overengineered for current team size and requirements.
- Generating formal Architecture Decision Records (ADRs) to remediate identified architectural risks.

## When NOT to Trigger
- Conducting quick single-file lint or type checks (use native `tsc` or `eslint`).
- Auditing environment variables exclusively for secret leakage (use `envguard-audit` or `envguard-review`).
- Writing raw database SQL migration scripts in isolation (use `envguard-database`).
- Conducting focused WCAG screen reader accessibility testing without architectural scope (use `envguard-accessibility`).

## Supported Projects & Environments
- **Full-Stack & Monorepo Targets**: Web frontends (React, Next.js, Vue), Mobile clients (React Native, Expo, Flutter, Native Android, Native iOS), Backend services (Express, Fastify, NestJS, Django, FastAPI, Flask, Spring Boot), and shared packages.
- **Datastores & Infrastructure**: PostgreSQL, MySQL, SQLite, MongoDB, Redis, RabbitMQ, Kafka, Docker, Kubernetes, GitHub Actions.
- **Runtimes**: Node.js (22.x, 24.x, 26.x), Python (3.10+), Java (17, 21, 25 LTS), Dart (3.x), Swift, Kotlin.
- **Operating Systems**: Linux, macOS, Windows (native macOS builds/tests transparently evaluated as NOT_RUN on non-macOS hosts).

## Required Tools & Permissions
- **Tools**: `read_file`, `write_file`, `run_command`.
- **Permissions**:
  - Read-only workspace permission by default for static architecture discovery and system design evaluation.
  - Workspace write permission when saving generated ADRs, remediation patches, or engineering reports.
  - Explicit execution authorization (`--allow-exec --trust-project`) required before running any local test suite or benchmark runner.
- **Safety Boundaries**: Never executes destructive chaos tests, credential extraction, or unauthorized remote load tests.

## Expected Inputs
- `projectDir`: Path to the project root directory or monorepo root (default `'.'`).
- `requirements`: Optional object specifying expected users, traffic estimates (RPS, DAU), availability targets, latency targets, and team size.
- `allowExec`: Boolean flag to permit running declared test suites (default `false`).
- `trustProject`: Explicit host trust acknowledgment for unisolated environments (default `false`).
- `format`: Output format: `'json'`, `'markdown'`, or `'both'` (default `'both'`).
- `outputDir`: Directory to write generated reports and ADRs (e.g. `docs/adr/`, `.envguard/reports/`).

## Step-by-Step Workflow

### Stage 1: Repository & Requirement Discovery
1. Collect or infer project requirements using `discoverArchitectureRequirements`:
   - Product purpose and critical user journeys.
   - Availability targets (99.9% vs 99.99%) and latency objectives (p95 < 200ms).
   - Team size and budget posture (never inventing traffic metrics; missing workload data is flagged as unknown).
2. Build comprehensive architectural inventory using `buildArchitectureInventory`:
   - Classify topology: `modular-monolith`, `microservices`, `mobile-client-backend`, or `standalone`.
   - Identify frontend clients, backend services, datastores, caches, queues, and container definitions.

### Stage 2: Specialized Adapter & Skill Routing
1. Route project modules to specialized EnvGuard adapters:
   - Node/TypeScript services -> `NodeTypeScriptAdapter`.
   - Next.js / React clients -> `NextJsReactAdapter`.
   - Python backends -> `PythonAdapter`.
   - Java Spring Boot services -> `JavaSpringBootAdapter`.
   - Mobile clients -> `ReactNativeAdapter`, `FlutterAdapter`, `AndroidAdapter`, `IosAdapter`.
2. Hand off deep domain concerns to complementary skills:
   - REST/OpenAPI contracts -> `envguard-api-design`.
   - Database schemas & indexes -> `envguard-database`.
   - UI tokens & component hierarchy -> `envguard-ui-design`.
   - Screen reader a11y -> `envguard-accessibility`.

### Stage 3: System Design Matrix Evaluation (17 Mandatory Dimensions)
1. Evaluate applicability and implementation state for all 17 primary system design concepts using `evaluateSystemDesignDecisions`:
   - Load Balancing, Caching, CDN, API Gateway, Microservices, Monolithic Architecture, Replication, Partitioning/Sharding, Message Queues, Rate Limiting, Consistent Hashing, CAP Theorem, Horizontal Scaling, Vertical Scaling, Fault Tolerance, Circuit Breaker, Event-Driven Architecture.
2. Flag defects (e.g. unbounded memory caches, missing rate limiting, missing health checks) and overengineering (e.g. microservices for 2-person teams).

### Stage 4: Scalability, Reliability & Capacity Modeling
1. Model architectural tradeoffs using `evaluateArchitectureTradeoffs` (Simplicity vs Scalability, CAP consistency, Cost vs Redundancy).
2. Perform Failure Mode and Effects Analysis (FMEA) using `analyzeFailureModes` (SPOF, connection pool exhaustion, cache stampede, downstream timeout cascades).
3. Generate capacity model and hypothetical 10,000-virtual-user scenario using `buildCapacityModel`.
4. If authorized, execute safe local performance baselines using `runLocalBenchmark`.

### Stage 5: Architecture Decision Records (ADRs) & Remediation
1. Formulate structured, reviewable ADR drafts using `generateArchitectureDecisionRecords`:
   - Document Context, Problem, Alternatives, Recommendation, Tradeoffs, Costs, Risks, and Rollback Strategy.
2. Prepare minimal, reviewable code/config patches for high-severity findings upon user request.

### Stage 6: Unified Engineering Report Emission
1. Compile unified engineering report containing Executive Summary, Topology Map, System Design Matrix, Reliability & FMEA analysis, Capacity Model, and ADRs.
2. Evaluate release policy gates (block release on any critical security or stability failure).

## Validation Steps
1. Verify architecture inventory accurately discovers all declared services, datastores, and queues.
2. Verify system design evaluations adhere to applicability rules (never penalizing small monoliths for lacking Kafka or Kubernetes).
3. Verify capacity models clearly distinguish hypothetical projections from observed measurements.
4. Verify all 17 system design dimensions produce deterministic evaluations across test fixtures.
5. Verify generated ADRs contain all required architectural sections.

## Expected Outputs
1. **Unified Engineering Report** (`readiness-report.md` & `readiness-report.json`): Comprehensive production readiness assessment covering architecture, security, tests, and deployment.
2. **Architecture Decision Records** (`docs/adr/ADR-*.md`): Reviewable markdown decision records for required architectural changes.
3. **Capacity & Performance Plan**: Resource sizing projections and k6 stress testing configuration templates.

## Failure Handling
- **Missing Architecture Documentation**: Record explicit assumptions with confidence ratings (`low_heuristic`); proceed with static code analysis.
- **Incompatible Platforms**: Transparently report platform-dependent checks as `NOT_RUN` with prerequisite instructions.
- **Policy Blockers**: Identify critical architectural and security blockers with clear P0 remediation instructions.

## Safety & Privacy Boundaries
- **No Production Load Testing**: Load tests and stress profiles must never be executed against production endpoints without explicit human approval.
- **No Destructive Operations**: Never drop databases, execute unverified migrations, or wipe storage during assessment.
- **Credential Protection**: Keystores, private signing certificates, and cloud credentials are never inspected or exported.

## Example User Prompts
- "Review my complete application as a senior software architect before production deployment."
- "Evaluate our full-stack architecture, identify scalability bottlenecks, and generate pre-deployment ADRs."
- "Assess whether our current backend architecture can handle expected traffic growth or if we need caching and read replicas."
- "Conduct an integrated senior engineering review of our monorepo (Expo mobile + Express API + PostgreSQL)."
