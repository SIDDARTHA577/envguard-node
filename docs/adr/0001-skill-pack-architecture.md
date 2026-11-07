# ADR 0001: EnvGuard Modular Skill Pack Platform Architecture

## Status
Accepted

## Context
EnvGuard was initially created as a zero-dependency, type-safe runtime environment validation library and CLI (`envguard-node`). Alongside the core library, five initial agent skills were authored for AI coding agents (`envguard-setup`, `envguard-audit`, `envguard-migrate`, `envguard-ci`, `envguard-review`).

As the EnvGuard platform expands to support end-to-end software development workflows (full-stack engineering, production readiness, security audits, load testing, and architecture planning), the platform must support multiple AI coding agent hosts:
- OpenAI Codex and Agent Skills standard tools (`.agents/skills/` or `skills/`)
- Google Antigravity (`plugin.json` and workspace discovery)
- Claude Code (`.claude-plugin/plugin.json` or `.claude/skills/`)
- Cursor (documented rule / skill integration paths)

Key architectural challenges include:
1. **Core Library Isolation (Layer A vs Layer B)**: The core npm library (`envguard-node`) must remain lightweight, fast, and completely free of third-party runtime dependencies. AI agent skills must not pull database drivers, testing harnesses, or UI frameworks into `dependencies`.
2. **Multi-Host Format Diversity**: Different agent hosts expect different directory conventions, manifests, or activation models. Duplicating skill markdown files by hand across multiple directories causes documentation drift and synchronization bugs.
3. **Selective Installation & Project Footprint**: A developer building a minimal backend microservice should not be forced to install frontend or load-testing skills. Users must be able to install individual skills, a focused skill pack, or the entire developer suite.
4. **Safety & Non-Destructive Local Operation**: Skill installation must operate safely from a local checkout, protect existing user files from unauthorized overwrites, block directory traversal attacks, track installed files via metadata, and support dry-run and clean uninstallation.

---

## Decision

### 1. Two-Layer Separation

- **Layer A: EnvGuard Core**
  - Published as `envguard-node`.
  - Zero runtime dependencies (`dependencies: {}`).
  - Strict semver and backward compatibility.
  - Contains TypeScript schemas, type coercion, dotenv parser, and CLI (`envguard check`, `envguard init`).
  - Packaged via `npm pack` containing only `dist/`, `README.md`, and `LICENSE`.

- **Layer B: EnvGuard Developer Skills**
  - Distributed as modular Agent Skills packs.
  - Maintained in canonical source directories.
  - Installable locally into user projects or agent environments.
  - Does not modify or bloat Layer A runtime artifacts.

### 2. Canonical Directory Structure

To maintain a clean separation of concerns and avoid manual duplication:
```text
envguard-node/
├── catalog/
│   ├── packs.json              # Pack registry (core, fullstack, production)
│   ├── skills.json             # Canonical metadata registry for all skills
│   └── schema.json             # JSON schema for catalog validation
├── skills/                     # Canonical Core Configuration & Security skills
│   ├── envguard-audit/
│   ├── envguard-ci/
│   ├── envguard-migrate/
│   ├── envguard-review/
│   └── envguard-setup/
├── packs/
│   ├── fullstack/skills/       # Canonical Full-Stack Development skills (Phase 2)
│   └── production/skills/      # Canonical Production & Verification skills (Phase 3/4)
├── tools/
│   └── skill-manager.mjs       # CLI tool for listing, dry-run, install, sync, verify, uninstall
├── tests/
│   └── skills/                 # Automated quality checks, frontmatter validation, installer tests
└── docs/
    ├── adr/                    # Architecture Decision Records
    └── skills/                 # Skills platform guides and host compatibility
```

### 3. Skill Packaging & Packs

Skills are grouped into three primary packs:
- `core`: Existing environment variable validation, onboarding, migration, security review, and CI integration skills.
- `fullstack`: Frontend, backend, UI design, database engineering, system design, API contracts, and full-stack integration skills.
- `production`: Test engineering, security auditing, accessibility inspection, DevOps configuration, observability, load testing, and production reviews.

### 4. Installation & Management Lifecycle (`tools/skill-manager.mjs`)

A portable Node.js tool provides complete local skill lifecycle management:
- **Local Operation**: Works directly from a Git checkout without requiring npm publication or registry access.
- **Granular Selection**: Supports installing a single skill (`--skill <name>`), a pack (`--pack <name>`), or all skills (`--pack all`).
- **Host Adaptation**: Supports targeting Codex (`.agents/skills`), Antigravity (`skills/` + `plugin.json`), Claude Code (`.claude/skills` / `.claude-plugin`), or custom destinations.
- **Dry-Run Mode**: Visualizes planned additions, updates, and removals before filesystem writes.
- **Safety & Isolation**: Enforces canonical path boundary checks to prevent path traversal (`../`). Prevents overwriting untracked user files without explicit `--force`.
- **Installation Metadata**: Records state in `.envguard-skills.json` (listing installed skills, managed files, SHA-256 hashes, and timestamp) for safe, idempotent updates and clean uninstallation.
- **Clean Uninstall**: Removes only EnvGuard-managed files and cleans up orphaned directories.

---

## Consequences

### Positive
- Layer A (`envguard-node`) remains 100% dependency-free and lightweight.
- Single source of truth for all skill definitions prevents documentation drift.
- Developers and AI agents can selectively install only the skills needed for their specific tech stack.
- Multi-host support is automated and validated via CI tests.
- High safety guarantees: zero remote telemetry, dry-run previews, path traversal protection, and safe rollback.

### Negative / Trade-offs
- Requires maintaining the `skill-manager` tool and catalog metadata as new skills are introduced.
- Multi-host synchronization requires automated CI verification to ensure generated manifests remain aligned with canonical skills.

