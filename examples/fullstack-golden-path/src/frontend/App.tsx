import { React, useState, useEffect, useCallback, type FC } from './react-compat.js';
import { ApiClient } from './services/api-client.js';
import { TaskForm } from './components/TaskForm.js';
import { TaskList } from './components/TaskList.js';
import { TaskDetail } from './components/TaskDetail.js';
import type { Task, CreateTaskInput, TaskStatus } from '../shared/types.js';

interface AppProps {
  apiClient?: ApiClient;
}

export const App: FC<AppProps> = ({ apiClient = new ApiClient() }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const statusParam = filter === 'all' ? undefined : filter;
    const res = await apiClient.listTasks(statusParam);

    if (res.success && res.data) {
      setTasks(res.data);
    } else {
      setError(res.error?.message || 'Failed to load tasks');
    }
    setLoading(false);
  }, [apiClient, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (input: CreateTaskInput) => {
    setSubmitting(true);
    const res = await apiClient.createTask(input);
    setSubmitting(false);

    if (res.success && res.data) {
      setTasks((prev) => [res.data!, ...prev]);
      return true;
    }
    return false;
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    const res = await apiClient.updateTask(task.id, { status: nextStatus });

    if (res.success && res.data) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? res.data! : t)));
      if (selectedTask?.id === task.id) {
        setSelectedTask(res.data);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const res = await apiClient.deleteTask(id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTask?.id === id) {
        setSelectedTask(null);
      }
    }
  };

  return {
    type: 'main',
    props: {
      className: 'app-container',
      children: [
        {
          type: 'header',
          props: {
            className: 'app-header',
            children: [
              { type: 'h1', props: { children: 'EnvGuard Full-Stack Task Manager' } },
              {
                type: 'p',
                props: {
                  children: 'Demonstrating end-to-end integration with runtime configuration validation',
                },
              },
            ],
          },
        },
        TaskForm({ onSubmit: handleCreate, loading: submitting }),
        TaskList({
          tasks,
          loading,
          error,
          onRetry: fetchTasks,
          onSelectTask: setSelectedTask,
          onToggleStatus: handleToggleStatus,
        }),
        TaskDetail({
          task: selectedTask,
          onClose: () => setSelectedTask(null),
          onDelete: handleDelete,
        }),
      ],
    },
  };
};
