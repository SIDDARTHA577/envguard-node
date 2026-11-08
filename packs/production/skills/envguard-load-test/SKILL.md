---
name: envguard-load-test
description: Guides capacity planning, workload profile design, local performance benchmarking, and threshold validation without fabricating production metrics or executing unauthorized traffic.
---

# `envguard-load-test` Skill

Guides software engineers and AI coding agents through evidence-based capacity planning, performance scenario modeling, and safe local HTTP benchmarking. Enables developers to construct realistic workload models, define latency and throughput Service Level Objectives (SLOs), execute non-destructive localhost baselines, validate p95/p99 latency thresholds, and generate 10,000-virtual-user capacity scenarios without fabricating production performance claims.

## When to Trigger
- Designing workload capacity models (DAU, peak RPS, read/write ratios) for upcoming service launches.
- Running safe, non-destructive local performance benchmarks against localhost development servers using `runLocalBenchmark`.
- Establishing baseline response latency percentiles (p50, p90, p95, p99) and measuring maximum throughput.
- Generating synthetic stress profiles and load testing configurations (e.g. Grafana k6 or Autocannon test plans).
- Verifying latency thresholds and error rate budgets before staging deployments.

## When NOT to Trigger
- Executing unauthorized load tests against remote production endpoints, third-party APIs, or shared corporate networks.
- Auditing static code vulnerabilities or environment secret leakage (use `envguard-production-readiness` or `envguard-review`).
- Designing database schemas or optimizing raw SQL query indexes in isolation (use `envguard-database`).
- Auditing frontend accessibility or WCAG AA compliance (use `envguard-accessibility`).

## Supported Projects & Environments
- **Runtimes & Frameworks**: Node.js (Express, Fastify, Next.js, NestJS), Python (Django, FastAPI, Flask), Java (Spring Boot), Go, Rust.
- **Protocol Support**: HTTP/1.1 and HTTP/2 endpoints with JSON, Form, or REST payloads.
- **Benchmarking Tools**:
  - Built-in zero-dependency Node.js HTTP baseline runner (`tools/readiness/capacity/benchmark-runner.mjs`).
  - Grafana k6 configuration generator (`k6 run scenario.js`).
  - Autocannon / Apache Bench (ab) command generator.
- **Environments**: Local development machines (localhost / 127.0.0.1) and isolated dedicated staging environments.

## Required Tools & Permissions
- **Tools**: `read_file`, `write_file`, `run_command`.
- **Permissions**:
  - Read-only workspace access for static inspection of routes and server configurations.
  - Workspace write access for generating workload plans (`.envguard/load-test/`) and benchmark reports.
  - Explicit execution authorization (`--allow-exec --trust-project`) required before launching any live localhost benchmark runner.
- **Target Safety Guard**: Benchmarks targeting non-localhost hostnames are strictly blocked by default unless explicit parameter `allowExternalTarget: true` is supplied with staging environment approval.

## Expected Inputs
- `targetUrl`: Target HTTP URL to test (e.g. `http://localhost:3000/healthz` or `http://127.0.0.1:8080/api/items`).
- `durationMs`: Duration of the benchmark test in milliseconds (default `2000` ms; capped at `30000` ms).
- `concurrency`: Number of concurrent worker loops (default `5`; capped at `50`).
- `p95ThresholdMs`: Maximum allowable p95 latency threshold in milliseconds (default `250` ms).
- `maxErrorRatePercent`: Maximum acceptable failed request rate percentage (default `1.0`%).
- `workloadParameters`: Optional object specifying estimated DAU, read/write ratio, and expected peak RPS.

## Step-by-Step Workflow

### Stage 1: Route Discovery & Workload Profile Planning
1. Scan API route declarations and OpenAPI contracts using `buildInventoryGraph`.
2. Determine representative user journeys:
   - Read-heavy queries (e.g. `GET /api/catalog`, `GET /api/profile`).
   - Mutation endpoints (e.g. `POST /api/orders`, `PUT /api/settings`).
3. Formulate workload model: read:write ratio (default 80:20), expected concurrent users, and payload sizes.

### Stage 2: Threshold & SLO Definition
1. Define clear latency objectives: p50 <= 50ms, p95 <= 250ms, p99 <= 750ms.
2. Define error rate ceiling: error rate < 1.0% under peak concurrency.
3. Establish circuit breaker stop conditions: abort test immediately if error rate exceeds 5.0%.

### Stage 3: Local Baseline Verification (Safe Mode)
1. Verify target server is active on localhost (`http://127.0.0.1:<port>`).
2. Run small, controlled benchmark using `runLocalBenchmark` (5 concurrent workers, 2-second duration).
3. Compute empirical latency distribution: p50, p90, p95, p99, min, max, average, and throughput (req/s).
4. Verify whether latency percentiles satisfy defined thresholds.

### Stage 4: Hypothetical 10,000-User Capacity Model Generation
1. Generate hypothetical 10,000-virtual-user capacity model using `generate10kVirtualUserScenario`.
2. Compute estimated infrastructure resource projections:
   - Load generator requirements (2-4 nodes to prevent runner saturation).
   - Database connection pool requirements.
   - Recommended compute replicas.
3. Emit clearly labeled k6 stress script with gradual ramp-up stages.

### Stage 5: Compile Performance Report
1. Summarize empirical benchmark measurements vs hypothetical capacity projections.
2. Record any threshold violations as actionable findings.
3. Provide recommendations for database connection pooling, query indexing, or response compression.

## Validation Steps
1. Verify target URL strictly resolves to localhost or authorized staging destination.
2. Verify benchmark runner measures process high-resolution time (`process.hrtime.bigint()`) accurately.
3. Verify latency percentiles (p50, p95, p99) are computed from sorted arrays without interpolation drift.
4. Verify threshold violations are detected and flagged when latency exceeds targets.
5. Verify failed requests and HTTP non-2xx responses are recorded without crashing the runner.

## Expected Outputs
1. **Benchmark Results Summary**: Empirical throughput, total requests, error count, and p50/p90/p95/p99 latency breakdown.
2. **Capacity Projection Document**: Detailed resource estimation for scaling from baseline to 10,000 virtual users.
3. **k6 Test Script** (`load-test-10k.js`): Executable script template configured with ramp-up, steady-state, and threshold checks.

## Failure Handling
- **Target Connection Refused**: Detect offline server and provide actionable command to start the application server before benchmarking.
- **Threshold Violations**: Record warning findings with latency details; distinguish slow queries from socket timeouts.
- **External Target Guard**: If non-localhost URL is provided without `allowExternalTarget: true`, halt immediately with safety boundary explanation.

## Safety & Privacy Boundaries
- **No Unauthorized Remote Traffic**: The skill must never launch denial-of-service style load tests against external, production, or unapproved infrastructure.
- **Strict Concurrency Clamps**: Local benchmarks are clamped to a maximum of 50 concurrent connections and 30 seconds duration to prevent developer machine freeze.
- **No Production Performance Fabrication**: Hypothetical scenario models are explicitly labeled as hypothetical and must never be presented as measured production capacity.

## Example User Prompts
- "Benchmark our local Express API endpoint at http://localhost:3000/healthz and check if p95 latency is under 200ms."
- "Generate a capacity plan and k6 load testing script for a hypothetical 10,000-virtual-user workload on our backend."
- "Evaluate our Fastify server throughput and measure response latency under 10 concurrent requests."
- "Create a workload profile and establish performance SLO thresholds for our upcoming e-commerce product launch."
