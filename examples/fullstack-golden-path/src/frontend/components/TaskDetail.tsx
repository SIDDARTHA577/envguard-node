import { React, type FC } from '../react-compat.js';
import type { Task } from '../../shared/types.js';

interface TaskDetailProps {
  task: Task | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const TaskDetail: FC<TaskDetailProps> = ({ task, onClose, onDelete }) => {
  if (!task) return null;

  return {
    type: 'div',
    props: {
      className: 'task-detail-modal',
      role: 'dialog',
      'aria-labelledby': 'detail-title',
      children: [
        {
          type: 'div',
          props: {
            className: 'modal-content',
            children: [
              { type: 'h3', props: { id: 'detail-title', children: task.title } },
              { type: 'p', props: { children: `Status: ${task.status}` } },
              { type: 'p', props: { children: `Priority: ${task.priority}` } },
              task.description ? { type: 'p', props: { children: `Description: ${task.description}` } } : null,
              {
                type: 'button',
                props: { className: 'btn-danger', onClick: () => onDelete(task.id), children: 'Delete Task' },
              },
              {
                type: 'button',
                props: { className: 'btn-secondary', onClick: onClose, children: 'Close' },
              },
            ],
          },
        },
      ],
    },
  };
};
