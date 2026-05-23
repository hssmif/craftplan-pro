#!/usr/bin/env node
/**
 * Synthetic Goose PDF test harness.
 *
 * Builds a 51×80 pattern in a goose silhouette using the exact 11 DMC
 * codes / symbols / names from the NalaAndStitch "Goose With A Blue
 * Bow" reference, POSTs it to the running dev server's export route
 * (variant=bundle), and saves the 5 PDFs into /tmp/goose-pdf-test/.
 *
 * Run:  node scripts/test-goose-pdf.mjs
 * Prereq: dev server on http://localhost:3461
 */
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const PORT = 3461;
const OUT = "/tmp/goose-pdf-test";
fs.mkdirSync(OUT, { recursive: true });

// Exact 11 DMC colors from the reference (symbols are the NalaAndStitch
// Unicode glyphs — jsPDF's helvetica renders most of these as fallback
// glyphs, which is fine for structural verification).
const PALETTE = [
  { dmc: "19",   name: "Autumn Gold MD LT",  hex: "#e6b45a", symbol: "↗" },
  { dmc: "310",  name: "Black",              hex: "#000000", symbol: "↺" },
  { dmc: "322",  name: "Baby Blue DK",       hex: "#5d7fa8", symbol: "#" },
  { dmc: "434",  name: "Brown LT",           hex: "#996633", symbol: "%" },
  { dmc: "642",  name: "Beige Gray DK",      hex: "#a39680", symbol: "↦" },
  { dmc: "644",  name: "Beige Gray MD",      hex: "#d9cdb8", symbol: "♡" },
  { dmc: "803",  name: "Baby Blue UL VY DK", hex: "#2f4862", symbol: "@" },
  { dmc: "809",  name: "Delft Blue",         hex: "#7ea0c8", symbol: "δ" },
  { dmc: "822",  name: "Beige Gray LT",      hex: "#efe6d4", symbol: "£" },
  { dmc: "977",  name: "Golden Brown LT",    hex: "#d38e3c", symbol: "π" },
  { dmc: "3865", name: "Winter White",       hex: "#faf6ec", symbol: "R" },
];

const BG = null;                       // unstitched white aida
const W = 51;
const H = 80;

// Build a goose silhouette using simple geometric regions. Each stitched
// cell is tagged with a DMC code. The goal isn't fidelity to the Nala
// chart — it's giving the exporter a realistic 51×80 mixed-color grid
// so we can verify layout, pagination, legend, and metadata.
function dmcAt(x, y) {
  // normalise coords
  const cx = 25;           // body center x
  const cy = 40;           // body center y
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);

  // Body (oval)
  const bodyA = 18, bodyB = 22;
  const inBody = (dx * dx) / (bodyA * bodyA) + (dy * dy) / (bodyB * bodyB) <= 1;

  // Head (upper right circle)
  const hx = x - 36, hy = y - 16;
  const inHead = hx * hx + hy * hy <= 36;

  // Neck (diagonal strip connecting body to head)
  const neckT = (y - 20) / 14;
  const neckX = 28 + neckT * 6;
  const inNeck = y >= 20 && y <= 34 && Math.abs(x - neckX) <= 2;

  // Beak (tiny triangle right of head)
  if (y >= 13 && y <= 19 && x >= 40 && x <= 45 && (x - 40) <= (19 - y) + 5) {
    return "19"; // Autumn Gold
  }
  // Eye
  if (x === 39 && y === 14) return "310";

  // Bow (horizontal band under the head/neck)
  if (y >= 32 && y <= 40 && x >= 26 && x <= 42) {
    // Center knot = darker
    if (x >= 30 && x <= 35) return "803";
    if ((x + y) % 4 === 0) return "322";
    return "809";
  }

  // Boots (two vertical rectangles at the bottom)
  if (y >= 66 && y <= 79) {
    // left boot
    if (x >= 16 && x <= 23) {
      if (y >= 66 && y <= 68) return "977"; // boot cuff
      if (x === 19 || x === 20) return "322"; // boot highlight
      return "803";
    }
    // right boot
    if (x >= 27 && x <= 34) {
      if (y >= 66 && y <= 68) return "977";
      if (x === 30 || x === 31) return "322";
      return "803";
    }
  }

  if (inHead) {
    if (r > 5.5) return "642"; // shading edge
    return "3865"; // white feathers
  }
  if (inNeck) return "3865";
  if (inBody) {
    // wing detail
    if (x >= 12 && x <= 22 && y >= 38 && y <= 55) {
      if ((x + y) % 3 === 0) return "642";
      return "644";
    }
    // body shading (right edge)
    if (dx > 10) return "644";
    if (dx > 6) return "822";
    return "3865";
  }

  // Brown LT accent line (boot laces)
  if (y === 65 && (x === 19 || x === 20 || x === 30 || x === 31)) return "434";

  return null; // unstitched (aida)
}

// Build grid + counts
const grid = [];
const counts = new Map();
for (let y = 0; y < H; y++) {
  const row = [];
  for (let x = 0; x < W; x++) {
    const dmc = dmcAt(x, y);
    row.push(dmc || "");
    if (dmc) counts.set(dmc, (counts.get(dmc) || 0) + 1);
  }
  grid.push(row);
}

const colors = PALETTE.filter((p) => counts.has(p.dmc)).map((p) => ({
  dmc: p.dmc,
  name: p.name,
  hex: p.hex,
  symbol: p.symbol,
  count: counts.get(p.dmc),
}));

const totalStitches = [...counts.values()].reduce((a, b) => a + b, 0);

const pattern = {
  grid,
  colors,
  width: W,
  height: H,
  totalStitches,
  backgroundDmc: BG,
};

console.log(`[goose] built synthetic pattern:`);
console.log(`        ${W} × ${H}, ${colors.length} colors, ${totalStitches} stitches`);
console.log(`        palette: ${colors.map((c) => "D" + c.dmc).join(", ")}`);

// POST to the local dev server
const resp = await fetch(`http://localhost:${PORT}/api/cross-stitch/export-pdf`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    pattern,
    name: "Goose With A Blue Bow",
    variant: "bundle",
  }),
});

if (!resp.ok) {
  const txt = await resp.text();
  console.error(`[goose] export failed: ${resp.status}\n${txt.slice(0, 500)}`);
  process.exit(1);
}

const zipBuf = Buffer.from(await resp.arrayBuffer());
const zipPath = path.join(OUT, "goose-pattern-bundle.zip");
fs.writeFileSync(zipPath, zipBuf);
console.log(`[goose] ZIP saved: ${zipPath} (${(zipBuf.length / 1024).toFixed(1)} KB)`);

// Extract PDFs
const entries = unzipSync(new Uint8Array(zipBuf));
for (const [name, data] of Object.entries(entries)) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, data);
  console.log(`[goose]   → ${name} (${(data.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n[goose] done. Open ${OUT}/ to inspect all 5 PDFs.`);
