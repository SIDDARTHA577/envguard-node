import fs from 'node:fs';
import path from 'node:path';

export interface InitOptions {
  cwd?: string;
  type?: 'json' | 'js';
  force?: boolean;
}

const STARTER_JSON_CONFIG = {
  schema: {
    NODE_ENV: {
      type: 'enum',
      values: ['development', 'production', 'test'],
      default: 'development',
      description: 'Application environment mode',
    },
    PORT: {
      type: 'port',
      default: 3000,
      description: 'HTTP server listening port',
    },
    DATABASE_URL: {
      type: 'url',
      required: true,
      sensitive: true,
      description: 'Database connection connection URL',
    },
    API_KEY: {
      type: 'string',
      required: true,
      sensitive: true,
      min: 16,
      description: 'Third-party API key for external service',
    },
  },
};

const STARTER_JS_CONFIG = `import { s, defineSchema } from 'envguard-node';

export default defineSchema({
  NODE_ENV: s.enum(['development', 'production', 'test']).default('development'),
  PORT: s.port().default(3000),
  DATABASE_URL: s.url().sensitive().describe('Database connection URL'),
  API_KEY: s.string({ min: 16 }).sensitive().describe('Third-party API key'),
});
`;

const STARTER_ENV_EXAMPLE = `# Example Environment Configuration
# Copy this file to .env and fill in your actual values locally.
# NEVER commit your actual .env file or real secrets to Git.

NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/my_database
API_KEY=placeholder_api_key_min_16_chars_long
`;

export function executeInit(options: InitOptions = {}): { created: string[]; skipped: string[] } {
  const cwd = options.cwd || process.cwd();
  const format = options.type || 'json';
  const force = !!options.force;

  const configFile = format === 'js' ? 'envguard.config.js' : 'envguard.config.json';
  const configPath = path.resolve(cwd, configFile);
  const envExamplePath = path.resolve(cwd, '.env.example');

  const created: string[] = [];
  const skipped: string[] = [];

  // 1. Config file
  if (fs.existsSync(configPath) && !force) {
    skipped.push(`${configFile} (already exists, use --force to overwrite)`);
  } else {
    const content = format === 'js' ? STARTER_JS_CONFIG : JSON.stringify(STARTER_JSON_CONFIG, null, 2) + '\n';
    fs.writeFileSync(configPath, content, 'utf8');
    created.push(configFile);
  }

  // 2. .env.example
  if (fs.existsSync(envExamplePath) && !force) {
    skipped.push('.env.example (already exists, use --force to overwrite)');
  } else {
    fs.writeFileSync(envExamplePath, STARTER_ENV_EXAMPLE, 'utf8');
    created.push('.env.example');
  }

  return { created, skipped };
}

