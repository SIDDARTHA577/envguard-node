export interface TaskItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
}

export class TaskService {
  private cache = new Map<string, { item: TaskItem; expiresAt: number }>();
  private readonly MAX_CACHE_SIZE = 500;
  private readonly TTL_MS = 60_000;

  async getTaskById(id: string, db: { query: (sql: string, params: unknown[]) => Promise<TaskItem[]> }): Promise<TaskItem | null> {
    if (!id || typeof id !== 'string') {
      throw new TypeError('Invalid task ID parameter');
    }

    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.item;
    }

    // Parameterized SQL query preventing injection
    const rows = await db.query('SELECT id, title, status FROM tasks WHERE id = $1 LIMIT 1', [id]);
    if (!rows || rows.length === 0) {
      return null;
    }

    const item = rows[0];
    this.setCache(id, item);
    return item;
  }

  private setCache(id: string, item: TaskItem): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Evict oldest entry to prevent unbounded memory growth
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(id, { item, expiresAt: Date.now() + this.TTL_MS });
  }
}

