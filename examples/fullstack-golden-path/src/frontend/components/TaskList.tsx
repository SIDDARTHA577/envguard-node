import { React, type FC } from '../react-compat.js';
import type { Task } from '../../shared/types.js';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectTask: (task: Task) => void;
  onToggleStatus: (task: Task) => void;
}

export const TaskList: FC<TaskListProps> = ({
  tasks,
  loading,
  error,
  onRetry,
  onSelectTask,
  onToggleStatus,
}) => {
  if (loading) {
    return {
      type: 'div',
      props: {
        className: 'task-list-loading',
        role: 'status',
        'aria-live': 'polite',
        children: 'Loading tasks...',
      },
    };
  }

  if (error) {
    return {
      type: 'div',
      props: {
        className: 'task-list-error',
        role: 'alert',
        children: [
          `Error loading tasks: ${error}`,
          { type: 'button', props: { onClick: onRetry, className: 'btn-secondary', children: 'Retry' } },
        ],
      },
    };
  }

  if (tasks.length === 0) {
    return {
      type: 'div',
      props: {
        className: 'task-list-empty',
        role: 'status',
        children: 'No tasks found. Create your first task above!',
      },
    };
  }

  return {
    type: 'div',
    props: {
      className: 'task-list',
      role: 'region',
      'aria-label': 'Task List',
      children: [
        { type: 'h3', props: { children: `Tasks (${tasks.length})` } },
        {
          type: 'ul',
          props: {
            className: 'task-items',
            children: tasks.map((task) => ({
              type: 'li',
              key: task.id,
              props: {
                className: `task-item priority-${task.priority} status-${task.status}`,
                children: [
                  {
                    type: 'div',
                    props: {
                      className: 'task-summary',
                      onClick: () => onSelectTask(task),
                      children: [task.title, ` [${task.priority}] - ${task.status}`],
                    },
                  },
                  {
                    type: 'button',
                    props: {
                      className: 'btn-toggle',
                      onClick: () => onToggleStatus(task),
                      children: task.status === 'completed' ? 'Mark Pending' : 'Mark Completed',
                    },
                  },
                ],
              },
            })),
          },
        },
      ],
    },
  };
};
