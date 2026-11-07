import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/backend/app.js';
import { db } from '../src/backend/db/database.js';

describe('Backend API & EnvGuard Configuration', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3001',
    DATABASE_URL: 'sqlite:///test.db',
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'info',
  };

  beforeEach(() => {
    db.seedSyntheticData();
  });

  it('fails fast on startup if required environment variables are invalid', () => {
    const invalidEnv = {
      ...validEnv,
      DATABASE_URL: 'not-a-valid-url', // Fails URL validation!
    };

    expect(() => {
      createApp(invalidEnv);
    }).toThrow(/DATABASE_URL/);
  });

  it('successfully boots and exposes healthy GET /health endpoint', async () => {
    const { app } = createApp(validEnv);
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.status).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('healthy');
    expect(typeof json.data.uptime).toBe('number');
  });

  it('handles task creation, listing, updating, and deletion over HTTP', async () => {
    const { app } = createApp(validEnv);

    // 1. Create a task
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: 'Automated CI Test Task',
        description: 'Testing API endpoints',
        priority: 'high',
      },
    });

    expect(createRes.status).toBe(201);
    const createdJson = createRes.json();
    expect(createdJson.success).toBe(true);
    expect(createdJson.data.title).toBe('Automated CI Test Task');
    expect(createdJson.data.status).toBe('pending');
    const taskId = createdJson.data.id;

    // 2. Reject invalid input (empty title)
    const badRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { 'Content-Type': 'application/json' },
      body: { title: '' },
    });
    expect(badRes.status).toBe(400);
    const badJson = badRes.json();
    expect(badJson.success).toBe(false);
    expect(badJson.error.code).toBe('VALIDATION_FAILED');

    // 3. List tasks
    const listRes = await app.inject({ method: 'GET', url: '/api/tasks' });
    expect(listRes.status).toBe(200);
    const listJson = listRes.json();
    expect(listJson.success).toBe(true);
    expect(listJson.data.some((t: any) => t.id === taskId)).toBe(true);

    // 4. Update task status
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: { 'Content-Type': 'application/json' },
      body: { status: 'completed' },
    });
    expect(updateRes.status).toBe(200);
    const updateJson = updateRes.json();
    expect(updateJson.data.status).toBe('completed');

    // 5. Delete task
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}`,
    });
    expect(delRes.status).toBe(200);

    // Verify 404 after deletion
    const notFoundRes = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
    });
    expect(notFoundRes.status).toBe(404);
  });
});
