import { NextRequest, NextResponse } from 'next/server';
import { startFullScan, getScanStatus, cancelScan, isScanRunning } from '@/lib/etsy-scanner';
import { getAllScanRuns } from '@/lib/db';

// GET: scan status or history
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json(getScanStatus());
  }

  if (action === 'history') {
    return NextResponse.json(getAllScanRuns());
  }

  // Default: return status
  return NextResponse.json(getScanStatus());
}

// POST: start or cancel scan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'cancel') {
      if (!isScanRunning()) {
        return NextResponse.json({ error: 'No scan is running' }, { status: 400 });
      }
      cancelScan();
      return NextResponse.json({ message: 'Scan cancellation requested' });
    }

    // Default: start a new scan
    if (isScanRunning()) {
      return NextResponse.json({ error: 'A scan is already running' }, { status: 409 });
    }

    const result = startFullScan();
    return NextResponse.json({ message: 'Scan started', scanRunId: result.scanRunId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start scan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
