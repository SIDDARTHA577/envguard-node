# EnvGuard Full-Stack Golden Path Application

A complete, reference full-stack application built to validate the EnvGuard developer skills workflow:
- **`envguard-system-design`**: Architectural specifications, component diagrams, and ADRs in `docs/`.
- **`envguard-backend`**: Express.js REST API with input validation, health checks, and EnvGuard startup configuration validation.
- **`envguard-database`**: Transactional relational persistence with migrations, indexing, and synthetic seeds.
- **`envguard-frontend`**: React + TypeScript client handling loading, empty, success, and error states.
- **`envguard-fullstack-integration`**: Shared contracts, CORS boundaries, and end-to-end integration tests.

---

## Getting Started

### 1. Environment Setup
Copy the verified template:
```bash
cp .env.example .env
```

### 2. Run Tests
Execute the comprehensive test suites verifying backend endpoints, database persistence, and full-stack integration:
```bash
npm test
```

### 3. Architecture & ADR Documentation
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/adr/0001-task-platform-architecture.md`](./docs/adr/0001-task-platform-architecture.md)
