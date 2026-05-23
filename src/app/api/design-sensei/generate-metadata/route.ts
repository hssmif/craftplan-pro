// ── Design Sensei: Batch SEO Metadata Generator ──
// Generates optimized titles and tags for each design phrase.

import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const { keyword, phrases } = await req.json();
  if (!keyword || !phrases?.length) return NextResponse.json({ error: "keyword and phrases required" }, { status: 400 });

  // Process in batches of 15 to stay within token limits
  const batchSize = 15;
  const allMetadata: Array<{ title: string; tags: string[]; description: string }> = [];

  for (let i = 0; i < phrases.length; i += batchSize) {
    const batch = phrases.slice(i, i + batchSize);

    const prompt = `Generate SEO-optimized Etsy listing metadata for ${batch.length} POD (Print on Demand) designs in the "${keyword}" niche.

Designs:
${batch.map((p: { text: string }, idx: number) => `${idx + 1}. "${p.text}"`).join("\n")}

For EACH design, generate:
- title: Etsy listing title (max 140 chars) — include design text + product type + niche keywords
- tags: Array of 13 Etsy tags (each max 20 chars) — mix of long-tail, niche-specific, and trending search terms
- description: Short 1-sentence product description (for CSV export)

Etsy SEO rules:
- Front-load the most important keywords in the title
- Include "Funny", "Gift", shirt type, and occasion words where relevant
- Tags should be diverse: combine niche terms, gift occasions, product types, buyer intent
- NO duplicate tags within a listing

Return JSON only:
{
  "metadata": [
    {
      "title": "Funny Cat Mom Shirt - Best Cat Dad Gift Ideas - Cat Lover Tee",
      "tags": ["cat mom shirt", "cat lover gift", "funny cat tee", ...],
      "description": "Funny cat lover shirt perfect for cat moms and dads."
    }
  ]
}

Generate exactly ${batch.length} metadata entries in the same order as the designs.`;

    try {
      const text = await callGeminiJSON(apiKey, prompt);
      const result = parseGeminiJSON<{ metadata: Array<{ title: string; tags: string[]; description: string }> }>(text);
      allMetadata.push(...(result.metadata || []));
    } catch {
      // Fill with algorithmic fallbacks for failed batches
      for (const phrase of batch) {
        allMetadata.push(generateFallbackMetadata(keyword, (phrase as { text: string }).text));
      }
    }

    // Small delay between batches
    if (i + batchSize < phrases.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return NextResponse.json({ metadata: allMetadata, count: allMetadata.length });
}

function generateFallbackMetadata(keyword: string, phrase: string): { title: string; tags: string[]; description: string } {
  const kw = keyword.toLowerCase();
  const words = kw.split(/\s+/);
  return {
    title: `${phrase} - ${keyword} Shirt - Funny ${keyword} Gift Idea`,
    tags: [
      `${kw} shirt`, `${kw} gift`, `funny ${kw}`, `${kw} tee`,
      `${kw} lover`, `${kw} mom`, `${kw} dad`, `gift for ${kw}`,
      `${words[0]} tshirt`, `${kw} mug`, `${kw} design`, `pod design`, `trendy ${kw}`,
    ].slice(0, 13),
    description: `${phrase} - perfect for ${kw} lovers. Great gift idea.`,
  };
}
