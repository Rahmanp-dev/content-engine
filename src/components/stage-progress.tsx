'use client';

import { memo } from 'react';

export type StageState = '' | 'active' | 'done' | 'err';

interface Stage {
  name: string;
  state: StageState;
}

interface StageProgressProps {
  stages: Stage[];
}

function StageProgress({ stages }: StageProgressProps) {
  return (
    <div className="stages">
      {stages.map((s, i) => (
        <div key={s.name} className={`stg${s.state ? ` ${s.state}` : ''}`}>
          <div className="stg-dot" style={{ fontFamily: 'var(--mono)' }}>
            {s.state === 'done' ? '✓' : s.state === 'err' ? '✕' : String(i + 1)}
          </div>
          <div className="stg-name" style={{ fontFamily: 'var(--mono)' }}>{s.name}</div>
        </div>
      ))}
    </div>
  );
}

export default memo(StageProgress);
