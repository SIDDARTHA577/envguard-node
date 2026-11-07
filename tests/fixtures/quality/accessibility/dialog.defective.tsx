import React, { type FC } from 'react';

// DEFECTIVE COMPONENT WITH SEVERE ACCESSIBILITY VIOLATIONS
export const DefectiveDialog: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    // Defect 1: Div modal without role, aria-modal, or keyboard trap
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-6 rounded" style={{ outline: 'none' }}>
        {/* Defect 2: Low contrast text (#999 on #fff = 2.8:1, fails 4.5:1 requirement) */}
        <p style={{ color: '#999999', fontSize: '14px' }}>Create Task Window</p>

        {/* Defect 3: Input missing any label, id, or aria-label */}
        <input type="text" placeholder="type here..." style={{ outline: 'none' }} />

        {/* Defect 4: Div acting as click button without role="button", tabIndex, or key handler */}
        <div
          onClick={onClose}
          style={{ cursor: 'pointer', background: 'blue', color: 'white', padding: '8px' }}
        >
          Close
        </div>

        {/* Defect 5: Action button hidden from screen readers via aria-hidden */}
        <button aria-hidden="true" onClick={() => alert('Saved')}>
          Submit
        </button>
      </div>
    </div>
  );
};

