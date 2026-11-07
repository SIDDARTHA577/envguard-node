import { describe, it, expect } from 'vitest';
import { createApp } from '../src/backend/app.js';
import { ApiClient } from '../src/frontend/services/api-client.js';

describe('Full-Stack End-to-End Golden Path Integration', () => {
  const env = {
    NODE_ENV: 'test',
    PORT: '3001',
    DATABASE_URL: 'sqlite:///fullstack-integration.db',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('runs complete lifecycle: API health, task creation, status update, and query', async () => {
    const { app } = createApp(env);
    const client = new ApiClient(app);

    // 1. Health check
    const health = await client.checkHealth();
    expect(health.success).toBe(true);
    expect(health.data?.status).toBe('healthy');

    // 2. Create task via frontend ApiClient
    const createRes = await client.createTask({
      title: 'Fullstack End-to-End Integration Task',
      description: 'Verifying React client communication with Express backend',
      priority: 'high',
    });

    expect(createRes.success).toBe(true);
    expect(createRes.data).toBeDefined();
    const task = createRes.data!;
    expect(task.title).toBe('Fullstack End-to-End Integration Task');
    expect(task.status).toBe('pending');

    // 3. List tasks and verify created task appears
    const listRes = await client.listTasks();
    expect(listRes.success).toBe(true);
    const found = listRes.data?.find((t) => t.id === task.id);
    expect(found).toBeDefined();

    // 4. Update task status to completed
    const updateRes = await client.updateTask(task.id, { status: 'completed' });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data?.status).toBe('completed');

    // 5. Query specifically by completed status filter
    const completedList = await client.listTasks('completed');
    expect(completedList.success).toBe(true);
    expect(completedList.data?.some((t) => t.id === task.id)).toBe(true);

    // 6. Delete task
    const delRes = await client.deleteTask(task.id);
    expect(delRes.success).toBe(true);

    // 7. Verify deletion
    const finalDetail = await client.getTask(task.id);
    expect(finalDetail.success).toBe(false);
    expect(finalDetail.error?.code).toBe('NOT_FOUND');
  });

  it('verifies client data models never expose backend database secrets or connection URLs', async () => {
    const { app } = createApp(env);
    const client = new ApiClient(app);

    const createRes = await client.createTask({ title: 'Security Check Task' });
    expect(createRes.success).toBe(true);
    const task: any = createRes.data;

    // The returned object must not leak database connection or internal env
    expect(task.DATABASE_URL).toBeUndefined();
    expect(task.connectionString).toBeUndefined();
    expect(JSON.stringify(task)).not.toContain('sqlite:///');
  });
});
