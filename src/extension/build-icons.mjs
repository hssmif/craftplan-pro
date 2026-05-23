// ══════════════════════════════════════════════════════════════════════
// Extension icon generator
//
// Renders the new CraftPlan Research icon (amber-on-dark "signal bars"
// glyph) at 48px and 128px PNG via sharp's SVG-to-PNG rasterizer.
//
// Design: rounded-corner dark square with a 4-bar amber chart in the
// foreground — matches the popup header glyph for visual continuity.
// The chart shape suggests "real demand signal", contrasting with the
// old POD-scanner search-icon which was retired.
//
// Run via:    node src/extension/build-icons.mjs
// Or chained: node src/extension/build.mjs && node src/extension/build-icons.mjs
// ══════════════════════════════════════════════════════════════════════

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUT_DIR = "public/extension/icons";

/**
 * Build the SVG source for the icon at a given size. Everything is
 * percentage-based so it scales cleanly to any target dimension.
 */
function buildSvg(size) {
  // Tuning constants — derived from a 128px reference design,
  // then scaled proportionally for smaller sizes.
  const radius = Math.round(size * 0.22);
  const padX = Math.round(size * 0.22);

  // Four bar heights (% of size). Tallest in the middle gives a clean
  // chart silhouette without looking like a fixed crescendo.
  const barHeights = [0.30, 0.55, 0.40, 0.45];
  const barCount = barHeights.length;
  const innerWidth = size - 2 * padX;
  const barGap = Math.round(size * 0.04);
  const barWidth = Math.round((innerWidth - (barCount - 1) * barGap) / barCount);
  // Bars sit on a baseline ~78% down the icon
  const baseline = Math.round(size * 0.78);

  // A small dot above the tallest bar — a "live signal" indicator,
  // visually pinning the chart to the brand's pulse motif.
  const tallestIdx = barHeights.indexOf(Math.max(...barHeights));
  const dotX = padX + tallestIdx * (barWidth + barGap) + barWidth / 2;
  const dotY = baseline - Math.round(barHeights[tallestIdx] * size) - Math.round(size * 0.09);
  const dotR = Math.max(2, Math.round(size * 0.045));

  const bars = barHeights
    .map((h, i) => {
      const x = padX + i * (barWidth + barGap);
      const barH = Math.round(h * size);
      const y = baseline - barH;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="${Math.max(1, Math.round(size * 0.02))}" fill="#0a0a0f" opacity="0.85"/>`;
    })
    .join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Rounded amber gradient backdrop -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#fbbf24"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(size * 0.02)}" stdDeviation="${Math.round(size * 0.04)}" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="url(#bg)" filter="url(#shadow)"/>

  <!-- Glyph: amber chart bars on a darker plate -->
  <g>
    ${bars}
    <!-- Pulse dot above the tallest bar -->
    <circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="#0a0a0f" opacity="0.9"/>
    <circle cx="${dotX}" cy="${dotY}" r="${Math.max(1, dotR * 0.45)}" fill="#fff" opacity="0.85"/>
  </g>
</svg>`;
}

async function renderIcon(size) {
  const svg = buildSvg(size);
  const outPath = `${OUT_DIR}/icon${size}.png`;
  await mkdir(dirname(outPath), { recursive: true });
  // Write the SVG too — useful for debugging design tweaks later
  await writeFile(`${OUT_DIR}/icon${size}.svg`, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`✓ ${outPath}`);
}

(async () => {
  for (const size of [48, 128]) {
    await renderIcon(size);
  }
  console.log("✅ Extension icons regenerated");
})().catch((err) => {
  console.error("Icon build failed:", err);
  process.exit(1);
});
