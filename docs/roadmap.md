# EnvGuard Product Roadmap

This roadmap reflects genuine engineering priorities and planned capabilities based on real developer workflows. It is updated transparently alongside releases.

---

## Now (v1.0.0 Baseline) :white_check_mark:

- [x] **Zero-Secrets-Leakage Validation Engine**: Architecturally guaranteed redaction of raw configuration values across all errors, diagnostics, and JSON reports.
- [x] **Zero Runtime Dependencies**: Strict dependency on Node.js standard libraries (`node:fs`, `node:path`, `node:url`) to eliminate supply-chain risk.
- [x] **Dual ESM & CommonJS Compilation**: Synchronous out-of-the-box support for both modern ESM `import` and legacy CommonJS `require()`.
- [x] **Standalone Safe CLI**: `envguard check` and `envguard init` with deterministic exit codes (`0`, `1`, `2`) and machine-readable JSON output.
- [x] **Hardened `.env` Parser**: Safe line-by-line parsing with BOM stripping, multi-line string support, CRLF/LF handling, and prototype pollution guards.
- [x] **AI Coding Agent Skills**: Installable skills (`envguard-audit`, `envguard-setup`, `envguard-review`, `envguard-ci`, `envguard-migrate`) with Antigravity, Claude Code, and Codex manifests.
- [x] **Supply-Chain Security**: Pinned GitHub Actions SHAs, CodeQL security analysis, Dependabot automation, and automated tarball installation tests.

---

## Next (v1.1.0 – v1.2.0) :hammer_and_wrench:

- [ ] **Framework Integration Adapters**: Optional lightweight middleware wrappers for Express, Fastify, and NestJS that validate config during application bootstrap.
- [ ] **Config Drift Diffing (Values Redacted)**: Enhanced `envguard diff` command to compare `.env.example` against `.env` or deployed environments, showing missing or surplus keys without revealing any values.
- [ ] **JSON Schema Generator**: Command to export an EnvGuard TypeScript schema definition directly into standard JSON Schema (draft 2020-12) for IDE auto-completion.
- [ ] **Community Feedback Triage**: Address feature requests and usability feedback from early production adopters.

---

## Later (v2.0.0 & Future Exploration) :crystal_ball:

- [ ] **Deep Nested Object Validation**: Declarative validation for complex nested JSON structures in microservice configuration maps.
- [ ] **Additional AI Agent Host Adaptations**: Support for newly emerging agent skill standards as they achieve official multi-vendor adoption.
- [ ] **Automated Attestation & SLSA Provenance**: Publish npm packages with Sigstore build provenance attestations via GitHub Actions.
