import { NextRequest, NextResponse } from 'next/server';
import { computeFullAnalysis } from '@/lib/etsy-analysis';
import { getLatestScanRun, getScanRun } from '@/lib/db';

// GET: fetch computed analysis for a scan run
export async function GET(request: NextRequest) {
  try {
    const scanRunIdParam = request.nextUrl.searchParams.get('scanRunId');
    const section = request.nextUrl.searchParams.get('section');

    let scanRunId: number;

    if (scanRunIdParam) {
      scanRunId = parseInt(scanRunIdParam, 10);
      const run = getScanRun(scanRunId);
      if (!run) {
        return NextResponse.json({ error: 'Scan run not found' }, { status: 404 });
      }
    } else {
      // Use latest completed scan
      const latest = getLatestScanRun();
      if (!latest || latest.status !== 'completed') {
        return NextResponse.json({ error: 'No completed scan available. Run a scan first.' }, { status: 404 });
      }
      scanRunId = latest.id;
    }

    const analysis = computeFullAnalysis(scanRunId);

    // Return specific section if requested
    if (section && section in analysis) {
      return NextResponse.json({ scanRunId, [section]: (analysis as unknown as Record<string, unknown>)[section] });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
