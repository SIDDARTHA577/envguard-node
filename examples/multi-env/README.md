# Multi-Environment Schema Architecture

In modern production systems, local development and production environments have differing constraints:
- Local development might accept unencrypted `http://` URLs or weak dummy keys.
- Production requires strict `https://` protocols, high entropy keys (e.g. 64+ characters), and explicit credentials.

This example illustrates how to compose an EnvGuard base schema with environment-specific overrides cleanly.

---

## Pattern

```typescript
import { guard, s, defineSchema } from 'envguard-node';

const baseSchema = {
  PORT: s.port().default(3000),
  SERVICE_NAME: s.string().default('billing-service'),
};

export const developmentSchema = defineSchema({
  ...baseSchema,
  DATABASE_URL: s.url().default('postgres://localhost:5432/dev_db'),
  JWT_SECRET: s.string().default('local_dev_secret_only'),
});

export const productionSchema = defineSchema({
  ...baseSchema,
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] }).sensitive().required(),
  JWT_SECRET: s.string({ min: 64 }).sensitive().required(),
});

// Select schema based on execution target
const schema = process.env.NODE_ENV === 'production' ? productionSchema : developmentSchema;
export const config = guard(schema).data;
```
