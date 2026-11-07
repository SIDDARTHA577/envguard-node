import React, { useEffect, useRef, type FC, type FormEvent } from 'react';

interface AccessibleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}

export const AccessibleDialog: FC<AccessibleDialogProps> = ({ isOpen, onClose, onSubmit }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = inputRef.current?.value.trim();
    if (val) onSubmit(val);
  };

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      className="p-6 rounded-lg shadow-xl bg-white text-slate-900 border border-slate-300"
    >
      <h2 id="dialog-title" className="text-xl font-bold mb-4">
        Create New Task
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="task-title-input" className="block text-sm font-medium text-slate-800 mb-1">
            Task Title <span aria-hidden="true">*</span>
          </label>
          <input
            id="task-title-input"
            ref={inputRef}
            type="text"
            required
            aria-required="true"
            aria-describedby="title-hint"
            className="w-full px-3 py-2 border border-slate-300 rounded focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
          />
          <p id="title-hint" className="text-xs text-slate-600 mt-1">
            Provide a concise, descriptive title for the task.
          </p>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-400 rounded text-slate-800 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 focus-visible:outline-none"
          >
            Save Task
          </button>
        </div>
      </form>
    </dialog>
  );
};

