import type { Task, CreateTaskInput, UpdateTaskInput, ApiResponse, TaskStatus } from '../../shared/types.js';
import type { App } from '../../backend/mini-express.js';

export class ApiClient {
  constructor(private target: string | App = 'http://localhost:3001') {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      if (typeof this.target !== 'string') {
        const injectRes = await this.target.inject({
          method: options.method || 'GET',
          url: path,
          headers: (options.headers as Record<string, string>) || {},
          body: options.body ? JSON.parse(options.body as string) : null,
        });

        return injectRes.body as ApiResponse<T>;
      }

      const res = await fetch(`${this.target}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });

      const data = (await res.json()) as ApiResponse<T>;
      return data;
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Failed to connect to backend service',
        },
      };
    }
  }

  async checkHealth() {
    return this.request<{ status: string; uptime: number; timestamp: string }>('/health');
  }

  async listTasks(status?: TaskStatus) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<Task[]>(`/api/tasks${query}`);
  }

  async getTask(id: string) {
    return this.request<Task>(`/api/tasks/${encodeURIComponent(id)}`);
  }

  async createTask(input: CreateTaskInput) {
    return this.request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateTask(id: string, updates: UpdateTaskInput) {
    return this.request<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(id: string) {
    return this.request<{ id: string }>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}
