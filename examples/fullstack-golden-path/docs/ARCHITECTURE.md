# Task Management System Architecture

This system design document was produced following the `envguard-system-design` and `envguard-fullstack-integration` workflow standards.

## 1. System Overview

The system is a modular full-stack application providing task and project management with fail-fast runtime environment validation, strict CORS boundaries, structured JSON errors, and transactional persistence.

```mermaid
flowchart TD
    Client["React 19 Frontend (SPA)"]
    API["Express.js REST API (Node.js 22/24/26)"]
    EnvConfig["EnvGuard Configuration Validator (guard())"]
    DB["Transactional Database Layer (SQLite / Postgres)"]

    Client -->|"HTTP / JSON (Shared Contracts)"| API
    API -->|"Startup Pre-flight Check"| EnvConfig
    API -->|"ACID Transactions & Queries"| DB
```

## 2. Component Boundaries & Responsibilities

1. **Client Tier (`src/frontend`)**:
   - Built with React and TypeScript.
   - Responsible for rendering responsive views, client-side input validation, accessible status alerts, and async state management (loading, empty, success, error).
   - Only accesses public client configuration (`VITE_API_BASE_URL`).

2. **API Tier (`src/backend`)**:
   - Built with Node.js and Express in TypeScript.
   - Validates environment configuration at boot time using `guard()`.
   - Enforces CORS policies, input validation on all route parameters and request bodies, and centralized structured error responses.
   - Provides `GET /health` endpoint for readiness/liveness monitoring.

3. **Persistence Tier (`src/backend/db`)**:
   - Implements transactional relational storage with schema migrations, indexes on `status` and `priority`, and ACID rollback capabilities.

## 3. Data Contracts & Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as React Client
    participant Backend as Express API
    participant DB as Database

    User->>Frontend: Enters title & clicks Submit
    Frontend->>Frontend: Validate title is non-empty
    Frontend->>Backend: POST /api/tasks { title, priority }
    Backend->>Backend: Validate payload parameters
    Backend->>DB: BEGIN TRANSACTION & INSERT
    DB-->>Backend: Created record with UUID & timestamps
    Backend-->>Frontend: HTTP 201 Created { success: true, data: Task }
    Frontend->>User: Appends to task list & clears form
```
