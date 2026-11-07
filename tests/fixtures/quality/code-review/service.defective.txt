/* eslint-disable @typescript-eslint/no-explicit-any */
// DEFECTIVE IMPLEMENTATION FOR CODE REVIEW EVALUATION

// Defect 1: Unbounded global cache leading to memory leak
export const globalCache: Record<string, any> = {};

// Defect 2: ReDoS vulnerable regex with nested quantifiers
export const EMAIL_REGEX = /^([a-zA-Z0-9]+)+@([a-zA-Z0-9]+)+$/;

export class UnsafeTaskService {
  // Defect 3: SQL Injection via direct string interpolation
  async findTaskUnsafe(id: string, db: any) {
    const query = "SELECT * FROM tasks WHERE id = '" + id + "'";
    return db.raw(query);
  }

  // Defect 4: Unhandled promise rejection / silent failure
  async processBatch(items: string[]) {
    items.forEach(async (item) => {
      // Async in forEach does not await; errors are lost
      await this.sendNotification(item);
    });
  }

  private async sendNotification(id: string) {
    globalCache[id] = { processedAt: Date.now() };
    if (id === 'error') throw new Error('Uncaught background failure');
  }
}
