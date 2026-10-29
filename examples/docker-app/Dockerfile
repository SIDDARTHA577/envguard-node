# Multi-stage production container build
FROM node:20-alpine AS runner

WORKDIR /app

# Ensure security non-root user
USER node

COPY --chown=node:node package.json ./
COPY --chown=node:node envguard.config.json ./
COPY --chown=node:node index.mjs ./

# Run envguard pre-flight check before booting Node application
CMD ["sh", "-c", "npx envguard check --schema envguard.config.json && node index.mjs"]
