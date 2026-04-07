/**
 * Pipeline Orchestrator v2
 * Runs the full content intelligence pipeline as a background task:
 * Crawl → Download → Transcribe → Analyze → Generate → Save
 *
 * Supports direct reel links AND account-based crawling.
 * Injects content brief into analysis and generation prompts.
 */
import { crawl, crawlDirectLinks, type VideoItem } from './crawler';
import { download, type DownloadedItem } from './downloader';
import { transcribe, type TranscriptItem } from './transcriber';
import { generateContentWithRetry } from './gemini';
import connectToDatabase from './mongodb';
import RunHistory from '@/models/RunHistory';

/* ───── Types ───── */

export type PipelineStage =
  | 'crawling'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'saving'
  | 'done';

export type PipelineStatus = 'running' | 'completed' | 'failed';

export interface LogEntry {
  ts: string;
  level: 'info' | 'ok' | 'warn' | 'error';
  msg: string;
}

export interface PipelineConfig {
  links: string[];
  accounts: string[];
  keywords: string[];
  brief: string;
  formats: string[];
  conceptCount: number;
  limit: number;
}

export interface PipelineRun {
  id: string;
  status: PipelineStatus;
  stage: PipelineStage;
  config: PipelineConfig;
  logs: LogEntry[];
  videoCount: number;
  downloadCount: number;
  transcriptCount: number;
  analysis: string;
  concepts: any[];
  conceptsRaw: string;
  startedAt: string;
  completedAt: string | null;
}

/* ───── In-Memory Run Store (persisted via globalThis across module reloads) ───── */
const globalForPipeline = globalThis as unknown as {
  __pipelineRuns?: Map<string, PipelineRun>;
};

if (!globalForPipeline.__pipelineRuns) {
  globalForPipeline.__pipelineRuns = new Map<string, PipelineRun>();
}

const activeRuns = globalForPipeline.__pipelineRuns;

