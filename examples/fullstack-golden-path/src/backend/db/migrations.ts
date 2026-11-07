export interface Migration {
  id: string;
  name: string;
  up: (db: unknown) => void;
  down: (db: unknown) => void;
}

export const migrations: Migration[] = [
  {
    id: '001',
    name: 'create_tasks_table',
    up: (db: any) => {
      db.createTable('tasks', {
        id: { type: 'string', primaryKey: true },
        title: { type: 'string', nullable: false },
        description: { type: 'string', nullable: false, default: '' },
        status: { type: 'string', nullable: false, default: 'pending' },
        priority: { type: 'string', nullable: false, default: 'medium' },
        createdAt: { type: 'string', nullable: false },
        updatedAt: { type: 'string', nullable: false },
      });
      db.createIndex('tasks', 'idx_tasks_status', ['status']);
      db.createIndex('tasks', 'idx_tasks_priority', ['priority']);
    },
    down: (db: any) => {
      db.dropTable('tasks');
    },
  },
];
