import { express } from './mini-express.js';
import { taskRouter } from './routes/task-routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { loadConfig } from './config/env.js';
import type { ApiResponse } from '../shared/types.js';

export function createApp(env = process.env) {
  const config = loadConfig(env);
  const app = express();

  app.use(express.json());

  // CORS middleware restricting allowed origin
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    const response: ApiResponse<{ status: string; uptime: number; timestamp: string }> = {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    };
    res.json(response);
  });

  // Domain API routes
  app.use('/api/tasks', taskRouter);

  // Centralized structured error handler
  app.use(errorHandler);

  return { app, config };
}
