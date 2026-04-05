import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiError, requireEnv, parseBody, corsHeaders, EnvMissingError } from '@/lib/api-helpers';

interface Transcript {
  source: string;
  account: string;
  views: number;
  likes: number;
  caption: string;
  text: string;
  duration: number;
  words: number;
}

interface AnalyzeBody {
  transcripts?: Transcript[];
}

export async function POST(request: NextRequest) {
  try {
    const { transcripts = [] } = await parseBody<AnalyzeBody>(request);
    const key = requireEnv('GEMINI_API_KEY');

    if (!transcripts.length) return apiError('No transcripts provided', 400);

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

    const prompt = `You are a senior content strategist for a marketing and technology academy that creates instructional Instagram Reels. Below are ${transcripts.length} competitor videos ranked by performance, with full transcripts.

Analyze them and extract:
1. **Top 5 opening hooks** — quote the first 1–2 sentences exactly, note why each works
2. **Content formats** — the 3–4 structural patterns used most (e.g. "Problem → Framework → Example → CTA")
3. **Recurring themes** — topics, frameworks, and skills the audience engages with most
4. **Emotional triggers** — the pain points, desires, or fears being activated
5. **Content gaps** — topics/angles no one is covering well that the audience clearly wants
6. **Pacing & duration insights** — average length, talking speed, how fast info is delivered

${block}

Be specific. Reference actual examples from the transcripts by video number. This analysis is the foundation for generating new original content.`;

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    if (!analysis) return apiError('Gemini returned no analysis', 500);

    return NextResponse.json(
      { analysis, transcriptCount: transcripts.length },
      { headers: corsHeaders },
    );
  } catch (e) {
    if (e instanceof EnvMissingError) return apiError(e.message, 500);
    return apiError((e as Error).message, 500);
  }
}

export const maxDuration = 60;
