# ADR 0002: Reference Architecture Study & Skills Platform Hardening

## Status
Accepted

## Context
During the design and expansion of the EnvGuard Developer Skills platform, we surveyed leading open-source Agent Skills repositories, specifically the public reference project [`mukul975/Anthropic-Cybersecurity-Skills`](https://github.com/mukul975/Anthropic-Cybersecurity-Skills).

The reference repository organizes 800+ cybersecurity skills under the `agentskills.io` standard, providing valuable real-world lessons in community scale, frontmatter validation, collision detection, and automated indexing.

### Key Architectural Lessons from Reference Repository
1. **Single-Procedure Scope**: Each skill must address one concrete, well-bounded procedure rather than attempting to serve as a monolithic omnibus prompt.
2. **Deterministic Trigger Specifications**: Descriptions must explicitly articulate both positive triggers ("When to Trigger") and negative triggers ("When NOT to Trigger") to prevent competing skills from fighting over identical queries.
3. **Collision & Duplicate Detection**: In large skill catalogs, near-duplicate skill names and overlapping triggers degrade agent decision quality. Automated collision detection is critical.
4. **Automated Conformance Testing**: Every skill must undergo rigorous schema validation, YAML parsing, and structural checks during CI.
5. **Synchronized Indexes**: Catalogs and manifests must be generated or verified from canonical sources to eliminate documentation drift.
6. **Multi-Host Compatibility Verification**: Skills claiming compatibility with Codex, Antigravity, Claude Code, or Cursor must have verifiable directory structures and tested integration paths rather than unsubstantiated claims.

### Key Architectural Differences in EnvGuard
While the reference repository focuses on cybersecurity domain procedures, EnvGuard has distinct core product requirements:
1. **Layer A vs Layer B Isolation**: EnvGuard maintains a production environment validation library (`envguard-node`) with zero runtime dependencies. Skill tooling must remain strictly isolated in `devDependencies` and optional developer packs.
2. **Active Local Installation & Lifecycle Management**: EnvGuard provides an active local installer/uninstaller (`tools/skill-manager.mjs`) supporting dry-run previews, path-traversal protection, Windows symlink/junction defense, and checksum-based file preservation.
3. **Evidence-Based Application Readiness**: EnvGuard skills guide real application architecture, test generation, and verifiable configuration checks rather than purely conversational security advice.

---

## Decision

We incorporate the best practices learned from the reference study into EnvGuard's platform tooling:
1. **Standards-Compliant YAML Frontmatter**: Transition from ad-hoc string parsing to a robust YAML parser (`yaml` in `devDependencies`) supporting folded multiline descriptions, proper quoting, and schema enforcement.
2. **Symlink and Path Traversal Defense**: Enforce filesystem boundary verification (`lstat`, `realpath`) preventing symlink escapes or Windows junction redirection during install and uninstall operations.
3. **User Modification Preservation**: Uninstall operations verify SHA-256 hashes against recorded installation metadata (`.envguard-skills.json`), refusing to delete modified user files unless explicitly forced.
4. **Synchronized Multi-Host Resources**: Canonical skill directories synchronize all valid assets (`SKILL.md`, `scripts/`, `references/`, `assets/`) and detect stale or orphaned artifacts.
5. **Strict Host Verification**: Reject unknown target hosts; explicitly validate and document distinct directory conventions for Codex, Antigravity, Claude Code, and Cursor.
