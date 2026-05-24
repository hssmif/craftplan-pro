import { NextRequest, NextResponse } from 'next/server';
import {
  createEtsyImport, updateEtsyImport, getEtsyImports, getEtsyImport,
  saveImportListings, saveImportKeywords,
  getImportListings, getImportKeywords,
  deleteEtsyImport, clearAllEtsyImports,
} from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: list imports or get single import with details
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const importRecord = getEtsyImport(parseInt(id, 10));
      if (!importRecord) {
        return NextResponse.json({ error: 'Import not found' }, { status: 404, headers: corsHeaders });
      }
      const listings = getImportListings(importRecord.id);
      const keywords = getImportKeywords(importRecord.id);
      return NextResponse.json({ import: importRecord, listings, keywords }, { headers: corsHeaders });
    }

    const imports = getEtsyImports();
    return NextResponse.json({ imports }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// POST: import listings and keywords from extension
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listings = [], keywords = [], import_id } = body;

    if (!Array.isArray(listings) && !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'Request must include listings array and/or keywords array' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate listings have required fields
    const validListings = (listings as Record<string, unknown>[]).filter(
      (l) => l.url && l.title
    );
    const validKeywords = (keywords as Record<string, unknown>[]).filter(
      (k) => k.keyword
    );

    // Create or reuse import batch
    let importId: number;
    if (import_id) {
      const existing = getEtsyImport(import_id);
      if (!existing) {
        return NextResponse.json({ error: 'Import batch not found' }, { status: 404, headers: corsHeaders });
      }
      importId = import_id;
    } else {
      importId = createEtsyImport('extension');
    }

    // Save with deduplication
    const listingResult = validListings.length > 0
      ? saveImportListings(importId, validListings)
      : { inserted: 0, deduped: 0 };

    const keywordResult = validKeywords.length > 0
      ? saveImportKeywords(importId, validKeywords)
      : { inserted: 0, deduped: 0 };

    // Update import record with totals
    const currentImport = getEtsyImport(importId);
    updateEtsyImport(importId, {
      listings_count: (currentImport?.listings_count || 0) + listingResult.inserted,
      keywords_count: (currentImport?.keywords_count || 0) + keywordResult.inserted,
      deduped_listings: (currentImport?.deduped_listings || 0) + listingResult.deduped,
      deduped_keywords: (currentImport?.deduped_keywords || 0) + keywordResult.deduped,
    });

    return NextResponse.json({
      success: true,
      import_id: importId,
      imported_listings: listingResult.inserted,
      imported_keywords: keywordResult.inserted,
      deduped_listings: listingResult.deduped,
      deduped_keywords: keywordResult.deduped,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE: delete one or more import batches, or clear all
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // comma-separated batch IDs

    if (id) {
      // Single batch delete
      const deleted = deleteEtsyImport(parseInt(id, 10));
      if (!deleted) {
        return NextResponse.json({ error: 'Import not found' }, { status: 404, headers: corsHeaders });
      }
      return NextResponse.json({ success: true, deleted: 1 }, { headers: corsHeaders });
    }

    if (ids) {
      // Bulk delete: ids=1,2,3
      const idList = ids.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      let deleted = 0;
      for (const batchId of idList) {
        if (deleteEtsyImport(batchId)) deleted++;
      }
      return NextResponse.json({ success: true, deleted }, { headers: corsHeaders });
    }

    // No id or ids = clear all
    const deleted = clearAllEtsyImports();
    return NextResponse.json({ success: true, deleted }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
