'use client';

import { memo } from 'react';

export interface Concept {
  title: string;
  format: string;
  hook: string;
  insight: string;
  structure: string;
  whyWins: string;
}

interface ConceptCardProps {
  concept: Concept;
  index: number;
}

function ConceptCard({ concept, index }: ConceptCardProps) {
  const isSeries = /series/i.test(concept.format);

  const rows = [
    concept.insight   && { label: 'Insight',      val: concept.insight },
    concept.structure && { label: 'Structure',     val: concept.structure },
    concept.whyWins   && { label: 'Why it wins',   val: concept.whyWins },
  ].filter(Boolean) as { label: string; val: string }[];

  return (
    <div className="con-card" style={{ '--delay': `${index * 0.05}s` } as React.CSSProperties}>
      <div className="con-num" style={{ fontFamily: 'var(--mono)' }}>
        CONCEPT {String(index + 1).padStart(2, '0')}
      </div>
      <div className="con-title" style={{ fontFamily: 'var(--disp)' }}>{concept.title}</div>

      {concept.hook && (
        <div className="con-hook" style={{ fontFamily: 'var(--mono)' }}>
          &ldquo;{concept.hook}&rdquo;
        </div>
      )}

      {rows.map((r) => (
        <div key={r.label} className="con-row">
          <span className="con-row-label" style={{ fontFamily: 'var(--mono)' }}>{r.label}</span>
          <span className="con-row-val">{r.val}</span>
        </div>
      ))}

      {concept.format && (
        <span
          className={`con-tag ${isSeries ? 'tag-ser' : 'tag-solo'}`}
          style={{ fontFamily: 'var(--mono)' }}
        >
          {concept.format}
        </span>
      )}
    </div>
  );
}

export default memo(ConceptCard);
