// ═══ Etsy CTR Thumbnail Builder ════════════════════════════════════
// Generates high-CTR listing thumbnails with text overlays + collages
// Goal: Fix 0.74% CTR → target 3%+ with SET OF N, INSTANT DOWNLOAD, size badges

import sharp from "sharp";

export type ThumbnailStyle =
  | "hero-badges"       // Single hero image + text badge overlay bar
  | "collage-2x2"       // 4-up grid of variants with text overlay
  | "before-after"      // Mockup + clean pattern side by side
  | "size-chart"        // Image + size chart visualization
  | "bundle-deal";      // Multiple designs in one listing look

export interface ThumbnailOptions {
  /** Base image(s) as base64 or data URL. First image is the hero. */
  images: string[];
  /** Thumbnail style preset */
  style?: ThumbnailStyle;
  /** Badge text options — auto-chosen based on style if omitted */
  badges?: {
    topLeft?: string;     // e.g. "INSTANT DOWNLOAD"
    topRight?: string;    // e.g. "SET OF 3"
    bottomLeft?: string;  // e.g. "6 SIZES"
    bottomRight?: string; // e.g. "PRINTABLE"
    bottomBar?: string;   // full-width bottom banner, e.g. "INSTANT DOWNLOAD • 6 SIZES • 2026 HIT"
  };
  /** Optional theme color (hex, e.g. "#F1641E"). Default: Etsy clementine. */
  accentColor?: string;
  /** Width/height in pixels. Default: 2000x2000 (Etsy requires 2000×2000 min) */
  width?: number;
  height?: number;
}

/** Strip data URL prefix if present */
function stripDataUrl(s: string): string {
  return s.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
}

/** Decode base64 string to Buffer */
function decodeImage(b64: string): Buffer {
  return Buffer.from(stripDataUrl(b64), "base64");
}

