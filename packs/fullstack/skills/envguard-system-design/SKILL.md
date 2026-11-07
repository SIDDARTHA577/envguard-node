---
name: envguard-system-design
description: Guides software architects and AI agents through requirements gathering, system architecture selection, component boundaries, data flows, API contracts, risk assessment, and Architecture Decision Records (ADRs).
---

# `envguard-system-design` Skill

Guides the architectural planning, component boundary definition, data flow design, and tradeoff analysis for modern software systems.

## When to Trigger
- Planning a new application, service, or major architectural feature.
- Documenting system architecture, component boundaries, or service relationships.
- Drafting Architecture Decision Records (ADRs) and technical specifications.
- Evaluating architectural tradeoffs (e.g., monolith vs. modular monolith vs. microservices, SQL vs. NoSQL, caching strategies).

## When NOT to Trigger
- Writing line-by-line implementation code (use `envguard-backend` or `envguard-frontend`).
- Designing database schemas in detail (use `envguard-database`).
- Auditing existing environment variables (use `envguard-audit`).

## Supported Projects & Environments
- Web applications, distributed systems, RESTful microservices, and modular monoliths.
- TypeScript, JavaScript, Python, Go, and polyglot architectures.
- Cloud platforms (AWS, GCP, Azure), serverless, and containerized architectures.

## Required Tools & Permissions
- Tools: File reader, file writer, markdown generator (`read_file`, `write_file`).
- Permissions: Project workspace read and write permissions to generate ADRs and design documents in `docs/adr/` or `docs/architecture/`.

## Expected Inputs
- Functional and non-functional requirements (throughput, latency, availability, data retention).
- Expected scale, team size, and deployment constraints.
- Existing tech stack and organizational constraints.

## Step-by-Step Workflow

### Step 1: Requirements & Constraints Analysis
- Clarify functional requirements (core user journeys, entities, operations).
- Define non-functional requirements:
  - Throughput (RPS) and latency targets (p95/p99).
  - Availability and disaster recovery requirements.
  - Security, compliance, and privacy constraints.
- Assess project scale. **Rule**: Do not recommend microservices by default; favor simple, maintainable modular architectures unless independent team deployment boundaries strictly require decoupling.

### Step 2: Component Boundaries & Data Flow Design
- Identify domain boundaries and component responsibilities:
  - Client tier (web SPA, mobile, SSR).
  - API Gateway / routing / authentication boundary.
  - Backend application services.
  - Persistence and caching layers (PostgreSQL, Redis, MongoDB).
- Generate a clear Mermaid diagram illustrating data flow and component interactions.

### Step 3: API Contracts & Communication Protocol Selection
- Define protocol choice (REST, GraphQL, gRPC) and justify based on consumer needs.
- Define API authentication and rate-limiting boundaries.
- Specify request/response payload shapes and standard error envelopes.

### Step 4: Tradeoff Analysis & Risk Register
- Compare alternative design options (e.g. synchronous HTTP vs. message queue).
- Document tradeoffs: complexity, cost, operational overhead, failure modes.
- Build a risk register detailing potential failure points and mitigations.

### Step 5: Generate Architecture Decision Record (ADR)
- Write an ADR to `docs/adr/` following standard MADR structure:
  - Title, Status, Context, Decision, Consequences (positive and negative).

## Validation Steps
- Verify the architecture addresses all stated functional and non-functional requirements.
- Confirm component boundaries adhere to single responsibility principles.
- Ensure no single point of failure without documented acceptance.
- Validate Mermaid diagram syntax.

## Expected Outputs
- Architecture Summary document.
- Mermaid component and sequence diagram.
- API Boundary & Contract specification.
- Risk Register & Mitigation plan.
- Formal Architecture Decision Record (`docs/adr/XXXX-title.md`).

## Failure Handling
- If requirements are ambiguous, prompt the user for clarification with specific options rather than guessing.
- If proposed scale exceeds simple architectures, document transition milestones incrementally.

## Safety & Privacy Boundaries
- **NEVER** expose internal network topology or credentials in public design documents.
- Clearly identify external third-party dependencies and vendor lock-in risks.
- Avoid introducing unnecessary distributed systems complexity without operational justification.

## Example User Prompts
- "Design the architecture for our task management application with envguard-system-design"
- "Plan component boundaries and data flow for a multi-tenant SaaS backend"
- "Create an ADR evaluating relational vs document storage for our workload"
