---
name: envguard-database
description: Guides relational and document database schema design, indexing strategies, non-destructive migration planning, transaction management, connection pool optimization, and synthetic test fixture generation.
---

# `envguard-database` Skill

Guides database schema modeling, performance indexing, non-destructive migrations, transactions, and secure connection configuration.

## When to Trigger
- Designing or modifying database tables, collections, and relations.
- Planning non-destructive database migrations and schema rollbacks.
- Adding performance indexes and optimizing slow query patterns.
- Configuring database connection pools, SSL/TLS, and credentials safely.
- Generating synthetic test data fixtures for local development.

## When NOT to Trigger
- Writing HTTP API controllers or Express routes (use `envguard-backend`).
- Auditing environment variables in general (use `envguard-audit`).
- Running destructive drop-table migrations on live production databases.

## Supported Projects & Environments
- Relational databases: PostgreSQL, MySQL, SQLite.
- Document databases: MongoDB.
- ORMs and query builders: Prisma, Drizzle, Kysely, Knex, Mongoose, TypeORM, native drivers (`pg`, `mysql2`, `better-sqlite3`).

## Required Tools & Permissions
- Tools: File reader, file writer, schema inspection (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to create migration scripts and data models. No live production database execution without explicit confirmation.

## Expected Inputs
- Entity relationship requirements (tables, fields, constraints, relations).
- Target database engine and active ORM/migration tool.
- Query workload characteristics (read-heavy, write-heavy, analytical).

## Step-by-Step Workflow

### Step 1: Data Modeling & Constraint Definition
- Define entity fields with explicit types, nullability, defaults, and foreign key constraints.
- Enforce domain constraints at the database level (`NOT NULL`, `UNIQUE`, `CHECK`, foreign key `ON DELETE CASCADE / RESTRICT`).
- Ensure primary keys use appropriate types (UUIDv7, auto-increment integer, or ULID).

### Step 2: Indexing Strategy & Query Optimization
- Add indexes for fields frequently filtered, sorted, or joined (`WHERE`, `ORDER BY`, foreign keys).
- Prevent redundant or overlapping indexes that penalize write throughput.
- Use composite indexes where queries filter on multiple columns together (ordering columns from highest to lowest selectivity).

### Step 3: Non-Destructive Migration Planning
- Structure migrations into backward-compatible phases (Expand and Contract pattern):
  1. Add new column/table with nullable or default value.
  2. Deploy application code supporting both old and new schema.
  3. Backfill data asynchronously.
  4. Deprecate and remove old column/table in a subsequent release.
- **NEVER** run destructive schema operations (`DROP COLUMN`, `DROP TABLE`, `TRUNCATE`) against live databases.

### Step 4: Transaction & Connection Pool Management
- Wrap multi-operation business workflows in ACID transactions to guarantee data consistency.
- Configure connection pools with bounded minimum and maximum connections (`min`, `max`, `idleTimeoutMillis`).
- Enforce encrypted transport (`ssl: { rejectUnauthorized: true }`) for remote databases.

### Step 5: Synthetic Test Fixtures
- Generate realistic, synthetic seed data for local testing.
- Ensure synthetic data contains no real PII, real customer credentials, or production data dumps.

## Validation Steps
- Verify schema migrations apply cleanly on a blank test database and roll back without errors.
- Confirm foreign keys and constraints reject invalid or orphaned records.
- Validate that connection strings are loaded via EnvGuard with protocol validation and `.sensitive()` redaction.

## Expected Outputs
- SQL DDL migration files or ORM schema definitions (`schema.prisma`, `schema.ts`).
- Documentation detailing entity relationships and indexing decisions.
- Synthetic seed data scripts.

## Failure Handling
- If migration fails during testing, roll back transaction immediately and report schema conflict.
- If connection pool saturates under test, recommend pool resizing and statement timeout configurations.

## Safety & Privacy Boundaries
- **NEVER** run destructive commands (`DROP TABLE`, `DROP DATABASE`) without separate explicit human approval.
- **NEVER** commit real production connection strings or database credentials to version control.
- Ensure all database URLs use `s.url().sensitive()` in EnvGuard schemas.

## Example User Prompts
- "Design a PostgreSQL schema with migrations for our task system using envguard-database"
- "Plan a non-destructive migration to add a priority field to the tasks table"
- "Create synthetic test fixtures and connection pool configuration for SQLite and Postgres"
