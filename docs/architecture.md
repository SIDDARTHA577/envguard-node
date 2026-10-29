# EnvGuard Architecture and Design Principles

## Overview

EnvGuard is designed with four foundational principles:

1. **Zero Secret Leakage by Design**:
   - Diagnostic tools must never become attack vectors.
   - Standard logging libraries and assertion packages often echo evaluated values when formatting errors (`Expected 3000, received "super_secret_db_pass"`).
   - EnvGuard's validator and reporter architecture separates the *validation outcome* from the *underlying value*. Error objects only track variable keys, types, issues, and expectations. Actual values are never retained in error objects, exception messages, terminal strings, or serialized reports.

2. **Deterministic Evaluation & No Hidden State**:
   - In programmatic usage, when an environment dictionary `env` is supplied, EnvGuard evaluates strictly against that dictionary without secretly reading `process.env`.
   - In fallback mode (`process.env`), the behavior is explicitly documented.

3. **Safe Parsing (Zero `eval` / Zero Shell Spawning)**:
   - EnvGuard's `.env` parser reads files line-by-line using a pure JavaScript state machine.
   - It does not invoke bash, does not evaluate `$(...)` or backticks, and does not run arbitrary command substitutions.
   - Static `.json` configuration schemas allow zero-code declarative validation in production containers without requiring a compiler or dynamic module evaluation.

4. **Zero Runtime Dependencies**:
   - EnvGuard depends solely on native Node.js standard library modules (`node:fs`, `node:path`, `node:url`).
   - This eliminates supply-chain risks, ensures lightweight installs, and guarantees rapid execution in CI/CD environments.
