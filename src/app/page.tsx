'use client';

import { useCallback, useRef, useState, useEffect, type KeyboardEvent } from 'react';
import StatusPill, { type PillStatus } from '@/components/status-pill';
import StageProgress, { type StageState } from '@/components/stage-progress';
import TerminalLog, { type LogEntry } from '@/components/terminal-log';
import ConceptCard, { type Concept } from '@/components/concept-card';
import Toast from '@/components/toast';

/* ───────── Types ───────── */
interface LastRun { time: string; date: string; }
interface SourceItem { type: 'link' | 'account'; value: string; }

interface PipelineStatusResponse {
  id: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  videoCount: number;
  downloadCount: number;
  transcriptCount: number;
  concepts: Concept[];
  analysis: string;
  conceptsRaw: string;
  logs: Array<{ ts: string; level: string; msg: string }>;
  startedAt: string;
  completedAt: string | null;
}

/* ───────── Helpers ───────── */
function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

async function post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  return r.json() as Promise<T>;
}

async function get<T = Record<string, unknown>>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || r.statusText);
  }
  return r.json() as Promise<T>;
}

/* ───────── Stage Config ───────── */
const STAGE_NAMES = ['Crawl', 'Download', 'Transcribe', 'Analyze', 'Generate'] as const;
const STAGE_MAP: Record<string, number> = {
  crawling: 0, downloading: 1, transcribing: 2, analyzing: 3, generating: 4, saving: 4, done: 5,
};
const INITIAL_STAGES: StageState[] = ['', '', '', '', ''];

/* ═════════════════════════════════════════════════════
   Dashboard Page
   ═════════════════════════════════════════════════════ */
