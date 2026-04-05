'use client';

import { useEffect, useRef, memo } from 'react';

export interface LogEntry {
  type: 'info' | 'ok' | 'warn' | 'err';
  message: string;
  timestamp: string;
}

interface TerminalLogProps {
  logs: LogEntry[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function TerminalLog({ logs }: TerminalLogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="term" ref={ref} style={{ fontFamily: 'var(--mono)' }}>
      {logs.map((entry, i) => (
        <div key={i} className={`logline ${entry.type}`}>
          <span className="ts">{entry.timestamp}</span>
          <span className="msg" dangerouslySetInnerHTML={{ __html: esc(entry.message) }} />
        </div>
      ))}
    </div>
  );
}

export default memo(TerminalLog);
