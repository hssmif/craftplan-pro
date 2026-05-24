#!/usr/bin/env npx tsx
/**
 * THROWAWAY — exercises the REAL upstream blueprint path:
 *   competitor → generateBlueprint → assembleBlueprint → buildPremiumSpreadsheet
 *
 * Differs from scripts/test-existing-builder.ts which fabricates a 32-tab
 * blueprint by hand. This one runs the canonical wire used by the
 * /api/factory/blueprint route — no GEMINI_API_KEY is needed; the
 * Gemini calls fail and fall back to buildLocalAnalysis +
 * buildLocalNicheContent, which call getTabSetConfig("paycheck-budget").
 *
 * Verifies the 32-tab PAYCHECK_TABS extension lights up end-to-end and the
 * 4 rich tabs (Smart Calendar, Year in Review, AI Money Coach, What-If)
 * are routed through their dedicated builders.
 *
 * Writes /tmp/factory-budget-real.xlsx.
 */
import { writeFileSync } from "node:fs";
import { generateBlueprint, type CompetitorData } from "@/lib/factory-blueprint";
import { buildPremiumSpreadsheet } from "@/lib/factory-spreadsheet-builder";

async function main() {
  // Force the fallback path — we don't want Gemini in this test.
  delete process.env.GEMINI_API_KEY;

  const competitor: CompetitorData = {
    title: "Paycheck Budget Planner — Biweekly Tracker for Google Sheets & Excel",
    tags: ["paycheck", "budget", "biweekly", "planner", "google sheets", "spreadsheet"],
    price: 12.99,
    description: "Comprehensive paycheck-cycle budget planner with 32 tabs",
    niche: "paycheck-based budgeting",
  };
  const factoryRunId = `fr_real_${Date.now()}`;

  console.log("[test-real] Generating blueprint via canonical generateBlueprint() …");
  const blueprint = await generateBlueprint(competitor, factoryRunId);

  const richCount = blueprint.tabs.filter((t) => t.richLayout).length;
  console.log(
    `[test-real] Blueprint produced ${blueprint.tabs.length} tabs ` +
    `(${richCount} with richLayout)`
  );
  console.log("[test-real] Tab names:");
  blueprint.tabs.forEach((t, i) => {
    const tag = t.richLayout ? ` [rich:${t.richLayout}]` : "";
    console.log(`  ${i + 1}. ${t.name}${tag}`);
  });

  console.log("[test-real] Building premium spreadsheet …");
  const buf = await buildPremiumSpreadsheet(blueprint);
  const out = "/tmp/factory-budget-real.xlsx";
  writeFileSync(out, Buffer.from(buf));
  console.log(`[test-real] Wrote ${(buf.byteLength / 1024).toFixed(1)} KB to ${out}`);
}

main().catch((err) => {
  console.error("[test-real] FAILED:", err);
  process.exit(1);
});
