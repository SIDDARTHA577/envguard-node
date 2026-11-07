import { guard, s } from 'envguard-node';

export function validateEnvironment() {
  return guard(process.env, {
    PORT: s.port().default(3000),
    DATABASE_URL: s.url().required().sensitive(),
    JWT_SECRET: s.string().min(32).required().sensitive(),
  });
}