/** Escape text for safe SVG embedding */
function svgEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a rounded-corner pill badge SVG */
function badgeSVG(
  text: string,
  x: number,
  y: number,
  opts: { bg: string; fg: string; fontSize?: number } = { bg: "#F1641E", fg: "#fff" },
): string {
  const fs = opts.fontSize || 48;
  const padX = 32;
  const padY = 18;
  // Rough char width estimate for centering
  const charWidth = fs * 0.58;
  const textWidth = text.length * charWidth;
  const w = textWidth + padX * 2;
  const h = fs + padY * 2;

  return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${opts.bg}" />
      <text x="${w / 2}" y="${h / 2 + fs / 3}" font-family="Impact, Arial Black, Arial, sans-serif"
        font-size="${fs}" font-weight="900" fill="${opts.fg}" text-anchor="middle"
        letter-spacing="1.5">${svgEscape(text.toUpperCase())}</text>
    </g>
  `;
}

/** Build a full-width bottom banner SVG */
function bottomBannerSVG(
  text: string,
  width: number,
  yTop: number,
  opts: { bg: string; fg: string; fontSize?: number } = { bg: "#000", fg: "#fff" },
): string {
  const fs = opts.fontSize || 72;
  const h = fs + 60;
  return `
    <g transform="translate(0, ${yTop})">
      <rect x="0" y="0" width="${width}" height="${h}" fill="${opts.bg}" />
      <text x="${width / 2}" y="${h / 2 + fs / 3}" font-family="Impact, Arial Black, Arial, sans-serif"
        font-size="${fs}" font-weight="900" fill="${opts.fg}" text-anchor="middle"
        letter-spacing="4">${svgEscape(text.toUpperCase())}</text>
    </g>
  `;
}

// ─── Style: Hero + Badges ──────────────────────────────────────────
async function buildHeroBadges(opts: ThumbnailOptions): Promise<Buffer> {
  const W = opts.width || 2000;
  const H = opts.height || 2000;
  const accent = opts.accentColor || "#F1641E";

  // Resize hero image to fill canvas
  const heroBuf = decodeImage(opts.images[0]);
  const hero = await sharp(heroBuf)
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();

  const badges = opts.badges || {};
  const bannerText = badges.bottomBar || "INSTANT DOWNLOAD • PRINTABLE • HIGH RESOLUTION";

  const bannerHeight = 140;
  const bannerY = H - bannerHeight;
  const topStripHeight = 180;

  // Build SVG overlay with gradient strips for legibility
  const overlaySvg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <!-- Top dark gradient so white text stays readable -->
      <rect x="0" y="0" width="${W}" height="${topStripHeight}" fill="url(#topFade)"/>
      <!-- Top badges -->
      ${badges.topLeft ? badgeSVG(badges.topLeft, 50, 50, { bg: accent, fg: "#000", fontSize: 64 }) : ""}
      ${badges.topRight ? (() => {
        const text = badges.topRight!;
        const fs = 64;
        const charWidth = fs * 0.58;
        const textWidth = text.length * charWidth;
        const w = textWidth + 64;
        return badgeSVG(text, W - w - 50, 50, { bg: "#000", fg: "#fff", fontSize: fs });
      })() : ""}
      <!-- Bottom chips on their own dark strip so they pop -->
      ${(badges.bottomLeft || badges.bottomRight) ? `<rect x="0" y="${bannerY - 130}" width="${W}" height="110" fill="#000" opacity="0.4"/>` : ""}
      ${badges.bottomLeft ? badgeSVG(badges.bottomLeft, 50, bannerY - 115, { bg: accent, fg: "#000", fontSize: 52 }) : ""}
      ${badges.bottomRight ? (() => {
        const text = badges.bottomRight!;
        const fs = 52;
        const charWidth = fs * 0.58;
        const textWidth = text.length * charWidth;
        const w = textWidth + 64;
        return badgeSVG(text, W - w - 50, bannerY - 115, { bg: "#fff", fg: "#000", fontSize: fs });
      })() : ""}
      <!-- Bottom banner (bigger + accent border on top for visual hit) -->
      <rect x="0" y="${bannerY - 8}" width="${W}" height="8" fill="${accent}"/>
      ${bottomBannerSVG(bannerText, W, bannerY, { bg: "#000", fg: "#fff", fontSize: 84 })}
    </svg>
  `;

  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  return sharp(hero)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Style: 2x2 Collage ────────────────────────────────────────────
async function buildCollage2x2(opts: ThumbnailOptions): Promise<Buffer> {
  const W = opts.width || 2000;
  const H = opts.height || 2000;
  const accent = opts.accentColor || "#F1641E";

  // We want up to 4 images. If fewer, reuse the first.
  const imgs = opts.images.slice(0, 4);
  while (imgs.length < 4) imgs.push(opts.images[0]);

  const cellSize = Math.floor(W / 2);
  const cells = await Promise.all(
    imgs.map((i) =>
      sharp(decodeImage(i))
        .resize(cellSize, cellSize, { fit: "cover", position: "centre" })
        .toBuffer(),
    ),
  );

  // White canvas base with small gutter
  const gutter = 12;
  const canvas = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });

  const composites = [
    { input: cells[0], left: 0, top: 0 },
    { input: cells[1], left: cellSize + gutter, top: 0 },
    { input: cells[2], left: 0, top: cellSize + gutter },
    { input: cells[3], left: cellSize + gutter, top: cellSize + gutter },
  ];

  const collaged = await canvas.composite(composites).png().toBuffer();

  // Add center badge if any badge text exists
  const badges = opts.badges || {};
  const centerText = badges.bottomBar || badges.topLeft || "SET OF 4";

  const centerFs = 100;
  const centerCharWidth = centerFs * 0.58;
  const centerWidth = centerText.length * centerCharWidth + 80;
  const centerHeight = centerFs + 40;

  const overlaySvg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Center badge -->
      <g transform="translate(${(W - centerWidth) / 2}, ${(H - centerHeight) / 2})">
        <rect x="0" y="0" width="${centerWidth}" height="${centerHeight}" rx="${centerHeight / 2}" fill="${accent}" stroke="#000" stroke-width="6"/>
        <text x="${centerWidth / 2}" y="${centerHeight / 2 + centerFs / 3}" font-family="Impact, Arial Black, Arial, sans-serif"
          font-size="${centerFs}" font-weight="900" fill="#000" text-anchor="middle"
          letter-spacing="4">${svgEscape(centerText.toUpperCase())}</text>
      </g>
      <!-- Corner badges -->
      ${badges.topLeft && badges.topLeft !== centerText ? badgeSVG(badges.topLeft, 40, 40, { bg: "#000", fg: "#fff", fontSize: 44 }) : ""}
      ${badges.topRight ? (() => {
        const t = badges.topRight!;
        const fs = 44;
        const cw = fs * 0.58;
        const bw = t.length * cw + 64;
        return badgeSVG(t, W - bw - 40, 40, { bg: accent, fg: "#000", fontSize: fs });
      })() : ""}
    </svg>
  `;

  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  return sharp(collaged)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Style: Before/After (or pattern + mockup) ─────────────────────
async function buildBeforeAfter(opts: ThumbnailOptions): Promise<Buffer> {
  const W = opts.width || 2000;
  const H = opts.height || 2000;
  const accent = opts.accentColor || "#F1641E";

  const imgs = opts.images.slice(0, 2);
  while (imgs.length < 2) imgs.push(opts.images[0]);

  const cellW = Math.floor(W / 2);
  const left = await sharp(decodeImage(imgs[0]))
    .resize(cellW, H, { fit: "cover", position: "centre" })
    .toBuffer();
  const right = await sharp(decodeImage(imgs[1]))
    .resize(cellW, H, { fit: "cover", position: "centre" })
    .toBuffer();

  const canvas = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });

  const merged = await canvas
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: cellW, top: 0 },
    ])
    .png()
    .toBuffer();

  const badges = opts.badges || {};
  const bannerText = badges.bottomBar || "INSTANT DOWNLOAD • PRINTABLE";
  const bannerHeight = 72 + 60;
  const bannerY = H - bannerHeight;

  const overlaySvg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Divider line -->
      <line x1="${cellW}" y1="0" x2="${cellW}" y2="${H}" stroke="#fff" stroke-width="8"/>
      <!-- Corner labels -->
      ${badgeSVG(badges.topLeft || "PATTERN", 40, 40, { bg: "#000", fg: "#fff", fontSize: 44 })}
      ${(() => {
        const t = badges.topRight || "MOCKUP";
        const fs = 44;
        const cw = fs * 0.58;
        const bw = t.length * cw + 64;
        return badgeSVG(t, W - bw - 40, 40, { bg: accent, fg: "#000", fontSize: fs });
      })()}
      ${bottomBannerSVG(bannerText, W, bannerY, { bg: "#000", fg: "#fff", fontSize: 72 })}
    </svg>
  `;

  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  return sharp(merged)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Style: Size Chart ─────────────────────────────────────────────
