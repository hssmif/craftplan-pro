import { writeFileSync } from "fs";
import { buildCodedSpreadsheetSpec } from "../src/lib/factory-coded-spreadsheet-builder";
import { renderSpreadsheet } from "../src/lib/factory-spec-renderer";

async function main() {
  const result = buildCodedSpreadsheetSpec({
    niche: "monthly budget sheets paycheck budget annual budget planner",
    nicheLabel: "Monthly Budget Sheets",
    projectName: "The Ultimate Automated Budget Planner",
    competitorTitle:
      "Ultimate Annual Budget Spreadsheet Excel Google Sheets Monthly Budget Debt Tracker Bill Calendar Savings Tracker",
    competitorDescription:
      "Recurring automations, dashboard, monthly budget, paycheck view, transaction log, savings, debt, smart calendar, annual review.",
    competitorTags: [
      "budget planner",
      "google sheets",
      "excel budget",
      "paycheck budget",
      "monthly budget",
      "debt tracker",
      "bill calendar",
    ],
  });

  if (!result) throw new Error("No coded budget spreadsheet result produced");

  const spec = result.spec;
  const formulaCount = spec.tabs.reduce(
    (sum, tab) => sum + tab.cells.filter((cell) => cell.formula).length,
    0,
  );
  const cellCount = spec.tabs.reduce((sum, tab) => sum + tab.cells.length, 0);
  const chartCount = spec.tabs.reduce((sum, tab) => sum + (tab.charts?.length ?? 0), 0);
  console.log(
    `Spec: ${result.engineId} tabs=${spec.tabs.length} cells=${cellCount} formulas=${formulaCount} charts=${chartCount}`,
  );
  console.log(spec.tabs.map((tab) => tab.name).join(" | "));

  const rendered = await renderSpreadsheet(spec);
  const out = "/tmp/craftplan-coded-budget-premium.xlsx";
  writeFileSync(out, rendered.buffer);
  console.log(
    `Rendered: ${out} tabs=${rendered.stats.tabs} cells=${rendered.stats.cells} formulas=${rendered.stats.formulas} charts=${rendered.stats.charts} cf=${rendered.stats.conditionalFormatRules} dv=${rendered.stats.dataValidations} skipped=${rendered.stats.skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
