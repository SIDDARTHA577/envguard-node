import { guard, s } from '../../../../../src/index.js';

export function loadConfig(env = process.env) {
  return guard({
    NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
    PORT: s.port().default(3001),
    DATABASE_URL: s.url().sensitive(),
    CORS_ORIGIN: s.string().default('http://localhost:5173'),
    LOG_LEVEL: s.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }, env, { throwOnError: true }).data;
}