async function buildSizeChart(opts: ThumbnailOptions): Promise<Buffer> {
  const W = opts.width || 2000;
  const H = opts.height || 2000;
  const accent = opts.accentColor || "#F1641E";

  // Left half: hero art, right half: size chart visualization
  const heroW = Math.floor(W * 0.5);
  const hero = await sharp(decodeImage(opts.images[0]))
    .resize(heroW, H, { fit: "cover", position: "centre" })
    .toBuffer();

  const canvas = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 248, g: 245, b: 240, alpha: 1 } },
  });
  const base = await canvas.composite([{ input: hero, left: 0, top: 0 }]).png().toBuffer();

  // Build size chart SVG on the right half (showing 6 print sizes)
  const chartSvg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${heroW + (W - heroW) / 2}" y="180" font-family="Impact, Arial Black, Arial, sans-serif"
        font-size="96" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="3">6 SIZES INCLUDED</text>
      <line x1="${heroW + 100}" y1="230" x2="${W - 100}" y2="230" stroke="${accent}" stroke-width="8"/>

      <!-- Size squares nested -->
      <g transform="translate(${heroW + 100}, 340)">
        ${[
          { w: 800, h: 1000, label: '20×30"' },
          { w: 640, h: 800, label: '16×24"' },
          { w: 480, h: 600, label: '12×18"' },
          { w: 320, h: 400, label: '8×12"' },
          { w: 240, h: 300, label: '6×9"' },
          { w: 160, h: 200, label: '4×6"' },
        ]
          .map((s, i) => {
            const cx = 400;
            return `
              <rect x="${cx - s.w / 2}" y="${50 + i * 10}" width="${s.w}" height="${s.h}"
                fill="none" stroke="${i === 0 ? accent : "#222"}" stroke-width="${i === 0 ? 10 : 4}"
                opacity="${1 - i * 0.08}"/>
            `;
          })
          .join("")}
      </g>

      <!-- Bottom banner -->
      ${bottomBannerSVG("INSTANT DOWNLOAD • PRINTABLE • HIGH RES", W, H - 132, { bg: "#000", fg: "#fff", fontSize: 64 })}
    </svg>
  `;

  const overlayBuf = await sharp(Buffer.from(chartSvg)).png().toBuffer();

  return sharp(base)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Style: Bundle Deal ────────────────────────────────────────────
async function buildBundleDeal(opts: ThumbnailOptions): Promise<Buffer> {
  const W = opts.width || 2000;
  const H = opts.height || 2000;
  const accent = opts.accentColor || "#F1641E";
  const count = Math.max(2, Math.min(opts.images.length, 6));

  // Hero on top-left (big), others tiled on right + bottom
  const heroSize = Math.floor(W * 0.6);
  const hero = await sharp(decodeImage(opts.images[0]))
    .resize(heroSize, heroSize, { fit: "cover", position: "centre" })
    .toBuffer();

  const smallSize = Math.floor((W - heroSize) / 1);
  const rightThumbs = await Promise.all(
    opts.images.slice(1, 4).map((i) =>
      sharp(decodeImage(i))
        .resize(smallSize, Math.floor(heroSize / 3) - 8, { fit: "cover", position: "centre" })
        .toBuffer(),
    ),
  );

  const bottomRowH = H - heroSize;
  const bottomThumbSize = Math.floor(W / 4);
  const bottomThumbs = await Promise.all(
    opts.images.slice(1, 5).map((i) =>
      sharp(decodeImage(i))
        .resize(bottomThumbSize - 8, bottomRowH - 16, { fit: "cover", position: "centre" })
        .toBuffer(),
    ),
  );

  const canvas = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });

  const composites: sharp.OverlayOptions[] = [{ input: hero, left: 0, top: 0 }];

  // Right column thumbs
  rightThumbs.forEach((buf, i) => {
    composites.push({
      input: buf,
      left: heroSize + 8,
      top: i * Math.floor(heroSize / 3),
    });
  });

  // Bottom row thumbs
  bottomThumbs.forEach((buf, i) => {
    composites.push({
      input: buf,
      left: i * bottomThumbSize + 4,
      top: heroSize + 8,
    });
  });

  const composed = await canvas.composite(composites).png().toBuffer();

  const overlaySvg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- SET OF N big badge top-left -->
      <g transform="translate(40, 40)">
        <rect x="0" y="0" width="420" height="140" rx="70" fill="${accent}" stroke="#000" stroke-width="8"/>
        <text x="210" y="100" font-family="Impact, Arial Black, Arial, sans-serif"
          font-size="88" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="3">SET OF ${count}</text>
      </g>
      ${bottomBannerSVG("INSTANT DOWNLOAD • BUNDLE • PRINTABLE", W, H - 132, { bg: "#000", fg: "#fff", fontSize: 64 })}
    </svg>
  `;

  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  return sharp(composed)
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Public entry point ────────────────────────────────────────────
export async function buildThumbnail(opts: ThumbnailOptions): Promise<Buffer> {
  if (!opts.images || opts.images.length === 0) {
    throw new Error("At least one image is required");
  }

  const style = opts.style || "hero-badges";

  switch (style) {
    case "collage-2x2":
      return buildCollage2x2(opts);
    case "before-after":
      return buildBeforeAfter(opts);
    case "size-chart":
      return buildSizeChart(opts);
    case "bundle-deal":
      return buildBundleDeal(opts);
    case "hero-badges":
    default:
      return buildHeroBadges(opts);
  }
}

/** Convenience: return all 5 style variants as base64 data URLs. */
export async function buildAllThumbnailVariants(
  images: string[],
  badges?: ThumbnailOptions["badges"],
  accentColor?: string,
): Promise<{ style: ThumbnailStyle; dataUrl: string }[]> {
  const styles: ThumbnailStyle[] = [
    "hero-badges",
    "collage-2x2",
    "before-after",
    "size-chart",
    "bundle-deal",
  ];

  const results = await Promise.all(
    styles.map(async (style) => {
      try {
        const buf = await buildThumbnail({ images, style, badges, accentColor });
        return { style, dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
      } catch (e) {
        console.error(`[thumbnail-builder] ${style} failed:`, e);
        return null;
      }
    }),
  );

  return results.filter((r): r is { style: ThumbnailStyle; dataUrl: string } => r !== null);
}
