import { writeFileSync } from "fs";
import { buildCodedSpreadsheetSpec } from "../src/lib/factory-coded-spreadsheet-builder";
import { renderSpreadsheet } from "../src/lib/factory-spec-renderer";

async function main() {
  const result = buildCodedSpreadsheetSpec({
    niche: "wedding-planner",
    nicheLabel: "Wedding Planner",
    projectName: "Ultra Premium Wedding Planner",
    competitorTitle:
      "Wedding Planner Spreadsheet Wedding Budget Tracker Wedding Checklist Guest List Seating Plan Wedding Itinerary Gift Vendor Google Sheets",
    competitorDescription: `
      33 tabs included in the spreadsheet:
      SETUP, VENDOR, VENUE, BUDGET, FOOD & DRINKS, PHOTOS & VIDEOS,
      GUEST LIST, RECEPTION SEATING, REHEARSAL DINNER SEATING, REGISTRY,
      WEDDING PARTY, WEDDING PARTY GIFTS, CHECKLIST, ITINERARY, PACKING LIST,
      MOODBOARD, DECOR, FLORAL, ATTIRE & MAKEUP, ACCOMODATION, TRANSPORTATION,
      STATIONERY TRACKER, SAVE THE DATE, ACTIVITIES, MUSIC, SMART CALENDAR,
      DASHBOARD, WEDDING DAY BINDER, ENGAGEMENT PLANNER, BRIDAL SHOWER PLANNER,
      BACHELOR (ETTE) PLANNER, HONEYMOON PLANNER, GIFT & THANKS.
    `,
    competitorTags: [
      "Wedding Planner",
      "Wedding Spreadsheet",
      "Seating plan tracker",
      "Vendor research",
      "wedding budget",
      "guest list template",
      "wedding checklist",
    ],
  });

  if (!result) throw new Error("No coded spreadsheet result produced");

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
  const out = "/tmp/craftplan-coded-wedding-premium.xlsx";
  writeFileSync(out, rendered.buffer);
  console.log(
    `Rendered: ${out} tabs=${rendered.stats.tabs} cells=${rendered.stats.cells} formulas=${rendered.stats.formulas} charts=${rendered.stats.charts} cf=${rendered.stats.conditionalFormatRules} dv=${rendered.stats.dataValidations} skipped=${rendered.stats.skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
