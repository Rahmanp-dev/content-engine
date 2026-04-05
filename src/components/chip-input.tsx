'use client';

import { useCallback, type KeyboardEvent } from 'react';

interface ChipInputProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  prefix?: string;
  noun: string;
}

export default function ChipInput({ label, items, onChange, placeholder, prefix = '', noun }: ChipInputProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      const raw = e.currentTarget.value.trim().replace(/^@/, '');
      if (!raw || items.includes(raw)) return;
      onChange([...items, raw]);
      e.currentTarget.value = '';
    },
    [items, onChange],
  );

  const remove = useCallback(
    (val: string) => onChange(items.filter((x) => x !== val)),
    [items, onChange],
  );

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title" style={{ fontFamily: 'var(--mono)' }}>{label}</span>
        <span className="card-count" style={{ fontFamily: 'var(--mono)' }}>
          {items.length} {noun}{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="chips-wrap">
        {items.length === 0 ? (
          <span className="empty-hint" style={{ fontFamily: 'var(--mono)' }}>No {noun}s added yet</span>
        ) : (
          items.map((v) => (
            <div key={v} className="chip" style={{ fontFamily: 'var(--mono)' }}>
              <span>{prefix}{v}</span>
              <button className="chip-x" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <input
        className="chip-inp"
        style={{ fontFamily: 'var(--mono)' }}
        type="text"
        placeholder={placeholder}
        onKeyDown={handleKey}
      />
      <div className="inp-hint" style={{ fontFamily: 'var(--mono)' }}>Press Enter to add</div>
    </div>
  );
}
