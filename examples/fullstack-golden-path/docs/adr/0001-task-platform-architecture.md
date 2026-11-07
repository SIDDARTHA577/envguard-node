# ADR 0001: Golden Path Modular Full-Stack Architecture

## Status
Accepted

## Context
When designing the task management application, we evaluated multiple architectural patterns:
1. Microservices architecture with separate services for tasks, notifications, and analytics.
2. Serverless architecture with AWS Lambda and DynamoDB.
3. Modular monolith with a React SPA frontend, Express.js REST API, and transactional persistence.

## Decision
We selected the **Modular Monolith** architecture:
- Frontend: React + TypeScript SPA communicating over standard REST/JSON.
- Backend: Express.js in TypeScript with centralized error handling and structured JSON responses.
- Configuration: EnvGuard runtime environment validation (`guard()`) with zero runtime dependencies.
- Persistence: Transactional relational storage with explicit schema migrations and indexes on filter columns (`status`, `priority`).

### Rationale
- For the expected workload and team size, a microservices architecture would introduce unnecessary deployment complexity, network latency, and eventual consistency challenges without measurable benefit.
- A modular monolith preserves clean domain boundaries via shared TypeScript interfaces (`src/shared/types.ts`) while keeping local development and testing straightforward.

## Consequences
### Positive
- Fast local development with instant feedback and deterministic automated tests.
- Shared TypeScript contracts prevent frontend/backend drift.
- Fail-fast startup validation prevents bad configurations from running in production.

### Negative / Trade-offs
- Scaling components independently requires future service extraction if individual endpoints develop asymmetric load profiles.
