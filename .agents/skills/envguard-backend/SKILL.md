---
name: envguard-backend
description: Guides the design, implementation, and verification of secure, production-grade Node.js and TypeScript backend APIs with input validation, structured errors, EnvGuard configuration validation, graceful shutdown, and integration testing.
---

# `envguard-backend` Skill

Guides the development of secure, robust, and maintainable Node.js / TypeScript backend APIs and services.

## When to Trigger
- Creating or refactoring Node.js / TypeScript RESTful backend services.
- Implementing API routes, request validation, and structured error responses.
- Adding startup configuration validation using EnvGuard (`guard()`).
- Implementing health check endpoints, graceful shutdown, or structured logging.
- Writing unit and integration tests for backend endpoints.

## When NOT to Trigger
- Writing frontend React components or CSS (use `envguard-frontend`).
- Planning high-level distributed systems architecture (use `envguard-system-design`).
- Conducting low-level database indexing or migration planning (use `envguard-database`).

## Supported Projects & Environments
- Node.js 22.x, 24.x, and 26.x.
- Frameworks: Express.js, Fastify, NestJS, Koa, native Node HTTP.
- Languages: TypeScript, modern JavaScript (ESM or CommonJS).
- Testing harnesses: Vitest, Jest, Supertest, node:test.

## Required Tools & Permissions
- Tools: File reader, file writer, command execution (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to implement routes, middleware, and tests.

## Expected Inputs
- Project source code and package manager (`package.json`).
- Target API specifications (endpoints, methods, request schemas, response codes).
- Database client or repository interfaces.

## Step-by-Step Workflow

### Step 1: Framework & Configuration Inspection
- Inspect `package.json` to identify the existing framework (Express, Fastify, etc.) and TypeScript setup.
- Verify startup environment validation:
  ```typescript
  import { guard, s } from 'envguard-node';

  export const config = guard({
    NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
    PORT: s.port().default(3000),
    DATABASE_URL: s.url().sensitive(),
  }, process.env, { throwOnError: true }).data;
  ```

### Step 2: Implement Input Validation & Request Handling
- Validate all incoming `req.body`, `req.params`, and `req.query` strictly before passing to domain services.
- Reject unvalidated inputs with HTTP 400 Bad Request and structured error descriptions.
- Prevent prototype pollution and ReDoS hazards during parameter parsing.

### Step 3: Standardize Error Envelope & Structured Logging
- Implement a centralized error middleware returning consistent JSON envelopes:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Invalid request parameters",
      "details": []
    }
  }
  ```
- Redact secrets from error logs and stack traces.

### Step 4: Implement Health Checks & Graceful Shutdown
- Provide a `GET /health` endpoint reporting process status, timestamp, and database connectivity.
- Attach signal handlers for `SIGTERM` and `SIGINT` to close server listeners and database connection pools cleanly:
  ```typescript
  const server = app.listen(config.PORT);
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  ```

### Step 5: Write Automated Integration Tests
- Build integration tests exercising API routes using Supertest or native `fetch`.
- Verify happy paths (HTTP 200/201), client errors (HTTP 400/404), and server error recovery (HTTP 500).

## Validation Steps
- Execute `npm run typecheck` to confirm zero TypeScript compilation errors.
- Execute `npm test` to verify API route integration tests pass.
- Probe `GET /health` to verify JSON response structure and zero sensitive values.

## Expected Outputs
- Fully implemented API routes with strict input validation.
- Centralized error handling and structured response format.
- Startup environment validation using EnvGuard.
- Automated API test suite covering successful and error paths.

## Failure Handling
- If port binding fails (`EADDRINUSE`), verify process configuration and environment port defaults.
- If validation fails, return structured 400 response without leaking internal paths or stack traces.

## Safety & Privacy Boundaries
- **NEVER** log unmasked passwords, database credentials, or API keys.
- **NEVER** return raw internal database errors to API clients in production mode.
- Avoid dynamic SQL or shell execution vulnerabilities.

## Example User Prompts
- "Build a secure RESTful task API in Express with envguard-backend"
- "Add input validation, structured errors, and health checks to our backend service"
- "Implement graceful shutdown and EnvGuard startup validation for our Node.js API"
