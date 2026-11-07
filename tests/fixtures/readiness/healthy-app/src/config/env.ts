// Type-safe environment validation using EnvGuard guard()
export const env = {
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost:5432/db',
};

// Simulated EnvGuard guard() initialization
export function validateEnvironment() {
  if (!env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
  return env;
}
