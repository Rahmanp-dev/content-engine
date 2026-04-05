'use client';

export type PillStatus = 'idle' | 'running' | 'done' | 'error';

interface StatusPillProps {
  status: PillStatus;
}

const CONFIG: Record<PillStatus, { className: string; label: string }> = {
  idle:    { className: 'pill',         label: '● Idle' },
  running: { className: 'pill running', label: '● Running' },
  done:    { className: 'pill done',    label: '● Done' },
  error:   { className: 'pill error',   label: '● Error' },
};

export default function StatusPill({ status }: StatusPillProps) {
  const { className, label } = CONFIG[status];
  return (
    <div className={className} style={{ fontFamily: 'var(--mono)' }}>
      {label}
    </div>
  );
}
