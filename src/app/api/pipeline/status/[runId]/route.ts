import { NextRequest, NextResponse } from 'next/server';
import { apiError, corsHeaders } from '@/lib/api-helpers';
import { getRunStatus } from '@/lib/pipeline';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const run = getRunStatus(runId);

    if (!run) {
      return apiError('Run not found', 404);
    }

    return NextResponse.json(
      {
        id: run.id,
        status: run.status,
        stage: run.stage,
        videoCount: run.videoCount,
        downloadCount: run.downloadCount,
        transcriptCount: run.transcriptCount,
        concepts: run.status === 'completed' ? run.concepts : [],
        analysis: run.status === 'completed' ? run.analysis : '',
        conceptsRaw: run.status === 'completed' ? run.conceptsRaw : '',
        logs: run.logs,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      { headers: corsHeaders },
    );
  } catch (e) {
    return apiError((e as Error).message, 500);
  }
}

export const dynamic = 'force-dynamic';
