import { db, Database } from '../db/database.js';
import type { CreateTaskInput, UpdateTaskInput, TaskStatus } from '../../shared/types.js';

export class TaskService {
  constructor(private database: Database = db) {}

  getAll(status?: TaskStatus) {
    return this.database.listTasks(status ? { status } : undefined);
  }

  getById(id: string) {
    const task = this.database.getTask(id);
    if (!task) {
      throw new Error(`Task with id "${id}" not found.`);
    }
    return task;
  }

  create(input: CreateTaskInput) {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }
    return this.database.insertTask(input);
  }

  update(id: string, updates: UpdateTaskInput) {
    const updated = this.database.updateTask(id, updates);
    if (!updated) {
      throw new Error(`Task with id "${id}" not found.`);
    }
    return updated;
  }

  delete(id: string) {
    const success = this.database.deleteTask(id);
    if (!success) {
      throw new Error(`Task with id "${id}" not found.`);
    }
    return true;
  }
}

export const taskService = new TaskService();
