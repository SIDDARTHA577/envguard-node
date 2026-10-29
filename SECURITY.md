# Security Policy

## Supported Versions

Only the latest major version receives security updates and vulnerability patches.

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

---

## Core Security Commitments

1. **Zero Secret Exposure**:
   - `EnvGuard` is architecturally designed so that actual secret values are **never** rendered into validation errors, exception messages, terminal output, stack traces, or serialized JSON reports.
   - Error messages state the name of the failing variable and the constraint violated (e.g., missing, invalid port number, invalid URL format), without echoing the received value.

2. **No Telemetry / No Network Requests**:
   - `EnvGuard` runs 100% locally.
   - It performs zero network I/O, does not send telemetry or analytics, and relies strictly on standard local runtime APIs.

3. **Safe Parsing (No `eval` or Unsafe Code Execution)**:
   - Configuration files and `.env` files are parsed via dedicated, deterministic parsers without running arbitrary shell scripts or unsafe runtime `eval`.

4. **Scope and Limitations**:
   - `EnvGuard` validates the *shape, type, and format* of environment variables.
   - It **does not** verify whether an external secret or token is cryptographically valid or compromised against third-party authentication servers.

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential data leak in `EnvGuard`, please report it privately:

1. **Do not create a public issue.**
2. Send an advisory report via GitHub's Private Vulnerability Reporting on this repository:
   [https://github.com/SIDDARTHA577/envguard-node/security/advisories/new](https://github.com/SIDDARTHA577/envguard-node/security/advisories/new)
   or email the maintainer at `190904900+SIDDARTHA577@users.noreply.github.com`.
3. Include:
   - A description of the issue.
   - Reproduction steps or minimal code example (ensuring any sample keys are purely fictional, e.g., `sk_test_placeholder`).
   - The potential impact.
4. You will receive an acknowledgment within 48 hours, followed by updates on triage and mitigation.

