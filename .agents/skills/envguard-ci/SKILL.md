---
name: envguard-ci
description: Integrates EnvGuard validation checks into CI/CD pipelines (GitHub Actions, GitLab CI, Docker entrypoints) to catch configuration drift and missing deployment secrets before shipping code.
---

# `envguard-ci` Skill

Use this skill to integrate EnvGuard validation into automated CI/CD deployment pipelines.

## Safety & Security Constraints

1. **Least-Privilege Permissions**:
   - Use `permissions: contents: read` in GitHub Actions workflows.
2. **Deterministic Exit Codes**:
   - Ensure the CI step returns exit code `1` on validation failure and `0` on success.
3. **No Secret Printing in CI Logs**:
   - Do NOT run commands that echo decrypted repository secrets into workflow logs.

---

## Workflow Implementation

### GitHub Actions Integration

Add an automated validation step in `.github/workflows/ci.yml`:

```yaml
- name: Validate Environment Schema
  run: npx envguard check --schema ./envguard.config.json --env-file .env.example
```

For production deployment workflows:
```yaml
- name: Verify Production Secrets Shape
  run: npx envguard check --schema ./envguard.config.json
  env:
    DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
    API_KEY: ${{ secrets.PROD_API_KEY }}
    PORT: 8080
    NODE_ENV: production
```

### Docker Pre-Flight Entrypoint

In Dockerfiles, run the validation check before executing the server binary:

```dockerfile
CMD ["sh", "-c", "npx envguard check --schema envguard.config.json && node dist/index.js"]
```

