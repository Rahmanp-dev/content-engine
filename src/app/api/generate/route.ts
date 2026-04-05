import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiError, requireEnv, parseBody, corsHeaders, EnvMissingError } from '@/lib/api-helpers';
import connectToDatabase from '@/lib/mongodb';
import RunHistory from '@/models/RunHistory';

interface GenerateBody {
  analysis?: string;
  transcriptCount?: number;
  accounts?: string[];
  keywords?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { analysis = '', transcriptCount = 0, accounts = [], keywords = [] } = await parseBody<GenerateBody>(request);
    const key = requireEnv('GEMINI_API_KEY');

    if (!analysis) return apiError('No analysis provided', 400);

    const prompt = `You are a senior content strategist for a marketing and technology academy that creates instructional Instagram Reels. Your content is informative, strategically disruptive, and builds marketing skills and technology awareness.

Here is a competitive intelligence analysis based on ${transcriptCount} top-performing competitor videos:

${analysis}

Based on this analysis, generate exactly 8 original video concepts. Each must be distinctly different from what competitors are doing — challenge assumptions, flip conventional wisdom, and fill the identified gaps.

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

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    if (!raw) return apiError('Gemini returned no concepts', 500);

    // Parse the === delimited concepts
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
        const get = (key: string) => {
          const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
          return match ? match[1].trim() : '';
        };
        return {
          title: get('Title'),
          format: get('Format'),
          hook: get('Hook'),
          insight: get('Core Insight'),
          structure: get('Structure'),
          whyWins: get('Why It Wins'),
        };
      })
      .filter((c: { title: string }) => c.title);

    // --- Save to MongoDB ---
    try {
      await connectToDatabase();
      await RunHistory.create({
        accounts,
        keywords,
        videoCount: transcriptCount,
        analysisRaw: analysis,
        conceptsRaw: raw,
      });
    } catch (dbErr) {
      console.error('Failed to save history to MongoDB:', dbErr);
      // We don't throw here to not break the pipeline if DB fails
    }

    return NextResponse.json(
      { concepts, raw, count: concepts.length },
      { headers: corsHeaders },
    );
  } catch (e) {
    if (e instanceof EnvMissingError) return apiError(e.message, 500);
    return apiError((e as Error).message, 500);
  }
}

export const maxDuration = 60;