function generateRunId(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `run_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function appendLog(run: PipelineRun, level: LogEntry['level'], msg: string) {
  run.logs.push({ ts: new Date().toISOString(), level, msg });
}

/* ───── Analysis (Gemini) — injects brief ───── */

async function analyzeTranscripts(
  transcripts: TranscriptItem[],
  brief: string,
  log: (level: LogEntry['level'], msg: string) => void,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const block = transcripts
    .map(
      (t, i) =>
        [
          `--- VIDEO ${i + 1} | Source: ${t.source} | Account: @${t.account} | Views: ${Number(t.views).toLocaleString()} | Likes: ${Number(t.likes).toLocaleString()} ---`,
          `Caption: ${t.caption}`,
          `Duration: ${Math.round(t.duration)}s | Words: ${t.words}`,
          `Transcript:`,
          t.text || '[No transcript available]',
          '',
        ].join('\n'),
    )
    .join('\n');

  const briefBlock = brief
    ? `Our content brief: ${brief}\n\nBased on this brief and the analysis below, provide insights specifically relevant to our content goals.\n\n`
    : '';

  const prompt = `You are a senior content strategist. ${briefBlock}Below are ${transcripts.length} competitor videos ranked by performance, with full transcripts.

Analyze them and extract:
1. **Top 5 opening hooks** — quote the first 1–2 sentences exactly, note why each works
2. **Content formats** — the 3–4 structural patterns used most (e.g. "Problem → Framework → Example → CTA")
3. **Recurring themes** — topics, frameworks, and skills the audience engages with most
4. **Emotional triggers** — the pain points, desires, or fears being activated
5. **Content gaps** — topics/angles no one is covering well that the audience clearly wants
6. **Pacing & duration insights** — average length, talking speed, how fast info is delivered

${block}

Be specific. Reference actual examples from the transcripts by video number. This analysis is the foundation for generating new original content.`;

  log('info', 'Sending transcripts to Gemini for analysis…');
  const analysis = await generateContentWithRetry({ apiKey: key, prompt, log });

  if (!analysis) throw new Error('Gemini returned no analysis');
  return analysis;
}

/* ───── Generation (Gemini) — injects brief, formats, conceptCount ───── */

async function generateConcepts(
  analysis: string,
  transcriptCount: number,
  brief: string,
  formats: string[],
  conceptCount: number,
  log: (level: LogEntry['level'], msg: string) => void,
): Promise<{ concepts: any[]; raw: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const briefBlock = brief
    ? `Our content brief: ${brief}\n\nBased on this brief and the analysis below, generate concepts aligned with our content goals.\n\n`
    : '';

  const formatInstruction = formats.length
    ? `Format preference: ${formats.join(' and ')}. Prefer ${formats.join(' and ')} formats for the generated concepts.`
    : '';

  const prompt = `You are a senior content strategist. ${briefBlock}Your content is informative, strategically disruptive, and builds expertise.

Here is a competitive intelligence analysis based on ${transcriptCount} top-performing competitor videos:

${analysis}

Based on this analysis, generate exactly ${conceptCount} original video concepts. Each must be distinctly different from what competitors are doing — challenge assumptions, flip conventional wisdom, and fill the identified gaps.

${formatInstruction}

For EACH concept, use this exact format:

===
Title: [punchy, curiosity-driven title]
Format: [Standalone | Series — Part X of "Series Name"]
Hook: [The exact first line spoken on camera — must stop the scroll in 3 seconds]
Core Insight: [The main idea, framework, or skill taught — 2 sentences]
Structure: [Beat-by-beat outline e.g. Hook → Myth → Framework → Real Example → CTA]
Why It Wins: [Which gap or emotional trigger from the analysis this addresses — 1 sentence]
===

Separate every concept with === on its own line. Do not add any text before the first === or after the last ===.`;

  log('info', `Generating ${conceptCount} original video concepts via Gemini…`);
  const raw = await generateContentWithRetry({ apiKey: key, prompt, log });

  if (!raw) throw new Error('Gemini returned no concepts');

  // Parse === delimited concepts
  const concepts = raw
    .split(/\n===\n/)
    .map((block: string) =>
      block
        .replace(/^===\n?/, '')
        .replace(/\n?===\s*$/, '')
        .trim(),
    )
    .filter(Boolean)
    .map((block: string) => {
      const getField = (fieldKey: string) => {
        const match = block.match(new RegExp(`^${fieldKey}:\\s*(.+)$`, 'im'));
        return match ? match[1].trim() : '';
      };
      return {
        title: getField('Title'),
        format: getField('Format'),
        hook: getField('Hook'),
        insight: getField('Core Insight'),
        structure: getField('Structure'),
        whyWins: getField('Why It Wins'),
      };
    })
    .filter((c: { title: string }) => c.title);

  return { concepts, raw };
}

/* ───── Main Pipeline ───── */

export function getRunStatus(runId: string): PipelineRun | null {
  return activeRuns.get(runId) || null;
}

export function startPipeline(config: PipelineConfig): string {
  const runId = generateRunId();

  const run: PipelineRun = {
    id: runId,
    status: 'running',
    stage: 'crawling',
    config,
    logs: [],
    videoCount: 0,
    downloadCount: 0,
    transcriptCount: 0,
    analysis: '',
    concepts: [],
    conceptsRaw: '',
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  activeRuns.set(runId, run);

  // Run pipeline in background (fire-and-forget)
  executePipeline(run).catch((err) => {
    appendLog(run, 'error', `Pipeline crashed: ${err.message}`);
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
  });

  return runId;
}

async function executePipeline(run: PipelineRun): Promise<void> {
  const log = (level: LogEntry['level'], msg: string) => appendLog(run, level, msg);

  try {
    /* ── STAGE 1: CRAWL ── */
    run.stage = 'crawling';
    const allVideos: VideoItem[] = [];

    // Handle direct links
    if (run.config.links.length > 0) {
      log('info', `Processing ${run.config.links.length} direct reel links…`);
      const directVideos = await crawlDirectLinks(run.config.links, (msg) => log('info', msg));
      allVideos.push(...directVideos);
      log('ok', `${directVideos.length} direct links processed ✓`);
    }

    // Handle account crawling
    if (run.config.accounts.length > 0) {
      log('info', `Crawling ${run.config.accounts.length} accounts…`);
      const accountVideos = await crawl(
        { accounts: run.config.accounts, keywords: run.config.keywords, limit: run.config.limit },
        (msg) => log('info', msg),
      );
      allVideos.push(...accountVideos);
    }

    if (allVideos.length === 0) {
      throw new Error('No videos found. Check account names / URLs and try enabling Instagram login.');
    }

    // Sort by views, deduplicate and limit
    const seen = new Set<string>();
    const uniqueVideos = allVideos.filter((v) => {
      const key = v.pageUrl || v.videoUrl;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    uniqueVideos.sort((a, b) => b.views - a.views);
    const videos = uniqueVideos.slice(0, run.config.limit);

    run.videoCount = videos.length;
    log('ok', `${videos.length} videos extracted ✓`);

    /* ── STAGE 2: DOWNLOAD ── */
    run.stage = 'downloading';
    log('info', `Downloading ${videos.length} videos with yt-dlp…`);

    const downloads: DownloadedItem[] = await download(videos, run.id, (msg) => log('info', msg));
    const successfulDownloads = downloads.filter((d) => d.localPath);
    run.downloadCount = successfulDownloads.length;

    if (successfulDownloads.length === 0) {
      throw new Error('No videos downloaded successfully. Check yt-dlp installation.');
    }

    log('ok', `${successfulDownloads.length} videos downloaded ✓`);

    /* ── STAGE 3: TRANSCRIBE ── */
    run.stage = 'transcribing';
    log('info', `Transcribing ${successfulDownloads.length} videos with Whisper…`);

    const transcripts: TranscriptItem[] = await transcribe(successfulDownloads, run.id, (msg) => log('info', msg));
    const validTranscripts = transcripts.filter((t) => t.text);
    run.transcriptCount = validTranscripts.length;

    if (validTranscripts.length === 0) {
      throw new Error('No transcripts generated. Check Whisper installation.');
    }

    log('ok', `${validTranscripts.length} transcripts ready ✓`);

    /* ── STAGE 4: ANALYZE ── */
    run.stage = 'analyzing';
    const analysis = await analyzeTranscripts(validTranscripts, run.config.brief, log);
    run.analysis = analysis;
    log('ok', 'Competitive intelligence analysis complete ✓');

    /* ── STAGE 5: GENERATE ── */
    run.stage = 'generating';
    const { concepts, raw } = await generateConcepts(
      analysis,
      validTranscripts.length,
      run.config.brief,
      run.config.formats,
      run.config.conceptCount,
      log,
    );
    run.concepts = concepts;
    run.conceptsRaw = raw;
    log('ok', `${concepts.length} concepts generated ✓`);

    /* ── STAGE 6: SAVE TO MONGODB ── */
    run.stage = 'saving';
    log('info', 'Saving to MongoDB…');

    try {
      await connectToDatabase();
      await RunHistory.create({
        runId: run.id,
        accounts: run.config.accounts,
        links: run.config.links,
        keywords: run.config.keywords,
        brief: run.config.brief,
        formats: run.config.formats,
        videoCount: run.videoCount,
        transcriptCount: run.transcriptCount,
        conceptCount: concepts.length,
        analysisRaw: analysis,
        conceptsRaw: raw,
        concepts: concepts,
        status: 'completed',
        stage: 'done',
      });
      log('ok', 'Saved to history ✓');
    } catch (dbErr) {
      log('warn', `MongoDB save failed: ${(dbErr as Error).message} — concepts still available`);
    }

    /* ── DONE ── */
    run.stage = 'done';
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    log('ok', '━━━  Pipeline complete  ━━━');
  } catch (err) {
    log('error', `Pipeline failed: ${(err as Error).message}`);
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
  }
}
