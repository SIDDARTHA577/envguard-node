# EnvGuard Developer Skills Platform Architecture

## 1. Platform Design Principles

The EnvGuard Developer Skills Platform is built around four foundational principles:

1. **Strict Layer Separation**:
   - **Layer A (EnvGuard Core)**: A lightweight, zero-dependency TypeScript library and CLI (`envguard-node`). It remains completely unencumbered by AI agent frameworks, database drivers, or test runners.
   - **Layer B (EnvGuard Developer Skills)**: An optional, modular suite of AI coding-agent skills that guide coding agents through the software development lifecycle.
2. **Canonical Single Source of Truth**:
   - Every skill has a single canonical directory containing its authoritative `SKILL.md` (and optional `scripts/` or `references/`).
   - Host-specific directories (such as `.agents/skills/` for Codex or `plugin.json` for Antigravity) are generated and synchronized from canonical sources by automated tooling, preventing documentation drift.
3. **Modular Skill Packs**:
   - Skills are grouped into focused, independently selectable packs (`core`, `fullstack`, `production`).
   - Developers and agents can install only what their project requires.
4. **Safety & Non-Destructive Operation**:
   - All skills follow least-privilege security boundaries.
   - Installers validate destination boundaries against directory traversal (`../`).
   - All managed files are tracked in `.envguard-skills.json` to allow clean uninstallation and idempotent updates without clobbering user files.

---

## 2. Directory Layout

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
    └── skills/                 # Platform and installer documentation
```

---

## 3. Skill Packs Specification

| Pack ID | Pack Name | Focus & Skills |
| :--- | :--- | :--- |
| `core` | EnvGuard Core Configuration & Security | `envguard-audit`, `envguard-setup`, `envguard-review`, `envguard-ci`, `envguard-migrate` |
| `fullstack` | EnvGuard Full-Stack Engineering | `envguard-frontend`, `envguard-ui-design`, `envguard-backend`, `envguard-database`, `envguard-system-design`, `envguard-api-design`, `envguard-fullstack-integration` |
| `production` | EnvGuard Production Readiness & Verification | `envguard-test-engineer`, `envguard-security-audit`, `envguard-accessibility`, `envguard-devops`, `envguard-observability`, `envguard-production-review`, `envguard-load-test` |

---

## 4. Multi-Host Adaptation Strategy

- **OpenAI Codex & Agent Skills standard**: Discovered via `.agents/skills/<skill-name>/SKILL.md` or `.agents/agent.json`.
- **Google Antigravity**: Discovered via project root `plugin.json` and `skills/<skill-name>/SKILL.md`.
- **Claude Code**: Discovered via `.claude-plugin/plugin.json` and project skills.
- **Cursor**: Integrated via project rules and Agent Skills Markdown instructions.

