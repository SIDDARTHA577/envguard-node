import { React, useState, type FC, type FormEvent } from '../react-compat.js';
import type { CreateTaskInput, TaskPriority } from '../../shared/types.js';

interface TaskFormProps {
  onSubmit: (input: CreateTaskInput) => Promise<boolean>;
  loading?: boolean;
}

export const TaskForm: FC<TaskFormProps> = ({ onSubmit, loading = false }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }
    setError(null);

    const success = await onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
    });

    if (success) {
      setTitle('');
      setDescription('');
      setPriority('medium');
    }
  };

  return {
    type: 'form',
    props: {
      onSubmit: handleSubmit,
      className: 'task-form',
      'aria-label': 'Create Task Form',
      children: [
        { type: 'h3', props: { children: 'Create New Task' } },
        error ? { type: 'div', props: { role: 'alert', className: 'error-banner', children: error } } : null,
        {
          type: 'div',
          props: {
            className: 'form-group',
            children: [
              { type: 'label', props: { htmlFor: 'task-title', children: 'Title *' } },
              {
                type: 'input',
                props: {
                  id: 'task-title',
                  type: 'text',
                  value: title,
                  placeholder: 'e.g. Implement EnvGuard in production',
                  disabled: loading,
                  'aria-required': 'true',
                },
              },
            ],
          },
        },
        {
          type: 'button',
          props: {
            type: 'submit',
            disabled: loading,
            className: 'btn-primary',
            children: loading ? 'Submitting...' : 'Add Task',
          },
        },
      ],
    },
  };
};