export default function DashboardPage() {
  /* ── Config State ── */
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [brief, setBrief] = useState('');
  const [formats, setFormats] = useState<string[]>(['Standalone', 'Series']);
  const [conceptCount, setConceptCount] = useState(8);
  const [videoLimit, setVideoLimit] = useState(15);
  const [sourceTab, setSourceTab] = useState<'link' | 'account'>('account');

  /* ── Pipeline State ── */
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<PillStatus>('idle');
  const [stages, setStages] = useState<StageState[]>([...INITIAL_STAGES]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressPill, setProgressPill] = useState<PillStatus>('running');

  /* ── Results State ── */
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [resultsMeta, setResultsMeta] = useState('Concepts will appear here after the pipeline completes');
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [analysisRaw, setAnalysisRaw] = useState('');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);

  /* ── Derived ── */
  const accounts = sources.filter((s) => s.type === 'account').map((s) => s.value);
  const links = sources.filter((s) => s.type === 'link').map((s) => s.value);

  /* ── Source Management ── */
  const addSource = useCallback(() => {
    const input = sourceInputRef.current;
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;

    if (sourceTab === 'link') {
      const isValidIG = /instagram\.com\/(reel|reels|p)\//.test(raw);
      if (!isValidIG) {
        setToast('Enter a valid Instagram URL (must contain /reel/, /reels/, or /p/)');
        return;
      }
      if (sources.some((s) => s.value === raw)) return;
      setSources((prev) => [...prev, { type: 'link', value: raw }]);
    } else {
      const handle = raw.replace(/^@/, '');
      if (!handle) return;
      if (sources.some((s) => s.value === handle && s.type === 'account')) return;
      setSources((prev) => [...prev, { type: 'account', value: handle }]);
    }
    input.value = '';
  }, [sourceTab, sources]);

  const removeSource = useCallback((idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addKeyword = useCallback(() => {
    const input = keywordInputRef.current;
    if (!input) return;
    const raw = input.value.trim();
    if (!raw || keywords.includes(raw)) return;
    setKeywords((prev) => [...prev, raw]);
    input.value = '';
  }, [keywords]);

  const removeKeyword = useCallback((val: string) => {
    setKeywords((prev) => prev.filter((k) => k !== val));
  }, []);

  const toggleFormat = useCallback((fmt: string) => {
    setFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt],
    );
  }, []);

  /* ── Pipeline Stage Mapping ── */
  const mapLogLevel = (level: string): LogEntry['type'] => {
    switch (level) {
      case 'ok': return 'ok';
      case 'warn': return 'warn';
      case 'error': return 'err';
      default: return 'info';
    }
  };

  const updateStagesFromPipeline = useCallback((stage: string) => {
    const activeIdx = STAGE_MAP[stage] ?? 0;
    setStages(
      INITIAL_STAGES.map((_, i) => {
        if (i < activeIdx) return 'done';
        if (i === activeIdx && stage !== 'done') return 'active';
        return '';
      }) as StageState[],
    );
  }, []);

  /* ── Poll Pipeline ── */
  const fetchHistory = useCallback(async () => {
    try {
      const res = await get<{ history: any[] }>('/api/history');
      setHistoryLogs(res.history || []);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

  const pollStatus = useCallback(
    async (runId: string) => {
      try {
        const data = await get<PipelineStatusResponse>(`/api/pipeline/status/${runId}`);

        const newLogs: LogEntry[] = data.logs.map((l) => ({
          type: mapLogLevel(l.level),
          message: l.msg,
          timestamp: new Date(l.ts).toLocaleTimeString('en-GB', { hour12: false }),
        }));
        setLogs(newLogs);
        updateStagesFromPipeline(data.stage);

        if (data.status === 'completed') {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setStages(['done', 'done', 'done', 'done', 'done']);
          setProgressPill('done');
          setStatus('done');
          setRunning(false);
          setConcepts(data.concepts);
          setAnalysisRaw(data.analysis);
          setResultsMeta(`${data.concepts.length} concepts · ${data.videoCount} videos · ${data.transcriptCount} transcripts`);
          setLastRun({
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            date: new Date().toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' }),
          });
          try {
            const docRes = await post<{ docUrl: string }>('/api/save-doc', {
              concepts: data.concepts, analysis: data.analysis, transcriptCount: data.transcriptCount,
            });
            setDocUrl(docRes.docUrl);
          } catch { /* optional */ }
          fetchHistory();
          setTimeout(() => { resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
        } else if (data.status === 'failed') {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setStatus('error'); setProgressPill('error'); setRunning(false);
          setStages((prev) => prev.map((s) => (s === 'active' ? 'err' : s)) as StageState[]);
        }
      } catch (e) { console.error('Poll failed:', e); }
    },
    [updateStagesFromPipeline, fetchHistory],
  );

  /* ── Start Pipeline ── */
  const startPipeline = useCallback(async () => {
    if (running) return;
    if (!sources.length && !keywords.length) {
      setToast('Add at least one video source or keyword first.');
      return;
    }
    if (!brief.trim()) {
      setToast('Please fill in the content brief — it guides the AI analysis.');
      return;
    }

    setRunning(true); setStatus('running'); setProgressVisible(true); setProgressPill('running');
    setLogs([]); setConcepts([]); setAnalysisRaw(''); setDocUrl(null);
    setResultsMeta('Generating…'); setStages([...INITIAL_STAGES]);

    try {
      const { runId } = await post<{ runId: string }>('/api/pipeline/start', {
        links, accounts, keywords, brief, formats, conceptCount, videoLimit,
      });
      setLogs([{ type: 'info', message: `Pipeline started (${runId})`, timestamp: ts() }]);
      pollingRef.current = setInterval(() => pollStatus(runId), 5000);
      setTimeout(() => pollStatus(runId), 2000);
    } catch (err) {
      setLogs([{ type: 'err', message: `Failed to start pipeline: ${(err as Error).message}`, timestamp: ts() }]);
      setStatus('error'); setProgressPill('error'); setRunning(false);
    }
  }, [running, sources, keywords, brief, links, accounts, formats, conceptCount, videoLimit, pollStatus]);

  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  /* ── Download Fallback ── */
  const downloadFallback = useCallback(() => {
    if (!concepts.length) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let md = `# CONTENT INTELLIGENCE ENGINE\n*${dateStr}*\n\n## SECTION 1 — COMPETITIVE INTELLIGENCE\n\n${analysisRaw}\n\n## SECTION 2 — VIDEO CONCEPTS\n\n`;
    concepts.forEach((c, i) => {
      md += `### ${i + 1}. ${c.title}\n**Format:** ${c.format}\n\n**Hook:** "${c.hook}"\n\n**Core Insight:** ${c.insight}\n\n**Structure:** ${c.structure}\n\n**Why It Wins:** ${c.whyWins}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Content-Brief-${now.toLocaleDateString('en-GB').replace(/\//g, '-')}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [concepts, analysisRaw]);

  /* ═══════ RENDER ═══════ */
  return (
    <div className="wrap">
      {/* ── Header ── */}
      <header>
        <div className="logo" style={{ fontFamily: 'var(--disp)' }}>
          <div className="logo-mark">
            <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#D4952A" strokeWidth="1.2" fill="none" />
              <circle cx="7" cy="7" r="1.5" fill="#D4952A" />
            </svg>
          </div>
          Content Intelligence Engine
        </div>
        <div className="header-right"><StatusPill status={status} /></div>
      </header>

      {/* ═══════════════════════════════════════════
          INPUT SYSTEM V2
          ═══════════════════════════════════════════ */}
      <section className="cfg-panel">

        {/* ── Row 1: Video Sources + Keywords ── */}
        <div className="cfg-row">
          {/* Video Sources */}
          <div className="card">
            <div className="section-hdr">
              <span className="section-title">Video Sources</span>
              <span className="section-badge badge-count">{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="tab-row">
              <button className={`tab-btn${sourceTab === 'account' ? ' active' : ''}`} onClick={() => setSourceTab('account')}>Account handle</button>
              <button className={`tab-btn${sourceTab === 'link' ? ' active' : ''}`} onClick={() => setSourceTab('link')}>Direct video link</button>
            </div>

            <div className="add-row">
              <input
                ref={sourceInputRef}
                className="chip-inp"
                type="text"
                placeholder={sourceTab === 'link' ? 'https://www.instagram.com/reel/ABC123/' : '@username'}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addSource(); }}
              />
              <button className="add-btn" onClick={addSource} aria-label="Add source">+</button>
            </div>

            <div className="source-list" style={{ marginTop: '10px' }}>
              {sources.length === 0 ? (
                <div className="empty-sources">No sources added yet</div>
              ) : (
                sources.map((s, i) => (
                  <div key={`${s.type}-${s.value}-${i}`} className="source-item">
                    <div className={`source-icon ${s.type === 'link' ? 'icon-link' : 'icon-account'}`}>
                      {s.type === 'link' ? '↗' : '@'}
                    </div>
                    <span className="source-label">
                      {s.type === 'link' ? s.value.replace('https://www.instagram.com', '…').slice(0, 40) : `@${s.value}`}
                    </span>
                    <span className={`source-type ${s.type === 'link' ? 'type-link' : 'type-account'}`}>
                      {s.type === 'link' ? 'direct link' : 'account'}
                    </span>
                    <button className="remove-btn" onClick={() => removeSource(i)} aria-label="Remove">−</button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Research Keywords */}
          <div className="card">
            <div className="section-hdr">
              <span className="section-title">Research Keywords</span>
              <span className="section-badge badge-optional">optional</span>
            </div>

            <div className="add-row">
              <input
                ref={keywordInputRef}
                className="chip-inp"
                type="text"
                placeholder="e.g. marketing academy"
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addKeyword(); }}
              />
              <button className="add-btn" onClick={addKeyword} aria-label="Add keyword">+</button>
            </div>

            <div className="source-list" style={{ marginTop: '10px' }}>
              {keywords.length === 0 ? (
                <div className="empty-sources">No keywords added yet</div>
              ) : (
                keywords.map((kw) => (
                  <div key={kw} className="source-item">
                    <div className="source-icon icon-keyword">#</div>
                    <span className="source-label">{kw}</span>
                    <span className="source-type type-keyword">Meta Ads</span>
                    <button className="remove-btn" onClick={() => removeKeyword(kw)} aria-label="Remove">−</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Content Brief + Output Controls ── */}
        <div className="cfg-row">
          {/* Content Brief */}
          <div className="card">
            <div className="section-hdr">
              <span className="section-title">Content Brief</span>
              <span className="section-badge badge-required">required</span>
            </div>
            <textarea
              className="brief-textarea"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe what you want the output to focus on. E.g: We create instructional Reels for marketers and founders. Our tone is professional but approachable. Focus on growth hacking, content strategy, and social media marketing."
            />
          </div>

          {/* Output Controls */}
          <div className="card">
            <div className="section-hdr">
              <span className="section-title">Output Format</span>
            </div>

            <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Preferred formats
            </div>
            <div className="toggle-row">
              <button className={`toggle-chip${formats.includes('Standalone') ? ' on' : ''}`} onClick={() => toggleFormat('Standalone')}>Standalone</button>
              <button className={`toggle-chip${formats.includes('Series') ? ' on' : ''}`} onClick={() => toggleFormat('Series')}>Series</button>
            </div>

            <div className="slider-field">
              <label>Concepts to generate <span>{conceptCount}</span></label>
              <input type="range" className="slider-input" min={4} max={16} value={conceptCount} onChange={(e) => setConceptCount(parseInt(e.target.value))} />
            </div>

            <div className="slider-field">
              <label>Videos to analyze <span>{videoLimit}</span></label>
              <input type="range" className="slider-input" min={5} max={30} value={videoLimit} onChange={(e) => setVideoLimit(parseInt(e.target.value))} />
            </div>
          </div>
        </div>

        {/* ── Summary Bar ── */}
        <div className="summary-bar">
          <div className="summary-item">Sources: <span>{sources.length}</span></div>
          <div className="summary-sep" />
          <div className="summary-item">Keywords: <span>{keywords.length}</span></div>
          <div className="summary-sep" />
          <div className="summary-item">Formats: <span>{formats.join(', ') || 'None'}</span></div>
          <div className="summary-sep" />
          <div className="summary-item">Concepts: <span>{conceptCount}</span></div>
          <div className="summary-sep" />
          <div className="summary-item">Videos: <span>{videoLimit}</span></div>
        </div>
      </section>

      {/* ── Run Bar ── */}
      <div className="run-bar">
        <button className={`run-btn${running ? ' spinning' : ''}`} disabled={running} onClick={startPipeline}>
          <span className="run-ico">{running ? '◌' : '▶'}</span>
          <span className="run-lbl" style={{ fontFamily: 'var(--disp)' }}>
            {running ? 'Running…' : lastRun ? 'Run Again' : 'Generate Content Brief'}
          </span>
          <span className="run-sub" style={{ fontFamily: 'var(--mono)' }}>
            {running ? 'Crawl · Download · Transcribe · Analyze · Generate' : 'Fully local — no external APIs'}
          </span>
        </button>
        <div className="last-card">
          <div>
            <div className="meta-label" style={{ fontFamily: 'var(--mono)' }}>Last run</div>
            <div className="meta-val" style={{ fontFamily: 'var(--disp)' }}>{lastRun?.time ?? 'Never'}</div>
            <div className="meta-sub" style={{ fontFamily: 'var(--mono)' }}>{lastRun?.date ?? '—'}</div>
          </div>
          <div className="doc-link" style={{ fontFamily: 'var(--mono)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            {docUrl && <a href={docUrl} target="_blank" rel="noopener noreferrer">↗ Open Google Doc</a>}
            {concepts.length > 0 && (
              <button onClick={downloadFallback} style={{ background: 'none', border: 'none', color: 'var(--acc)', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
                ⭳ Download local file
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress ── */}
      {progressVisible && (
        <section className="prog-section">
          <div className="prog-head">
            <span className="prog-title" style={{ fontFamily: 'var(--mono)' }}>Pipeline — Live</span>
            <StatusPill status={progressPill} />
          </div>
          <StageProgress stages={STAGE_NAMES.map((name, i) => ({ name, state: stages[i] }))} />
          <TerminalLog logs={logs} />
        </section>
      )}

      <div className="divider" />

      {/* ── Results ── */}
      <section ref={resultsRef}>
        <div className="results-head">
          <div className="results-title" style={{ fontFamily: 'var(--disp)' }}>Video Concepts</div>
          <div className="results-meta" style={{ fontFamily: 'var(--mono)' }}>{resultsMeta}</div>
        </div>
        <div className="concepts-grid">
          {concepts.map((c, i) => <ConceptCard key={`${c.title}-${i}`} concept={c} index={i} />)}
        </div>
      </section>

      <div className="divider" />

      {/* ── History ── */}
      <section className="history-section">
        <div className="results-head">
          <div className="results-title" style={{ fontFamily: 'var(--disp)' }}>Run History</div>
          <div className="results-meta" style={{ fontFamily: 'var(--mono)' }}>{historyLogs.length} saved run{historyLogs.length !== 1 ? 's' : ''}</div>
        </div>
        {historyLogs.length === 0 ? (
          <div className="empty-sources" style={{ padding: '28px' }}>No history yet — run the pipeline to save results to MongoDB</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {historyLogs.map((run: any) => {
              // Smart title logic
              let title = 'General Analysis';
              if (run.keywords?.length > 0) {
                title = `${run.keywords.slice(0, 2).join(', ')}`;
                if (run.keywords.length > 2) title += ` +${run.keywords.length - 2}`;
              } else if (run.brief) {
                const words = run.brief.split(' ');
                title = words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
              } else if (run.accounts?.length > 0) {
                title = `@${run.accounts[0]} Analysis`;
              }
              
              return (
              <details key={run._id} className="card" style={{ padding: 0, cursor: 'pointer' }}>
                <summary style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', outline: 'none', listStyle: 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--disp)', fontSize: '15px', color: 'var(--text1)' }}>
                      {title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
                        {new Date(run.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {run.accounts?.map((acc: string) => (
                        <span key={acc} className="source-type type-account" style={{ fontSize: '10px' }}>@{acc}</span>
                      ))}
                      {run.links?.slice(0, 2).map((l: string, i: number) => (
                        <span key={i} className="source-type type-link" style={{ fontSize: '10px' }}>↗ link</span>
                      ))}
                    </div>
                    {run.brief && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                        {run.brief.slice(0, 100)}{run.brief.length > 100 ? '…' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--amber)' }}>
                      {run.conceptCount || run.concepts?.length || 0} concepts
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
                      {run.videoCount} vid · {run.transcriptCount} tr
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: '14px', transition: 'transform 0.2s' }}>▸</span>
                  </div>
                </summary>

                <div style={{ borderTop: '1px solid var(--border)', padding: '18px 22px' }}>
                  {/* Stats row */}
                  <div className="summary-bar" style={{ marginBottom: '16px' }}>
                    <div className="summary-item">Videos: <span>{run.videoCount}</span></div>
                    <div className="summary-sep" />
                    <div className="summary-item">Transcripts: <span>{run.transcriptCount}</span></div>
                    <div className="summary-sep" />
                    <div className="summary-item">Concepts: <span>{run.conceptCount || run.concepts?.length || 0}</span></div>
                    {run.formats?.length > 0 && (<><div className="summary-sep" /><div className="summary-item">Formats: <span>{run.formats.join(', ')}</span></div></>)}
                  </div>

                  {/* Concept cards */}
                  {run.concepts && run.concepts.length > 0 ? (
                    <div className="concepts-grid">
                      {run.concepts.map((c: any, i: number) => (
                        <ConceptCard key={`hist-${run._id}-${i}`} concept={c} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text3)' }}>
                      No structured concepts saved for this run.
                      {run.conceptsRaw && (
                        <details style={{ marginTop: '10px' }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--text2)' }}>View raw output</summary>
                          <pre style={{ marginTop: '8px', fontSize: '11px', whiteSpace: 'pre-wrap', color: 'var(--text2)', background: 'var(--surface)', padding: '12px', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                            {run.conceptsRaw}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </details>
              );
            })}
          </div>
        )}
      </section>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
