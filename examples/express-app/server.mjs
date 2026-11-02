import http from 'node:http';
import { guard, s } from 'envguard-node';

// 1. Declare schema
const serverSchema = {
  PORT: s.port().default(3000),
  NODE_ENV: s.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: s.url({ protocols: ['postgres:', 'postgresql:'] })
    .sensitive()
    .describe('PostgreSQL connection string'),
  SESSION_SECRET: s.string({ min: 32 })
    .sensitive()
    .describe('Cryptographic cookie signing secret'),
  CORS_ORIGIN: s.string().default('*'),
};

// 2. Validate configuration before doing anything else
const validation = guard(serverSchema);

if (!validation.success) {
  console.error('==================================================');
  console.error('FATAL: Application failed configuration validation:');
  console.error('==================================================');
  for (const err of validation.errors) {
    // Variable name and constraint are displayed; underlying secret is NEVER leaked
    console.error(`- [${err.issue.toUpperCase()}] ${err.key}: ${err.message}`);
  }
  process.exit(1);
}

const config = validation.data;

// 3. Create server using validated, coerced configuration
const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.CORS_ORIGIN,
  });
  res.end(
    JSON.stringify({
      status: 'healthy',
      environment: config.NODE_ENV,
      port: config.PORT,
    })
  );
});

server.listen(config.PORT, () => {
  console.log(`Server started in ${config.NODE_ENV} mode on port ${config.PORT}`);
});

