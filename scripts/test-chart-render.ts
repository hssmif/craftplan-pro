// Throwaway smoke test for the chart pipeline.
// Renders a workbook with one of each chart type, saves to /tmp.
// Run: npx tsx scripts/test-chart-render.ts

import { writeFileSync } from "fs";
import { renderSpreadsheet } from "@/lib/factory-spec-renderer";
import type { SpreadsheetSpec } from "@/lib/factory-spreadsheet-spec";

const spec: SpreadsheetSpec = {
  workbook: {
    title: "Chart Smoke Test",
    paletteHex: ["5C7558", "9AAE94", "E5BAA8", "C9B8A0"],
    creator: "Craftplan Factory",
  },
  tabs: [
    {
      name: "Dashboard",
      tabColor: "5C7558",
      hideGridlines: true,
      columnWidths: [3, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14],
      rowHeights: { "2": 40 },
      cells: [
        {
          ref: "B2",
          value: "Chart Smoke Test",
          font: { name: "Georgia", size: 24, bold: true, color: "5C7558" },
        },
        { ref: "B4", value: "Column", font: { bold: true } },
        { ref: "F4", value: "Line", font: { bold: true } },
        { ref: "B20", value: "Doughnut", font: { bold: true } },
        { ref: "F20", value: "Bar", font: { bold: true } },
      ],
      charts: [
        {
          type: "column",
          title: "Monthly Income vs Expenses",
          dataRange: "Dashboard!B5:D17",
          anchor: { row: 5, col: 2 },
          size: { width: 480, height: 280 },
          seriesColors: ["5C7558", "E5BAA8"],
          legend: "b",
          data: {
            categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            series: [
              { name: "Income", values: [5800, 6200, 5800, 6800, 6200, 7100] },
              { name: "Expenses", values: [3200, 3800, 3500, 4100, 3700, 4200] },
            ],
          },
        },
        {
          type: "line",
          title: "Savings Trend",
          dataRange: "Dashboard!F5:F17",
          anchor: { row: 5, col: 7 },
          size: { width: 480, height: 280 },
          seriesColors: ["5C7558"],
          legend: "none",
          data: {
            categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            series: [{ name: "Saved", values: [800, 1200, 950, 1800, 1500, 2100] }],
          },
        },
        {
          type: "doughnut",
          title: "Spending Mix",
          dataRange: "Dashboard!B21:B30",
          anchor: { row: 21, col: 2 },
          size: { width: 480, height: 320 },
          seriesColors: ["5C7558", "9AAE94", "E5BAA8", "C9B8A0", "8B6232", "C9D4C5"],
          legend: "r",
          data: {
            categories: ["Housing", "Food", "Transport", "Bills", "Fun", "Other"],
            series: [{ name: "Spend", values: [1450, 620, 380, 540, 280, 195] }],
          },
        },
        {
          type: "bar",
          title: "By Category",
          dataRange: "Dashboard!F21:G30",
          anchor: { row: 21, col: 7 },
          size: { width: 480, height: 320 },
          seriesColors: ["E5BAA8"],
          legend: "none",
          data: {
            categories: ["Rent", "Groceries", "Insurance", "Subscriptions", "Dining", "Travel"],
            series: [{ name: "Annual", values: [17400, 7440, 2160, 1320, 3360, 2400] }],
          },
        },
      ],
    },
  ],
};

(async () => {
  const t0 = Date.now();
  const result = await renderSpreadsheet(spec);
  const out = "/tmp/factory-chart-smoke.xlsx";
  writeFileSync(out, result.buffer);
  console.log(`Saved: ${out} (${result.buffer.length.toLocaleString()} bytes)`);
  console.log(`Stats:`, result.stats);
  console.log(`Elapsed: ${Date.now() - t0}ms`);
})();
