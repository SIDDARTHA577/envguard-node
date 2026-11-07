import { validateEnvironment } from './config/env.js';

validateEnvironment();

export function createServer() {
  const routes: Record<string, () => unknown> = {
    '/health': () => ({ status: 'healthy', uptime: process.uptime() }),
    '/api/v1/tasks': () => ({ data: [] }),
  };

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server gracefully');
  });

  return routes;
}
