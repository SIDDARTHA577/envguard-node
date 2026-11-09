# EnvGuard Product Roadmap

This roadmap reflects genuine engineering priorities and planned capabilities based on real developer workflows. It is updated transparently alongside releases.

---

## Now (v1.0.0 Baseline) :white_check_mark:

- [x] **Redacted Diagnostic Validation Engine**: Built-in error reporting and JSON diagnostics architected to omit raw environment values.
- [x] **Zero Runtime Dependencies**: Strict dependency on Node.js standard libraries (`node:fs`, `node:path`, `node:url`) to eliminate supply-chain risk.
- [x] **Dual ESM & CommonJS Compilation**: Synchronous out-of-the-box support for both modern ESM `import` and legacy CommonJS `require()`.
- [x] **Standalone Safe CLI**: `envguard check`, `envguard init`, and `readiness-auditor` with deterministic exit codes (`0`, `1`, `2`) and machine-readable JSON/Markdown output.
- [x] **Hardened `.env` Parser**: Safe line-by-line parsing with BOM stripping, multi-line string support, CRLF/LF handling, and prototype pollution guards.
- [x] **AI Coding Agent Skills Platform**: 18 installable skills across 3 packs (`core`, `fullstack`, `production`) with Antigravity, Claude Code, Cursor, and Codex manifests.
- [x] **Multi-Platform Readiness Adapters**: 10 built-in adapters (`generic`, `node-typescript`, `nextjs-react`, `python`, `java-spring`, `react-native`, `flutter`, `android`, `ios`, `architecture`).
- [x] **System Architecture & Design Engine**: 17 mandatory design concept evaluations, automated ADR generation, FMEA risk analysis, and transparent capacity modeling.
- [x] **Execution Trust Boundaries & Comparator Hardening**: Explicit trust models (`TRUSTED_LOCAL_PROJECT`, `ISOLATED_UNTRUSTED_PROJECT`, `STATIC_ONLY`), same-project regression tracking, and waiver framework.
- [x] **Supply-Chain Security**: Pinned GitHub Actions SHAs, CodeQL security analysis, Dependabot automation, and automated tarball installation tests.

---

## Completed Engineering Milestones (Phases 10 – 14) :white_check_mark:

- [x] **Phase 10 — Complete Senior Engineering Agent Orchestration**: Autonomous multi-stage evaluation pipeline coordinating discovery, planning, dynamic 18-skill selection, and session artifact emission. (Completed — PR #20)
- [x] **Phase 11 — Reviewable Fixes & Automated Retesting Workflow**: Non-destructive remediation patches (`ENV-001`, `ENV-002`, `BUILD-001`) with unified diff previews, atomic rollback checkpoints, mandatory human approval gates, and automatic retesting. (Completed — PR #21)
- [x] **Phase 12 — Real Deployment, Scalability & Reliability Validation**: Empirical deployment readiness checklists (unprivileged containers, health probes, k8s manifests, CI/CD gates), workload classification (`ESTIMATED`, `SIMULATED`, `MEASURED`, `VERIFIED_STAGING`, `UNKNOWN_PRODUCTION`), and strict no-auto-deploy enforcement. (Completed — PR #22)
- [x] **Phase 13 — Independent Developer & Agent Testing**: Verification across 12 distinct project archetypes and 4 agent host directory structures (`.agents`, `.claude`, `.cursor`, `skills/`) with honest adoption disclosures. (Completed — PR #23)
- [x] **Phase 14 — Final Platform Stabilization**: Zero-dependency boundary audit, comprehensive documentation synchronization, and release-ready maintainer review package. (Completed — PR #24)

---

## Later (v2.0.0 & Future Exploration) :crystal_ball:

- [ ] **Deep Nested Object Validation**: Declarative validation for complex nested JSON structures in microservice configuration maps.
- [ ] **Additional AI Agent Host Adaptations**: Support for newly emerging agent skill standards as they achieve official multi-vendor adoption.
- [ ] **Automated Attestation & SLSA Provenance**: Publish npm packages with Sigstore build provenance attestations via GitHub Actions.

