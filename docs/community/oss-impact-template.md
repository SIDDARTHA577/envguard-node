# Open-Source Impact & Evidence Template

> Maintainer-facing template for compiling truthful, verifiable evidence of project maturity, engineering health, community adoption, and open-source impact.

---

## 1. Evidence Verification Taxonomy

To maintain strict open-source integrity, all entries in this evidence ledger must be classified into one of four verified status categories:

- **[VERIFIED FACT]**: Backed by publicly verifiable, immutable evidence (e.g. merged PR SHA, GitHub API response, npm registry stats, CI run URL).
- **[PENDING VERIFICATION]**: Action completed or artifact generated, but awaiting external confirmation or human review.
- **[NOT YET AVAILABLE]**: Metric or milestone is not yet applicable (e.g. npm package downloads prior to public publication).
- **[FUTURE GOAL]**: Planned objective on the project roadmap.

> [!IMPORTANT]
> **Strict Anti-Fabrication Principles:**
> - Never generate fake downloads, stars, forks, or synthetic testimonials.
> - Self-owned repository commits or PRs authored by repository maintainers must **never** be counted as external community contributions.
> - Do not artificially create trivial PRs (e.g. whitespace edits, cosmetic changes) to inflate contribution counts.
> - Do not create bot accounts or phantom accounts to simulate community engagement.
> - **OpenSSF Distinction**: Clearly differentiate between the **OpenSSF Scorecard** (automated security posture analysis of supply chain risks) and the **OpenSSF Criticality Score** (algorithmic measurement of project influence across open-source ecosystems). Never fabricate or conflate these metrics.

---

## 2. Project Identification & Verified Baseline

| Attribute | Verified Value | Evidence Status | Verification Source |
| :--- | :--- | :--- | :--- |
| **Repository** | `https://github.com/SIDDARTHA577/envguard-node` | [VERIFIED FACT] | GitHub repository metadata |
| **Owner / Maintainer** | `SIDDARTHA577` | [VERIFIED FACT] | GitHub account profile |
| **Default Branch** | `main` | [VERIFIED FACT] | Git remote head |
| **Protected Ruleset** | ID `26347106` | [VERIFIED FACT] | GitHub branch rulesets API |
| **Core Package Name** | `envguard-node` | [VERIFIED FACT] | `package.json#name` |
| **License** | MIT License | [VERIFIED FACT] | `LICENSE` file in repo root |
| **Current Status** | Under active development; unreleased | [VERIFIED FACT] | Maintainer directive |

---

## 3. Project Architecture & Functional Integrity

### A. Core Library Isolation (Layer A)
- **Status**: `[VERIFIED FACT]`
- **Constraint**: Zero runtime dependencies (`dependencies: {}` in root `package.json`).
- **Packaging**: Packaged tarball strictly contains `dist/`, `README.md`, `LICENSE`, `package.json`. Developer tooling, test suites, and skill packs remain strictly isolated.
- **Verification Command**:
  ```bash
  npm run test:pack
  ```

### B. Developer Skills & Multi-Platform Readiness (Layer B)
- **Status**: `[VERIFIED FACT]`
- **Catalog Size**: 16 canonical skills in `catalog/skills.json` across 3 packs (`core`, `fullstack`, `production`).
- **Supported Platform Adapters**: 9 built-in adapters (`generic`, `node-typescript`, `nextjs-react`, `python`, `java-spring`, `react-native`, `flutter`, `android`, `ios`).
- **Verification Command**:
  ```bash
  npm run skills:verify
  npx vitest run tests/readiness/
  ```

---

## 4. GitHub Contribution & PR Evidence Ledger

| Milestone / PR | PR Number | Merged Commit SHA | Scope / Deliverable | Status |
| :--- | :---: | :---: | :--- | :---: |
| **Phase 0** | #3 | `6ca6ea8...` | Documentation corrections & baseline stabilization | `[VERIFIED FACT]` |
| **Phase 1** | #5 | `d7d1f47...` | Agent Skills platform & skill manager infrastructure | `[VERIFIED FACT]` |
| **Phase 1.1** | #7 | `...` | Skill manager hardening & host isolation checks | `[VERIFIED FACT]` |
| **Phase 2B** | #8 | `a22d4c0...` | Full-stack engineering skills (UI, API, a11y, code review) | `[VERIFIED FACT]` |
| **Phase 3** | #9 | `ba6add7...` | Evidence-based Production Readiness Auditor | `[VERIFIED FACT]` |
| **Phase 3.1 & 3.2** | #10 | `...` | Adapter architecture & test runner isolation | `[VERIFIED FACT]` |
| **Phase 4.1.1** | #13 | `8da75c7...` | Verification accuracy hardening (SARIF, SQL, index prefix) | `[VERIFIED FACT]` |
| **Phase 4.2** | #14 | `87c6374...` | Multi-language backend adapters (Python, Java/Spring Boot) | `[VERIFIED FACT]` |
| **Phase 5** | Pending | Branch `feat/envguard-mobile-readiness` | Universal mobile application readiness (RN, Flutter, Android, iOS) | `[PENDING VERIFICATION]` |

