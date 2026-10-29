---
name: envguard-review
description: Reviews environment variable and secret handling in a project for common security vulnerabilities (e.g. unvalidated variables, console.log leaks, missing .gitignore rules, and unmasked error outputs).
---

# `envguard-review` Skill

Use this skill to conduct a focused security review of how environment configuration is managed and handled within an application.

## Security Scope & Limitations

> [!NOTE]
> This review focuses on configuration hygiene, secret redaction, and environment validation. It does **not** replace a comprehensive third-party application penetration test or SOC2 compliance audit.

---

## Review Checklist

### 1. `.gitignore` & `.dockerignore` Integrity
- Ensure `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, and `*.local` are explicitly ignored.
- In Docker projects, ensure `.dockerignore` prevents accidental inclusion of local secret files into image layers.

### 2. Leaky Logging & Assertion Inspection
- Search for dangerous logging calls such as `console.log(process.env)`, `logger.info(req.body)`, or custom exception classes echoing raw environment variables.
- Ensure all variable validation errors leverage EnvGuard's zero-secret-leakage architecture.

### 3. Startup Fail-Fast Validation
- Verify that required secrets (e.g. database URLs, JWT signing keys, payment gateway tokens) are validated at boot time rather than accessed lazily during HTTP request processing.

### 4. Classification & Sensitivity
- Check whether secrets are explicitly tagged with `.sensitive()` in the EnvGuard schema for documentation and auditing purposes.

---

## Reporting Findings

Categorize all findings into:
1. **Critical Vulnerabilities**: e.g. committed `.env` files with real keys, unmasked console logging of secrets.
2. **Missing Hardening**: e.g. optional variables lacking defaults, unconstrained port numbers.
3. **Recommended Improvements**: e.g. adding `.dockerignore`, adding protocol validation to connection strings.
