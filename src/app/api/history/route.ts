import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-helpers';
import connectToDatabase from '@/lib/mongodb';
import RunHistory from '@/models/RunHistory';

export async function GET() {
  try {
    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ history: [] }, { headers: corsHeaders });
    }

    await connectToDatabase();

    // Fetch last 50 runs ordered by newest first, with full concepts
    let history = await RunHistory.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Backwards compatibility: If an old run lacks the concepts array, parse it on the fly
    history = history.map((run: any) => {
      if ((!run.concepts || run.concepts.length === 0) && run.conceptsRaw) {
        const parsed = run.conceptsRaw
          .split(/\n===\n/)
          .map((block: string) => block.replace(/^===\n?/, '').replace(/\n?===\s*$/, '').trim())
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
          .filter((c: any) => c.title);
          
        return {
          ...run,
          concepts: parsed,
          conceptCount: parsed.length
        };
      }
      return run;
    });

    return NextResponse.json({ history }, { headers: corsHeaders });
  } catch (e) {
    console.error('History fetch failed:', (e as Error).message);
    return NextResponse.json({ history: [] }, { headers: corsHeaders });
  }
}

export const dynamic = 'force-dynamic';
