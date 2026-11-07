---
name: envguard-api-design
description: Guides the specification and design of standardized RESTful APIs with OpenAPI 3.1 contracts, explicit HTTP semantics, RFC 7807 structured error responses, pagination, filtering, and backward compatibility.
---

# `envguard-api-design` Skill

Guides engineers and AI agents in architecting, documenting, and validating production-grade RESTful API contracts. Enforces clear HTTP semantics, schema-driven validation, structured error reporting via RFC 7807 / RFC 9457 Problem Details, robust pagination, and backward compatibility.

## When to Trigger
- Designing, documenting, or refactoring RESTful API endpoints, request schemas, and response shapes.
- Creating or updating OpenAPI 3.0 / 3.1 specifications, JSON Schema contracts, or TypeBox/Zod validation schemas.
- Standardizing HTTP status codes, method semantics (GET, POST, PUT, PATCH, DELETE), and resource URL paths.
- Implementing structured error response envelopes compliant with RFC 7807 / RFC 9457 Problem Details.
- Defining query parameters for collection endpoints including pagination (cursor vs offset), sorting, and filtering.
- Reviewing API changes for breaking modifications, field deprecation, and backward-compatible versioning.

## When NOT to Trigger
- Writing low-level database queries, SQL migrations, or connection pools (use `envguard-database`).
- Implementing client-side React components, CSS styling, or JSX templates (use `envguard-frontend` or `envguard-ui-design`).
- Configuring CI/CD deployment pipelines or infrastructure orchestration (use `envguard-ci` or `envguard-devops`).
- Validating raw environment variables at server boot (use `envguard-setup` or `envguard-review`).

## Supported Projects & Environments
- Runtimes: Node.js (22.x, 24.x, 26.x), Bun, Deno, Edge runtimes.
- Frameworks: Express, Fastify, NestJS, Koa, Hono, Next.js API Routes.
- Specifications: OpenAPI 3.0 / 3.1, JSON Schema Draft 7 / 2020-12, AsyncAPI.
- Schema Validators: EnvGuard (`guard()`), Zod, TypeBox, Valibot, Joi.
- Documentation Formats: Swagger UI, Redoc, Stoplight Elements.

## Required Tools & Permissions
- Tools: File reader, file writer, test runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to inspect, create, and update route definitions, API specifications, and contract test fixtures.

## Expected Inputs
- Target resource entities and domain models (e.g. `User`, `Task`, `Workspace`, `Organization`).
- Business actions required on resources (create, retrieve, list, update, patch, soft/hard delete).
- Existing API routing codebase or OpenAPI specification documents.

## Step-by-Step Workflow

### Step 1: Resource Modeling & URL Hierarchy
- Name resources using plural lowercase nouns: `/api/v1/tasks`, `/api/v1/users`, `/api/v1/projects`.
- Model sub-resources hierarchically only when parent ownership is strictly dependent:
  - `/api/v1/projects/{projectId}/tasks`
  - Avoid nesting deeper than two levels (e.g. `/api/v1/orgs/{orgId}/projects/{projId}/teams/{teamId}/members` is an anti-pattern; flatten to `/api/v1/teams/{teamId}/members`).
- Keep URLs clean and free of RPC action verbs:
  - Use `POST /api/v1/tasks` (NOT `/api/v1/createTask`).
  - Use `DELETE /api/v1/tasks/{id}` (NOT `/api/v1/deleteTaskById?id=123`).
  - For non-CRUD state transitions, use sub-resource actions: `POST /api/v1/tasks/{id}/archive` or `POST /api/v1/tasks/{id}/publish`.

### Step 2: HTTP Method Semantics & Status Codes
- Strictly enforce standard HTTP methods and expected response codes:
  - `GET`: Safe and idempotent. Return `200 OK` with payload, or `404 Not Found` if entity missing.
  - `POST`: Non-idempotent creation or action. Return `201 Created` with `Location` header, or `200 OK` / `202 Accepted` for asynchronous tasks.
  - `PUT`: Idempotent full replacement of the resource. Return `200 OK` or `204 No Content`.
  - `PATCH`: Partial resource modification. Return `200 OK` with the updated resource representation.
  - `DELETE`: Idempotent deletion. Return `204 No Content` on success, or `200 OK` if returning tombstone details.
