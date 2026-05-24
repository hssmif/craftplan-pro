// Throwaway test script — NOT for production.
// Runs the new OpenAI spec generator + renderer end-to-end and
// saves the .xlsx to /tmp/openai-test-budget.xlsx for visual review.
//
// Usage:
//   OPENAI_API_KEY=sk-... npx tsx scripts/test-openai-spec.ts

// Minimal env loader (no dotenv dep) — reads .env.local and .env into process.env
import { readFileSync, writeFileSync, existsSync } from "fs";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}
loadEnv(".env.local");
loadEnv(".env");
import { generateSpreadsheetSpec } from "../src/lib/factory-openai-spec-generator";
import { renderSpreadsheet } from "../src/lib/factory-spec-renderer";

async function main() {
  console.log("🧠 Generating spec via OpenAI...");
  const t0 = Date.now();
  const { spec, modelUsed, elapsedMs } = await generateSpreadsheetSpec({
    niche: "paycheck-budget",
    nicheLabel: "Paycheck Budget",
    projectName: "The Ultimate Paycheck Budget",
    competitorTitle:
      "Ultimate Annual Budget Spreadsheet Excel Google Sheets Budget Template Monthly Budget Tracker Financial Planner Bill Tracker Debt Tracker",
    competitorTags: [
      "budget tracker", "google sheets", "monthly budget", "paycheck",
      "savings tracker", "bill tracker", "debt tracker", "financial planner",
    ],
    competitorPrice: 12.95,
    positioning:
      "A premium 28-tab paycheck budget with automated dashboards and zero copy-paste required.",
  });
  console.log(
    `   spec ready in ${elapsedMs}ms (model: ${modelUsed}, tabs: ${spec.tabs.length})`,
  );

  console.log("📊 Rendering to .xlsx...");
  const t1 = Date.now();
  const { buffer, stats } = await renderSpreadsheet(spec);
  console.log(
    `   render done in ${Date.now() - t1}ms — tabs=${stats.tabs} cells=${stats.cells} formulas=${stats.formulas} charts=${stats.charts} CF=${stats.conditionalFormatRules} DV=${stats.dataValidations} skipped=${stats.skipped}`,
  );

  const outPath = "/tmp/openai-test-budget.xlsx";
  writeFileSync(outPath, buffer);
  console.log(`💾 Saved: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`🏁 Total: ${Date.now() - t0}ms`);

  // Print tab list for sanity
  console.log("\n📋 Tabs produced:");
  for (const t of spec.tabs) {
    console.log(`   - ${t.name} (${t.cells.length} cells, ${t.charts?.length ?? 0} charts)`);
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
