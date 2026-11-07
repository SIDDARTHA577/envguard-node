import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../src/backend/db/database.js';
import { migrations } from '../src/backend/db/migrations.js';

describe('Database Persistence, Migrations & Transactions', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database();
  });

  it('applies schema migrations cleanly', () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const m of migrations) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      m.up(db);
    }
  });

  it('enforces title constraints on insertion and updates', () => {
    expect(() => {
      db.insertTask({ title: '' });
    }).toThrow(/title is required/);

    expect(() => {
      db.insertTask({ title: '   ' });
    }).toThrow(/title is required/);

    const task = db.insertTask({ title: 'Valid Task' });
    expect(() => {
      db.updateTask(task.id, { title: '' });
    }).toThrow(/title cannot be empty/);
  });

  it('guarantees ACID transactions with successful commits', () => {
    db.beginTransaction();
    const task = db.insertTask({ title: 'Transactional Task' });
    expect(db.getTask(task.id)).not.toBeNull();
    db.commit();

    // Persisted after commit
    expect(db.getTask(task.id)?.title).toBe('Transactional Task');
  });

  it('guarantees ACID transactions with safe rollback on error', () => {
    const initialCount = db.listTasks().length;

    db.beginTransaction();
    const task = db.insertTask({ title: 'Doomed Task' });
    expect(db.getTask(task.id)).not.toBeNull();

    // Rollback transaction
    db.rollback();

    // Must be restored to state before transaction
    expect(db.getTask(task.id)).toBeNull();
    expect(db.listTasks().length).toBe(initialCount);
  });

  it('seeds synthetic data without real credentials or PII', () => {
    db.seedSyntheticData();
    const tasks = db.listTasks();
    expect(tasks.length).toBe(3);

    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(task.priority);
      // Ensure synthetic data contains no real secrets
      expect(task.description).not.toMatch(/ghp_|sk_live_|password123/);
    }
  });
});
