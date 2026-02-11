import React, { useState, useRef, useEffect } from 'react';
import { MAX_LABEL_LENGTH } from '../../utils/waypointLabels';

interface InlineEditableLabelProps {
  value: string;
  onSave: (newLabel: string) => void;
  className?: string;
}

const InlineEditableLabel: React.FC<InlineEditableLabelProps> = ({ value, onSave, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-label-input ${className || ''}`}
        value={draft}
        maxLength={MAX_LABEL_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span className={`inline-label-display ${className || ''}`}>
      <span className="inline-label-text">{value}</span>
      <button
        className="inline-label-edit-btn"
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        title="Rename"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </span>
  );
};

export default InlineEditableLabel;
