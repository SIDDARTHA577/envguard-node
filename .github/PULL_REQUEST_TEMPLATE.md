## Summary of Changes

A clear, concise summary of the motivation, changes, and user-facing impact.

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Security hardening or test coverage expansion
- [ ] Documentation or examples update
- [ ] Breaking change (fix or feature causing existing functionality to not work as expected)

## Security & Privacy Verification

- [ ] **Value Redaction in Built-In Output**: Confirmed no raw secret values appear in test outputs, error strings, snapshots, or logs.
- [ ] **No Secrets in Commits**: Verified that no real tokens, credentials, or private `.env` files are in this pull request.
- [ ] **No Telemetry / Offline Execution**: Preserved 100% offline, local standard library execution.

## Testing & Quality Checklist

- [ ] `npm run typecheck` passes with zero TypeScript errors.
- [ ] `npm run lint` passes with zero ESLint warnings/errors.
- [ ] `npm test` passes all tests.
- [ ] `npm run test:pack` passes consumer installation and smoke checks.
- [ ] Added regression unit/integration tests covering new or modified behavior.

