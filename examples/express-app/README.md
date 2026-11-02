# Express App Configuration Validation Example

This example demonstrates how to validate configuration during web server startup using EnvGuard.

## Why This Matters

If your application boots with missing configuration, it often fails later during runtime (e.g. when a database query is triggered or a third-party payment API is called).

EnvGuard catches configuration errors **at process startup** before the HTTP server binds to any port, while ensuring that connection strings and tokens are **never echoed into error logs or stdout**.

---

## Running This Example

1. Copy the safe example environment:
   ```bash
   cp .env.example .env
   ```

2. Run the application:
   ```bash
   node server.mjs
   ```

3. Try introducing an invalid port or omitting `DATABASE_URL` in `.env` to observe safe fail-fast behavior.

