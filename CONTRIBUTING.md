# Contributing to EnvGuard

Thank you for your interest in contributing to EnvGuard! We welcome contributions that improve code quality, documentation, test coverage, and reliability.

## Code of Conduct

All contributors must adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md). Please report any violations to the project maintainer.

## Development Workflow

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/SIDDARTHA577/envguard-node.git
   cd envguard-node
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests in watch mode:
   ```bash
   npm test
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run linting and typecheck:
   ```bash
   npm run lint
   npm run typecheck
   ```

## Security & Secrets Policy

- **Never** introduce sample secrets, passwords, or production tokens into tests, examples, or documentation. Always use obvious dummy placeholders such as `postgres://user:pass@localhost:5432/mydb` or `placeholder_token_abc`.
- Tests must verify that sensitive values are never revealed in error strings, console messages, or JSON reports.
- Avoid external runtime dependencies unless strictly justified and reviewed.

## Pull Request Guidelines

1. Create a descriptive branch: `feature/short-desc` or `fix/short-desc`.
2. Add or update unit and integration tests for every new feature or bug fix.
3. Ensure all tests pass (`npm test`) and lint checks pass (`npm run lint`).
4. Keep PRs focused on a single change.
5. Provide a clear summary in your PR description explaining the problem, the solution, and test evidence.
