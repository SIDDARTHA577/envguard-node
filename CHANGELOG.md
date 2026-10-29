# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-29

### Added
- Core schema definition engine (`string`, `number`, `integer`, `boolean`, `url`, `port`, `enum`, `custom`).
- Type coercion and default value handling with documented precedence.
- Zero secret exposure architecture: variable values are never rendered in error messages, terminal diagnostics, or machine-readable JSON outputs.
- Programmatic API `guard(schema, env?, options?)` with full TypeScript inference.
- CLI binary `envguard` with `check` and `init` commands.
- Support for `terminal` and `json` output formatting.
- Safe `.env` file parser with zero unsafe `eval` execution.
- Cross-platform support for Windows, Linux, and macOS.
- GitHub Actions workflows for continuous integration (matrix testing on Node 18, 20, 22), linting, build verification, and automated vulnerability auditing.
- Extensive test suite covering validators, CLI argument handling, exit codes, edge cases, and secret redaction guarantees.
- Comprehensive documentation: README, SECURITY, CONTRIBUTING, CODE OF CONDUCT, and open source application evidence.
