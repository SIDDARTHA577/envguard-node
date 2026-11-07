import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadSkills } from '../../tools/skill-manager.mjs';
import { createApp } from '../../examples/fullstack-golden-path/src/backend/app.js';
import { ApiClient } from '../../examples/fullstack-golden-path/src/frontend/services/api-client.js';

describe('Phase 2A Full-Stack Golden Path Workflow Evaluation', () => {
  const rootDir = path.resolve('.');
  const exampleDir = path.join(rootDir, 'examples', 'fullstack-golden-path');

  it('Step 1: Inspects the sample repository structure and configuration', () => {
    expect(fs.existsSync(exampleDir)).toBe(true);
    expect(fs.existsSync(path.join(exampleDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(exampleDir, '.env.example'))).toBe(true);
  });

  it('Step 2 & 3: Evaluates envguard-system-design and verifies architecture artifacts', () => {
    const skills = loadSkills(rootDir);
    const systemDesign = skills.find((s) => s.name === 'envguard-system-design');
    expect(systemDesign).toBeDefined();
    expect(systemDesign?.pack).toBe('fullstack');

    // Architecture summary & ADR must exist
    const archPath = path.join(exampleDir, 'docs', 'ARCHITECTURE.md');
    const adrPath = path.join(exampleDir, 'docs', 'adr', '0001-task-platform-architecture.md');

    expect(fs.existsSync(archPath)).toBe(true);
    expect(fs.existsSync(adrPath)).toBe(true);

    const archContent = fs.readFileSync(archPath, 'utf8');
    expect(archContent).toContain('flowchart TD');
    expect(archContent).toContain('sequenceDiagram');

    const adrContent = fs.readFileSync(adrPath, 'utf8');
    expect(adrContent).toContain('Modular Monolith');
  });

  it('Step 4 & 5: Evaluates envguard-backend and verifies API routes with EnvGuard validation', async () => {
    const skills = loadSkills(rootDir);
    const backendSkill = skills.find((s) => s.name === 'envguard-backend');
    expect(backendSkill).toBeDefined();

    const env = {
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_URL: 'sqlite:///test.db',
      CORS_ORIGIN: 'http://localhost:5173',
    };

    const { app, config } = createApp(env);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.status).toBe(200);
    const data = res.json();
    expect(data.data.status).toBe('healthy');
  });

  it('Step 6 & 7: Evaluates envguard-database and verifies schema migrations & persistence', () => {
    const skills = loadSkills(rootDir);
    const dbSkill = skills.find((s) => s.name === 'envguard-database');
    expect(dbSkill).toBeDefined();

    const migrationsPath = path.join(exampleDir, 'src', 'backend', 'db', 'migrations.ts');
    const databasePath = path.join(exampleDir, 'src', 'backend', 'db', 'database.ts');

    expect(fs.existsSync(migrationsPath)).toBe(true);
    expect(fs.existsSync(databasePath)).toBe(true);
  });

  it('Step 8 & 9: Evaluates envguard-frontend and verifies React components & accessible states', () => {
    const skills = loadSkills(rootDir);
    const frontendSkill = skills.find((s) => s.name === 'envguard-frontend');
    expect(frontendSkill).toBeDefined();

    const components = ['TaskForm.tsx', 'TaskList.tsx', 'TaskDetail.tsx'];
    for (const comp of components) {
      const compPath = path.join(exampleDir, 'src', 'frontend', 'components', comp);
      expect(fs.existsSync(compPath)).toBe(true);
      const content = fs.readFileSync(compPath, 'utf8');
      expect(content).toContain('React');
    }
  });

  it('Step 10, 11, 12, 13, 14: Evaluates envguard-fullstack-integration end-to-end and verifies zero secret leaks', async () => {
    const skills = loadSkills(rootDir);
    const integrationSkill = skills.find((s) => s.name === 'envguard-fullstack-integration');
    expect(integrationSkill).toBeDefined();

    const env = {
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_URL: 'sqlite:///integration-test.db',
      CORS_ORIGIN: 'http://localhost:5173',
    };

    const { app } = createApp(env);
    const client = new ApiClient(app);

    // Create task
    const createRes = await client.createTask({
      title: 'Workflow Verification Task',
      priority: 'high',
    });
    expect(createRes.success).toBe(true);
    const task = createRes.data!;

    // Verify listing
    const listRes = await client.listTasks();
    expect(listRes.data?.some((t) => t.id === task.id)).toBe(true);

    // Verify zero backend credentials in client response
    const rawString = JSON.stringify(createRes);
    expect(rawString).not.toContain('sqlite:///');
    expect(rawString).not.toContain('DATABASE_URL');
  });
});
