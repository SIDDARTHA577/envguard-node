import { guard, s } from 'envguard-node';

// Define the expected configuration shape
const appSchema = {
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  PORT: s.port().default(3000),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] })
    .sensitive()
    .describe('PostgreSQL connection string'),
  API_KEY: s.string({ min: 16 })
    .sensitive()
    .describe('External service API key'),
  ENABLE_ANALYTICS: s.boolean().default(false),
};

// Validate environment explicitly or fall back to process.env
const result = guard(appSchema);

if (!result.success) {
  console.error('Configuration validation failed! Fix errors before startup:');
  for (const err of result.errors) {
    console.error(` - [${err.issue}] ${err.key}: ${err.message}`);
  }
  process.exit(1);
}

// Inferred types are strictly typed
const config = result.data;
console.log(`Application started in ${config.NODE_ENV} mode.`);
console.log(`Listening on port ${config.PORT}`);
console.log(`Analytics enabled: ${config.ENABLE_ANALYTICS}`);
// Secret values were validated without being printed or leaked

