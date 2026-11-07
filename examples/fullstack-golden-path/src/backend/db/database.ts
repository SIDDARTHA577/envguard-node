import crypto from 'node:crypto';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../../shared/types.js';

export class Database {
  private tables: Map<string, Map<string, any>> = new Map();
  private indexes: Map<string, Map<string, Set<string>>> = new Map();
  private inTransaction = false;
  private transactionSnapshot: Map<string, Map<string, any>> | null = null;

  constructor() {
    this.tables.set('tasks', new Map());
    this.indexes.set('tasks:status', new Map());
    this.indexes.set('tasks:priority', new Map());
  }

  createTable(name: string) {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map());
    }
  }

  createIndex(table: string, indexName: string, fields: string[]) {
    const key = `${table}:${fields.join('_')}`;
    if (!this.indexes.has(key)) {
      this.indexes.set(key, new Map());
    }
  }

  beginTransaction() {
    if (this.inTransaction) {
      throw new Error('Nested transactions are not supported.');
    }
    this.inTransaction = true;
    // Deep clone snapshot for rollback
    this.transactionSnapshot = new Map();
    for (const [tName, tMap] of this.tables.entries()) {
      const clonedRows = new Map();
      for (const [rId, rVal] of tMap.entries()) {
        clonedRows.set(rId, { ...rVal });
      }
      this.transactionSnapshot.set(tName, clonedRows);
    }
  }

  commit() {
    if (!this.inTransaction) {
      throw new Error('Cannot commit outside of transaction.');
    }
    this.inTransaction = false;
    this.transactionSnapshot = null;
  }

  rollback() {
    if (!this.inTransaction || !this.transactionSnapshot) {
      throw new Error('Cannot rollback outside of transaction.');
    }
    this.tables = this.transactionSnapshot;
    this.inTransaction = false;
    this.transactionSnapshot = null;
  }

  insertTask(input: CreateTaskInput): Task {
    if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new Error('Validation failed: title is required and cannot be empty.');
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      description: input.description?.trim() || '',
      status: 'pending',
      priority: input.priority || 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const table = this.tables.get('tasks')!;
    table.set(task.id, task);

    return { ...task };
  }

  getTask(id: string): Task | null {
    const task = this.tables.get('tasks')?.get(id);
    return task ? { ...task } : null;
  }

  listTasks(filter?: { status?: TaskStatus }): Task[] {
    const table = this.tables.get('tasks')!;
    const tasks: Task[] = [];
    for (const task of table.values()) {
      if (!filter?.status || task.status === filter.status) {
        tasks.push({ ...task });
      }
    }
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateTask(id: string, updates: UpdateTaskInput): Task | null {
    const table = this.tables.get('tasks')!;
    const existing = table.get(id);
    if (!existing) return null;

    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
        throw new Error('Validation failed: title cannot be empty.');
      }
      existing.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      existing.description = updates.description.trim();
    }

    if (updates.status !== undefined) {
      if (!['pending', 'in_progress', 'completed'].includes(updates.status)) {
        throw new Error(`Validation failed: invalid status "${updates.status}".`);
      }
      existing.status = updates.status;
    }

    if (updates.priority !== undefined) {
      if (!['low', 'medium', 'high'].includes(updates.priority)) {
        throw new Error(`Validation failed: invalid priority "${updates.priority}".`);
      }
      existing.priority = updates.priority;
    }

    existing.updatedAt = new Date().toISOString();
    return { ...existing };
  }

  deleteTask(id: string): boolean {
    const table = this.tables.get('tasks')!;
    return table.delete(id);
  }

  seedSyntheticData() {
    this.tables.get('tasks')!.clear();
    this.insertTask({
      title: 'Configure EnvGuard in CI pipeline',
      description: 'Integrate automated schema validation in GitHub Actions',
      priority: 'high',
    });
    this.insertTask({
      title: 'Review database indexes',
      description: 'Verify status and priority indexes for fast list queries',
      priority: 'medium',
    });
    this.insertTask({
      title: 'Audit frontend bundle secrets',
      description: 'Ensure no database connection strings are bundled in client assets',
      priority: 'high',
    });
  }
}

export const db = new Database();