- Avoid the anti-pattern of returning `200 OK` with `{ "success": false, "error": "..." }`. Failures MUST use appropriate 4xx/5xx status codes.

### Step 3: Standardized Error Responses (RFC 7807 / RFC 9457)
- Structure all error responses using Problem Details standard (`application/problem+json`):
  ```json
  {
    "type": "https://api.example.com/errors/validation-failed",
    "title": "Validation Failed",
    "status": 400,
    "detail": "The request body contains invalid parameter values.",
    "instance": "/api/v1/tasks/123",
    "invalidParams": [
      {
        "name": "priority",
        "reason": "Must be one of ['low', 'medium', 'high', 'urgent']"
      }
    ],
    "traceId": "req-9f20e4b"
  }
  ```
- **Rule**: Never expose raw stack traces, SQL syntax errors, internal filesystem paths, or database connection strings in error payloads.

### Step 4: Collection Query Standards (Pagination, Filtering, Sorting)
- Support structured collection pagination:
  - **Cursor-based (Recommended for high volume)**: `?limit=25&cursor=eyJpZCI6MTAwfQ` -> returns `{ "data": [...], "pagination": { "nextCursor": "...", "hasMore": true } }`.
  - **Offset-based (Simple tabular data)**: `?page=1&limit=25` -> returns `{ "data": [...], "pagination": { "page": 1, "limit": 25, "total": 140, "totalPages": 6 } }`.
  - Cap maximum page size (e.g. `limit` maximum 100) to prevent denial-of-service via unbounded queries.
- Sorting: `?sort=-createdAt,priority` (prefix `-` signifies descending order).
- Filtering: Explicit field matches (e.g. `?status=open&priority=high`).

### Step 5: OpenAPI 3.1 Specification Authoring
- Author or update OpenAPI 3.1 schemas with full documentation:
  - `info`: Title, version, description, license.
  - `servers`: Environment URLs (`https://api.example.com/v1`, `http://localhost:3000/v1`).
  - `paths`: Method definitions with `operationId`, `summary`, `tags`, `parameters`, `requestBody`, and `responses`.
  - `components.schemas`: Reusable data models with `type`, `properties`, `required`, and sample values.
  - `components.securitySchemes`: Bearer tokens, OAuth2 flows, or API keys.

### Step 6: Backward Compatibility & Versioning
- Enforce backward-compatible evolution rules:
  - **Non-breaking**: Adding new endpoints, adding optional request fields, adding new response fields.
  - **Breaking**: Renaming fields, changing field types, removing fields, adding mandatory request parameters, altering status codes.
- When breaking changes are unavoidable, introduce a new major API version prefix (e.g. `/v2/`) and maintain the `/v1/` endpoint with deprecation headers (`Sunset`, `Deprecation`).

## Validation Steps
- Validate OpenAPI spec files using schema validation tools or linting (`spectral lint` or internal schema validator).
- Verify that every endpoint has explicit 4xx and 5xx error responses documented.
- Verify that all collection endpoints document pagination constraints and maximum page sizes.
- Verify that zero endpoints return `200 OK` when encountering validation or authorization errors.

## Expected Outputs
- Valid OpenAPI 3.1 document (`openapi.json` or `openapi.yaml`).
- TypeScript request and response interface definitions matching the API schema.
- Route controller specifications adhering to HTTP verb and status code standards.
- Problem Details error formatting middleware/utility.

## Failure Handling
- If legacy endpoints violate REST conventions, provide an adapter facade and establish deprecation timelines rather than immediately breaking client integrations.
- If payload schemas conflict with database types, introduce distinct Data Transfer Objects (DTOs) with mapping functions.

## Safety & Privacy Boundaries
- Never accept unvalidated JSON bodies directly into database queries; always validate schemas first.
- Never document sensitive environment variables, internal infrastructure IPs, or administrative credentials in public OpenAPI specs.
- Sensitive fields (passwords, tokens, SSNs) must be marked `writeOnly: true` in schemas and excluded from response representations.

## Example User Prompts
- "Design a RESTful API contract for our task management service with envguard-api-design"
- "Generate an OpenAPI 3.1 specification for our user and organization endpoints"
- "Standardize error handling and pagination across all backend routes to RFC 7807"

