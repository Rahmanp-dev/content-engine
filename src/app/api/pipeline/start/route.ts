import { NextRequest, NextResponse } from 'next/server';
import { apiError, parseBody, corsHeaders } from '@/lib/api-helpers';
import { startPipeline } from '@/lib/pipeline';

interface StartBody {
  links?: string[];
  accounts?: string[];
  keywords?: string[];
  brief?: string;
  formats?: string[];
  conceptCount?: number;
  videoLimit?: number;
}

export async function POST(request: NextRequest) {
  try {
    const {
      links = [],
      accounts = [],
      keywords = [],
      brief = '',
      formats = ['Standalone', 'Series'],
      conceptCount = 8,
      videoLimit = 15,
    } = await parseBody<StartBody>(request);

    // Validate inputs
    if (!accounts.length && !links.length && !keywords.length) {
      return apiError('Add at least one video source or keyword', 400);
    }

    const limit = Math.min(30, Math.max(5, videoLimit));
    const concepts = Math.min(16, Math.max(4, conceptCount));

    // Start background pipeline — returns immediately
    const runId = startPipeline({
      links,
      accounts,
      keywords,
      brief,
      formats,
      conceptCount: concepts,
      limit,
    });

    return NextResponse.json({ runId }, { headers: corsHeaders });
  } catch (e) {
    return apiError((e as Error).message, 500);
  }
}

export const maxDuration = 300;
