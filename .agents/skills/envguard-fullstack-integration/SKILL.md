---
name: envguard-fullstack-integration
description: Guides end-to-end full-stack integration connecting React frontends, Node.js APIs, and database persistence with shared TypeScript contracts, CORS configuration, environment boundary enforcement, and integration testing.
---

# `envguard-fullstack-integration` Skill

Guides the seamless, secure integration of frontend client applications, backend APIs, and database persistence layers.

## When to Trigger
- Connecting a frontend application to a backend API service.
- Aligning TypeScript contracts, interfaces, and request/response shapes across client and server.
- Configuring Cross-Origin Resource Sharing (CORS), session cookies, and authentication headers.
- Enforcing environment separation (preventing server secrets from leaking into client bundles).
- Writing end-to-end integration tests that verify data flows from UI to database and back.

## When NOT to Trigger
- Writing isolated UI styling without API integration (use `envguard-frontend`).
- Writing raw SQL migration scripts (use `envguard-database`).
- Auditing standalone CI pipelines without application code (use `envguard-ci`).

## Supported Projects & Environments
- Monorepos (npm workspaces, pnpm workspaces, Turborepo, Nx) and multi-package repositories.
- Client: React, Vite, Next.js.
- Server: Node.js, Express, Fastify, TypeScript.
- Database: PostgreSQL, MySQL, SQLite, MongoDB accessed strictly through the backend.

## Required Tools & Permissions
- Tools: File reader, file writer, command execution (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to configure client/server contracts, environment files, and integration tests.

## Expected Inputs
- Frontend project directory and backend service directory.
- Shared domain models or contract specifications.
- Environment configuration files (`.env.example`, client config, server config).

## Step-by-Step Workflow

### Step 1: Shared TypeScript Contracts & Domain Types
- Establish shared TypeScript types (e.g. `Task`, `CreateTaskInput`, `ApiResponse<T>`) used by both client and server to prevent contract drift.
- Ensure all enum values, IDs, and date serializations (ISO 8601 strings) match across boundaries.

### Step 2: Configure Environment Boundary & CORS Security
- Verify environment separation:
  - Backend reads private secrets via EnvGuard (`DATABASE_URL`, `JWT_SECRET`, `PORT`).
  - Frontend only accesses public variables (e.g. `VITE_API_BASE_URL`).
  - **Rule**: Database credentials must NEVER appear in client build configurations.
- Configure backend CORS middleware restricting `origin` to allowed frontend origins (e.g. `http://localhost:5173` in development, specific production domains in production).
- Set secure cookie attributes (`HttpOnly`, `SameSite=Strict`, `Secure` in production).

### Step 3: Implement Client API Service Layer
- Create a centralized API client module in the frontend (`src/services/api.ts`).
- Handle request authorization headers, standard error parsing, and network timeouts.
- Standardize error transformation: translate backend `{ error: { code, message } }` envelopes into user-friendly UI error messages.

### Step 4: Verify Database Connectivity Through Backend
- Ensure the frontend NEVER communicates directly with the database.
- All database CRUD operations must pass through backend validation, authorization checks, and audit logging.

### Step 5: Implement End-to-End Integration Verification
- Build an automated test verifying the entire workflow:
  1. Frontend submits a form payload (`POST /api/tasks`).
  2. Backend validates input and persists to database.
  3. Database returns generated record with primary key.
  4. Backend responds with HTTP 201 Created.
  5. Frontend updates state and renders the new record in the list view.
  6. Subsequent queries (`GET /api/tasks/:id`) retrieve the persisted record.

## Validation Steps
- Run client and server test suites (`npm test`).
- Execute end-to-end integration test verifying complete data roundtrip.
- Scan client bundle output to verify absence of server environment keys or credentials.

## Expected Outputs
- Shared TypeScript contract definitions.
- Secured CORS and cookie configuration in backend.
- Centralized frontend API service layer.
- End-to-end integration test confirming complete client-to-database communication.

## Failure Handling
- If CORS errors occur in browser console (`Access-Control-Allow-Origin`), verify backend CORS origin whitelist and pre-flight `OPTIONS` handling.
- If contract mismatch occurs (e.g. missing field), check shared types and validate API response payload.

## Safety & Privacy Boundaries
- **NEVER** expose database connection strings, master keys, or internal tokens in frontend client code.
- Always use encrypted HTTPS and secure cookies in production configurations.
- Enforce rate limits on public API endpoints to prevent denial-of-service abuse.

## Example User Prompts
- "Integrate our React frontend with our Express backend and database using envguard-fullstack-integration"
- "Set up shared TypeScript contracts and secure CORS between client and server"
- "Build an end-to-end integration test verifying task creation from UI to database"
