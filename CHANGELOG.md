# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-29

### Added
- **Core Schema Engine**: Built-in validators for `string`, `number`, `integer`, `boolean`, `url`, `port`, `enum`, and safe `custom` functions.
- **Zero-Secret-Leakage Architecture**: Variable values are strictly discarded from error objects, terminal reports, exception messages, and JSON reports.
- **Dual ESM & CommonJS Build**: Seamless out-of-the-box support for both ESM (`import`) and CommonJS (`require`).
- **Hardened .env Parser**: Strip UTF-8 BOM, enforce 5MB max size limit, support multi-line strings, escape sequences, duplicate key detection, and prototype-pollution rejection.
- **Prototype-Pollution Protection**: Defense-in-depth rejection of `__proto__`, `constructor`, and `prototype` keys during schema ingestion and JSON loading.
- **CLI Commands**: `envguard check` (with `--schema`, `--env-file`, `--format json`, `--strict`) and safe `envguard init` with deterministic exit codes (`0`, `1`, `2`).
- **AI Coding Agent Skills**: Original skills (`envguard-audit`, `envguard-setup`, `envguard-review`, `envguard-ci`, `envguard-migrate`) with Antigravity, Claude Code, and Codex manifests.
- **Supply-Chain & Security Hardening**: Pinned GitHub Actions commit SHAs, CodeQL security analysis, Dependabot weekly updates, issue/PR templates, `.editorconfig`, and `.gitattributes`.
- **Comprehensive Test Suite**: 61 automated tests covering validators, CLI argument handling, exit codes, hostile input, secret redaction, and manifest drift prevention.
- **Real-World Examples**: Fully runnable examples for standard apps, Express servers, Docker containers with pre-flight checks, and multi-environment configurations.
- **Documentation**: Exhaustive README, API reference, CLI reference, Architecture guide, Roadmap, Adoption guide, and Engineering audit.
