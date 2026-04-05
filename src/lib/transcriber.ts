/**
 * Local Transcription using OpenAI Whisper
 * Uses a Python helper script for reliable transcription with JSON output.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TranscriptItem {
  localPath: string;
  text: string;
  duration: number;
  words: number;
  account: string;
  views: number;
  likes: number;
  caption: string;
  source: string;
  error?: string;
}

/**
 * Check if Python and Whisper are available
 */
export async function checkWhisper(): Promise<{ python: boolean; whisper: boolean }> {
  const checkPython = (): Promise<boolean> =>
    new Promise((resolve) => {
      const proc = spawn('python', ['--version'], { windowsHide: true });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

  const checkWhisperModule = (): Promise<boolean> =>
    new Promise((resolve) => {
      const proc = spawn('python', ['-c', 'import whisper; print("ok")'], { windowsHide: true });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

  const python = await checkPython();
  const whisper = python ? await checkWhisperModule() : false;

  return { python, whisper };
}

/**
 * Clean up transcript text
 */
function cleanTranscript(text: string): string {
  return text
    .replace(/\[Music\]/gi, '')
    .replace(/\[Applause\]/gi, '')
    .replace(/\[Laughter\]/gi, '')
    .replace(/\[BLANK_AUDIO\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Transcribe a single video using the whisper_helper.py script.
 * Returns structured JSON output directly from Whisper.
 */
function transcribeSingle(
  filePath: string,
  outputTxtPath: string,
  model: string,
  log: (msg: string) => void,
): Promise<{ text: string; duration: number; words: number; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'whisper_helper.py');

    log(`  Running Whisper (model: ${model})…`);

    const proc = spawn('python', [scriptPath, filePath, outputTxtPath, model], {
      windowsHide: true,
      timeout: 300000, // 5 min timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      stderr += line + '\n';
      // Log Whisper progress (model download, processing)
      if (line.includes('%|') || line.includes('Detecting') || line.includes('Transcribing')) {
        log(`  ${line.slice(0, 100)}`);
      }
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) {
            resolve({ text: '', duration: 0, words: 0, error: result.error });
          } else {
            const text = cleanTranscript(result.text || '');
            resolve({
              text,
              duration: result.duration || 0,
              words: result.words || text.split(/\s+/).filter(Boolean).length,
            });
          }
        } catch {
          // JSON parse failed — try reading the output file directly
          if (fs.existsSync(outputTxtPath)) {
            const text = cleanTranscript(fs.readFileSync(outputTxtPath, 'utf-8'));
            resolve({ text, duration: 0, words: text.split(/\s+/).filter(Boolean).length });
          } else {
            resolve({ text: '', duration: 0, words: 0, error: `Unexpected output: ${stdout.slice(0, 200)}` });
          }
        }
      } else {
        resolve({
          text: '',
          duration: 0,
          words: 0,
          error: `Whisper exited (code ${code}): ${stderr.slice(0, 300)}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ text: '', duration: 0, words: 0, error: `Whisper spawn error: ${err.message}` });
    });
  });
}

/**
 * Transcribe all downloaded videos sequentially
 */
export async function transcribe(
  downloads: Array<{
    localPath: string | null;
    account: string;
    views: number;
    likes: number;
    caption: string;
    source: string;
  }>,
  runId: string,
  log: (msg: string) => void,
  model = 'small',
): Promise<TranscriptItem[]> {
  // Pre-flight check
  const availability = await checkWhisper();
  if (!availability.python) {
    throw new Error('Python is not installed. Install Python 3.8+ from python.org');
  }
  if (!availability.whisper) {
    throw new Error('OpenAI Whisper is not installed. Run: pip install openai-whisper');
  }

  const outputDir = path.join(process.cwd(), 'data', 'downloads', runId);
  const validDownloads = downloads.filter((d) => d.localPath && fs.existsSync(d.localPath));

  if (validDownloads.length === 0) {
    throw new Error('No valid downloaded files to transcribe');
  }

  log(`Transcribing ${validDownloads.length} videos with Whisper (${model} model)…`);

  const results: TranscriptItem[] = [];

  for (let i = 0; i < validDownloads.length; i++) {
    const item = validDownloads[i];
    const baseName = path.basename(item.localPath!, path.extname(item.localPath!));
    const outputTxtPath = path.join(outputDir, `${baseName}.txt`);

    log(`Transcribing ${i + 1}/${validDownloads.length}: @${item.account}…`);

    const result = await transcribeSingle(item.localPath!, outputTxtPath, model, log);

    results.push({
      localPath: item.localPath!,
      text: result.text,
      duration: result.duration,
      words: result.words,
      account: item.account,
      views: item.views,
      likes: item.likes,
      caption: item.caption,
      source: item.source,
      error: result.error,
    });

    if (result.text) {
      log(`  ✓ Transcribed (${result.words} words, ~${result.duration}s)`);
    } else {
      log(`  ✗ Transcription failed: ${result.error}`);
    }
  }

  const successful = results.filter((r) => r.text);
  log(`Transcription complete: ${successful.length}/${validDownloads.length} succeeded`);

  return results;
}
