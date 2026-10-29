# Docker Container Runtime Configuration Validation

This example demonstrates how to run `envguard check` in a container entrypoint to prevent faulty containers from starting in Kubernetes, AWS ECS, or Docker Compose.

## Key Security Practices

1. **Never copy `.env` files into Docker images**:
   - The `.dockerignore` file in this directory excludes `.env`, `.env.*`, and credentials from being baked into container layers.
2. **Pre-flight container check**:
   - The entrypoint executes `npx envguard check` against the container's injected environment.
   - If a required secret (e.g. database URL or Stripe API key) is missing from the Kubernetes Secret / Task Definition, the container terminates immediately with exit code `1`, causing the orchestrator to halt deployment before sending traffic to the pod.

---

## Testing Locally

```bash
# Build the container image
docker build -t envguard-docker-example .

# Run without required environment (fails fast with exit code 1)
docker run --rm envguard-docker-example

# Run with valid environment (passes pre-flight check and starts service)
docker run --rm \
  -e PORT=8080 \
  -e DATABASE_URL=postgres://user:pass@db:5432/app \
  -e APP_SECRET=secret_key_minimum_32_chars_length_ok \
  envguard-docker-example
```