---

## 5. Community & External Ecosystem Metrics

### A. Maintainer vs External Contributions
- **Total Maintainer Merged PRs**: 9 PRs (Phases 0 through 4.2).
- **External Community Contributors**: 0 `[VERIFIED FACT]`.
  - *Policy*: Do not list maintainer commits as external contributions.
  - *Next Milestone*: Establish clear `CONTRIBUTING.md` guidelines and good-first-issues to invite external peer review.

### B. Package Registry Metrics
- **npm Publication Status**: Unpublished `[VERIFIED FACT]`.
- **npm Downloads (Weekly/Monthly)**: `[NOT YET AVAILABLE]` (Release publication pending maintainer authorization).
- **npm Dependents**: `[NOT YET AVAILABLE]`.

### C. Independent Applications & Integrations
- **Controlled In-Repo Evaluation Fixtures**: 18 fixtures across web, full-stack, monorepo, backend (Django, FastAPI, Spring Boot), and mobile (Expo, Flutter, Android, iOS).
- **External Disposable Projects**: Validated clean installation in temporary isolated project directories (`.agents/skills/`).
- **Production Adoption by External Organizations**: `[NOT YET AVAILABLE]` (Awaiting public v1.0.0 release).

---

## 6. Supply Chain Security & Governance

### A. Branch Protection Ruleset
- **Ruleset ID**: `26347106` enforced on `main`.
- **Enforced Status Checks** (8 mandatory jobs):
  1. `ci/build (Node 22)`
  2. `ci/build (Node 24)`
  3. `ci/build (Node 26)`
  4. `ci/test (Node 22)`
  5. `ci/test (Node 24)`
  6. `ci/test (Node 26)`
  7. `ci/lint`
  8. `ci/typecheck`
- **Linear Git History**: Enforced (`squash` or `rebase` merges).
- **Block Force Pushes**: Active.
- **Block Branch Deletion**: Active.

### B. OpenSSF Metrics (Distinction & Integrity)
- **OpenSSF Scorecard**:
  - *Definition*: Automated analysis of GitHub repository supply chain security practices (branch protection, pinned dependencies, license, code review).
  - *Status*: `[PENDING VERIFICATION]` (Can be generated via GitHub Action `ossf/scorecard-action` after public visibility).
- **OpenSSF Criticality Score**:
  - *Definition*: Algorithmic score (0.0 to 1.0) assessing whether a project is critical infrastructure for the global open-source ecosystem, based on age, dependency usage, commit cadence, and contributor diversity.
  - *Status*: `[NOT YET AVAILABLE]` (New and unreleased projects naturally have a low criticality score; never fabricate or artificially inflate).

---

## 7. Claude for Open Source (Anthropic) Evidence Criteria

When compiling an application for the [Claude for Open Source Program](https://claude.com/contact-sales/claude-for-oss) ([Terms](https://www.anthropic.com/claude-for-oss-terms)):

| Program Criterion | Current EnvGuard Status | Maintainer Evidence / Notes |
| :--- | :--- | :--- |
| **Active Open-Source Project** | `[VERIFIED FACT]` | Open-source MIT repository with active commit cadence, comprehensive test coverage, and transparent architecture. |
| **Real Developer Utility** | `[VERIFIED FACT]` | Provides automated environment validation, multi-platform readiness auditing, and portable AI agent skills. |
| **Public Verifiable History** | `[VERIFIED FACT]` | All PRs pass mandatory 8-check CI rulesets and include detailed audit rationale. |
| **External Dependency Ecosystem** | `[NOT YET AVAILABLE]` | Dependents and download metrics will be gathered once public npm release is authorized. |
| **Discretionary Approval Readiness** | `[FUTURE GOAL]` | Maintainer will assemble this evidence ledger along with reproducible demonstration videos and live benchmark reports when ready to apply. |

---

## 8. Maintainer Verification Checklist Prior to Release

- [ ] All unit and integration test suites pass on Node 22, 24, and 26.
- [ ] Layer A Core contains zero runtime dependencies.
- [ ] Core package tarball contains only `dist/`, `README.md`, `LICENSE`, `package.json`.
- [ ] All skills pass `npm run skills:verify` with full synchronization across `.agents/skills/`.
- [ ] Mobile and backend adapters produce deterministic findings without fabricated results.
- [ ] Static analysis tools do not execute untrusted commands without container isolation or explicit user consent.
- [ ] All sensitive tokens, private keys, and passwords are fully redacted in report outputs.
- [ ] Public PRs have passed all 8 ruleset checks before squash-merging to `main`.
