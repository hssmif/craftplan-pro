// ══════════════════════════════════════════════════════════════
// Shared Canvas-Based Product Mockup Renderer
// Draws professional product mockups with user designs.
// Used by Design Sensei (batch mockups) and POD Builder (preview).
// ══════════════════════════════════════════════════════════════

// ── Fabric color system ──

export interface FabricColor {
  id: string;
  label: string;
  hex: string;
  highlight: string;
  shadow: string;
  isDark: boolean;
}

export const FABRIC_COLORS: FabricColor[] = [
  { id: "white", label: "White", hex: "#fafafa", highlight: "#fff", shadow: "#e0e0e0", isDark: false },
  { id: "black", label: "Black", hex: "#1a1a1a", highlight: "#2d2d2d", shadow: "#0d0d0d", isDark: true },
  { id: "navy", label: "Navy", hex: "#1b2845", highlight: "#263552", shadow: "#0f1a2e", isDark: true },
  { id: "heather", label: "Heather Gray", hex: "#b0b0b0", highlight: "#c0c0c0", shadow: "#909090", isDark: false },
  { id: "red", label: "Red", hex: "#8b1a1a", highlight: "#a52525", shadow: "#5c1111", isDark: true },
];

// ── Product types ──

export type MockupProduct = "T-Shirt" | "Hoodie" | "Mug" | "Tote Bag" | "Poster";

export const MOCKUP_PRODUCTS: MockupProduct[] = [
  "T-Shirt", "Hoodie", "Mug", "Tote Bag", "Poster",
];

export const PRODUCT_TO_PRINTFUL_ID: Record<MockupProduct, number> = {
  "T-Shirt": 71,
  "Hoodie": 380,
  "Mug": 19,
  "Tote Bag": 83,
  "Poster": 1,
};

// ── Canvas helpers ──

export function _rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function _bg(ctx: CanvasRenderingContext2D, S: number, tint = "#f2f2f2") {
  const g = ctx.createRadialGradient(S * 0.48, S * 0.42, S * 0.04, S * 0.5, S * 0.5, S * 0.78);
  g.addColorStop(0, tint);
  g.addColorStop(1, "#ddd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

export function _print(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r = 5) {
  ctx.save();
  _rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// ── Product renderers ──

export function _apparel(ctx: CanvasRenderingContext2D, d: HTMLImageElement, product: string, S: number, color?: FabricColor) {
  const cx = S / 2;
  // Use provided color, or derive from product name
  const fc = color || (product === "Hoodie"
    ? FABRIC_COLORS.find(c => c.id === "black")!
    : FABRIC_COLORS.find(c => c.id === "white")!);
  const base = fc.hex, hi = fc.highlight, lo = fc.shadow;
  const isDark = fc.isDark;

  _bg(ctx, S);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 14;
  // T-shirt silhouette
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.10, S * 0.14);
  ctx.bezierCurveTo(cx - S * 0.16, S * 0.12, cx - S * 0.22, S * 0.115, cx - S * 0.28, S * 0.13);
  ctx.bezierCurveTo(cx - S * 0.35, S * 0.14, cx - S * 0.42, S * 0.16, cx - S * 0.44, S * 0.24);
  ctx.bezierCurveTo(cx - S * 0.43, S * 0.30, cx - S * 0.38, S * 0.32, cx - S * 0.30, S * 0.30);
  ctx.bezierCurveTo(cx - S * 0.27, S * 0.29, cx - S * 0.25, S * 0.31, cx - S * 0.24, S * 0.34);
  ctx.bezierCurveTo(cx - S * 0.23, S * 0.52, cx - S * 0.22, S * 0.70, cx - S * 0.24, S * 0.84);
  ctx.quadraticCurveTo(cx - S * 0.20, S * 0.86, cx, S * 0.86);
  ctx.quadraticCurveTo(cx + S * 0.20, S * 0.86, cx + S * 0.24, S * 0.84);
  ctx.bezierCurveTo(cx + S * 0.22, S * 0.70, cx + S * 0.23, S * 0.52, cx + S * 0.24, S * 0.34);
  ctx.bezierCurveTo(cx + S * 0.25, S * 0.31, cx + S * 0.27, S * 0.29, cx + S * 0.30, S * 0.30);
  ctx.bezierCurveTo(cx + S * 0.38, S * 0.32, cx + S * 0.43, S * 0.30, cx + S * 0.44, S * 0.24);
  ctx.bezierCurveTo(cx + S * 0.42, S * 0.16, cx + S * 0.35, S * 0.14, cx + S * 0.28, S * 0.13);
  ctx.bezierCurveTo(cx + S * 0.22, S * 0.115, cx + S * 0.16, S * 0.12, cx + S * 0.10, S * 0.14);
  ctx.quadraticCurveTo(cx + S * 0.04, S * 0.20, cx, S * 0.22);
  ctx.quadraticCurveTo(cx - S * 0.04, S * 0.20, cx - S * 0.10, S * 0.14);
  ctx.closePath();
  // Fabric gradient
  const gr = ctx.createLinearGradient(cx - S * 0.3, S * 0.08, cx + S * 0.15, S * 0.90);
  gr.addColorStop(0, hi); gr.addColorStop(0.35, base); gr.addColorStop(1, lo);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.shadowColor = "transparent";
  // Center fold
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, S * 0.24); ctx.lineTo(cx, S * 0.83); ctx.stroke();
  // Collar stitching
  ctx.strokeStyle = isDark ? "#444" : "#d5d5d5";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.09, S * 0.15);
  ctx.quadraticCurveTo(cx, S * 0.225, cx + S * 0.09, S * 0.15);
  ctx.stroke();
  // Shoulder seams
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.12, S * 0.135); ctx.lineTo(cx - S * 0.29, S * 0.135);
  ctx.moveTo(cx + S * 0.12, S * 0.135); ctx.lineTo(cx + S * 0.29, S * 0.135);
  ctx.stroke();
  ctx.restore();
  // Design print
  const dw = S * 0.28, dh = S * 0.28;
  _print(ctx, d, cx - dw / 2, S * 0.31, dw, dh, 6);
}

export function _mug(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  _bg(ctx, S);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.14)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  const bx = S * 0.17, by = S * 0.16, bw = S * 0.50, bh = S * 0.64;
  _rr(ctx, bx, by, bw, bh, 12);
  const mg = ctx.createLinearGradient(bx, by, bx + bw, by);
  mg.addColorStop(0, "#f0f0f0"); mg.addColorStop(0.45, "#fff"); mg.addColorStop(1, "#e8e8e8");
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.shadowColor = "transparent";
  // Rim
  const rimG = ctx.createLinearGradient(bx, by, bx + bw, by);
  rimG.addColorStop(0, "#e0e0e0"); rimG.addColorStop(0.5, "#f5f5f5"); rimG.addColorStop(1, "#ddd");
  ctx.fillStyle = rimG;
  _rr(ctx, bx, by, bw, S * 0.025, 6);
  ctx.fill();
  // Handle
  ctx.strokeStyle = "#d8d8d8";
  ctx.lineWidth = S * 0.032;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx + bw - 2, S * 0.32);
  ctx.bezierCurveTo(S * 0.82, S * 0.30, S * 0.84, S * 0.68, bx + bw - 2, S * 0.66);
  ctx.stroke();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = S * 0.015;
  ctx.beginPath();
  ctx.moveTo(bx + bw, S * 0.34);
  ctx.bezierCurveTo(S * 0.80, S * 0.33, S * 0.81, S * 0.65, bx + bw, S * 0.64);
  ctx.stroke();
  ctx.restore();
  const dw = bw * 0.70, dh = bh * 0.58;
  _print(ctx, d, bx + (bw - dw) / 2, by + bh * 0.20, dw, dh, 5);
}

export function _wallArt(ctx: CanvasRenderingContext2D, d: HTMLImageElement, product: string, S: number) {
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
  bg.addColorStop(0, "#f0ebe4"); bg.addColorStop(1, "#ddd5cb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 12;
  const fw = S * 0.68, fh = S * 0.68;
  const fx = (S - fw) / 2, fy = (S - fh) / 2 - S * 0.02;
  if (product === "Canvas") {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(fx - 5, fy - 5, fw + 10, fh + 10);
    ctx.shadowColor = "transparent";
    ctx.drawImage(d, fx, fy, fw, fh);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, fw, fh);
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx - 3, fy - 3, fw + 6, fh + 6);
    ctx.shadowColor = "transparent";
    ctx.drawImage(d, fx, fy, fw, fh);
  }
  ctx.restore();
}

export function _framed(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
  bg.addColorStop(0, "#f0ebe4"); bg.addColorStop(1, "#ddd5cb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  const frameW = S * 0.04, matW = S * 0.05;
  const fw = S * 0.72, fh = S * 0.72;
  const fx = (S - fw) / 2, fy = (S - fh) / 2 - S * 0.01;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#2a2015";
  ctx.fillRect(fx, fy, fw, fh);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#3d3020";
  ctx.fillRect(fx + 3, fy + 3, fw - 6, fh - 6);
  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(fx + frameW, fy + frameW, fw - frameW * 2, fh - frameW * 2);
  const ax = fx + frameW + matW, ay = fy + frameW + matW;
  ctx.drawImage(d, ax, ay, fw - (frameW + matW) * 2, fh - (frameW + matW) * 2);
  ctx.restore();
}

export function _phone(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  _bg(ctx, S);
  const cx = S / 2, pw = S * 0.42, ph = S * 0.78;
  const px = cx - pw / 2, py = (S - ph) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.20)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  _rr(ctx, px, py, pw, ph, S * 0.04);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.shadowColor = "transparent";
  const m = S * 0.012;
  ctx.save();
  _rr(ctx, px + m, py + m * 1.5, pw - m * 2, ph - m * 3, S * 0.032);
  ctx.clip();
  ctx.drawImage(d, px + m, py + m * 1.5, pw - m * 2, ph - m * 3);
  ctx.restore();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(px + pw * 0.28, py + S * 0.05, S * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a2a";
  ctx.beginPath();
  ctx.arc(px + pw * 0.28, py + S * 0.05, S * 0.013, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function _tote(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  _bg(ctx, S);
  const cx = S / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.14)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  // Handles
  ctx.strokeStyle = "#c4b89a";
  ctx.lineWidth = S * 0.014;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * S * 0.13, S * 0.22);
    ctx.quadraticCurveTo(cx + side * S * 0.13, S * 0.11, cx + side * S * 0.04, S * 0.11);
    ctx.quadraticCurveTo(cx, S * 0.11, cx - side * S * 0.04, S * 0.11);
    ctx.stroke();
  }
  // Bag body
  const bw = S * 0.56, bh = S * 0.64, bx = cx - bw / 2, by = S * 0.21;
  _rr(ctx, bx, by, bw, bh, 6);
  const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
  bg.addColorStop(0, "#f5f0e6"); bg.addColorStop(1, "#e5ddd0");
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.restore();
  const dw = bw * 0.68, dh = bh * 0.52;
  _print(ctx, d, cx - dw / 2, by + bh * 0.14, dw, dh, 5);
}

export function _notebook(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  _bg(ctx, S);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  const nw = S * 0.52, nh = S * 0.72, nx = S * 0.28, ny = (S - nh) / 2;
  _rr(ctx, nx, ny, nw, nh, 5);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  _rr(ctx, nx + 2, ny + 2, nw - 4, nh - 4, 4);
  ctx.clip();
  ctx.drawImage(d, nx + 2, ny + 2, nw - 4, nh - 4);
  ctx.restore();
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 14; i++) {
    const sy = ny + (nh / 15) * i;
    ctx.beginPath();
    ctx.arc(nx - S * 0.015, sy, S * 0.013, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function _sticker(ctx: CanvasRenderingContext2D, d: HTMLImageElement, S: number) {
  _bg(ctx, S);
  const sw = S * 0.56, sh = S * 0.56, sx = (S - sw) / 2, sy = (S - sh) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  _rr(ctx, sx - 8, sy - 8, sw + 16, sh + 16, 18);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  _rr(ctx, sx, sy, sw, sh, 12);
  ctx.clip();
  ctx.drawImage(d, sx, sy, sw, sh);
  ctx.restore();
  ctx.restore();
}

// ── Main dispatcher ──
// Handles both Design Sensei products and POD Builder product names

export function renderMockup(
  ctx: CanvasRenderingContext2D,
  d: HTMLImageElement,
  product: string,
  S: number,
  fabricColor?: FabricColor
) {
  if (["Unisex T-Shirt", "T-Shirt", "Hoodie", "Sweatshirt"].includes(product)) {
    _apparel(ctx, d, product, S, fabricColor);
  } else if (product.includes("Mug")) {
    _mug(ctx, d, S);
  } else if (["Poster", "Canvas"].includes(product)) {
    _wallArt(ctx, d, product, S);
  } else if (product === "Framed Print") {
    _framed(ctx, d, S);
  } else if (product === "Phone Case") {
    _phone(ctx, d, S);
  } else if (product === "Tote Bag") {
    _tote(ctx, d, S);
  } else if (product === "Spiral Notebook") {
    _notebook(ctx, d, S);
  } else if (product.includes("Sticker")) {
    _sticker(ctx, d, S);
  } else {
    _bg(ctx, S);
    _print(ctx, d, S * 0.15, S * 0.15, S * 0.7, S * 0.7, 8);
  }
}

// ── Background removal helper ──
// Strips solid background from a design image by sampling corner pixel

function stripBackground(img: HTMLImageElement, tolerance = 35): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  // Sample bg color from top-left corner
  const bgR = d[0], bgG = d[1], bgB = d[2];

  for (let i = 0; i < d.length; i += 4) {
    const dr = Math.abs(d[i] - bgR);
    const dg = Math.abs(d[i + 1] - bgG);
    const db = Math.abs(d[i + 2] - bgB);
    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      d[i + 3] = 0; // Make transparent
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ── Batch canvas mockup generator ──
// Generates mockup dataURLs for a single design across multiple products

export async function generateCanvasMockups(
  designDataUrl: string,
  products: MockupProduct[],
  options?: {
    size?: number;
    fabricColors?: Record<string, FabricColor[]>;
  }
): Promise<Record<string, string>> {
  const S = options?.size || 600;
  const results: Record<string, string> = {};

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Strip background from design so only the artwork shows on the product
      const transparentCanvas = stripBackground(img);
      const transparentImg = new Image();
      transparentImg.onload = () => {
        for (const product of products) {
          const colors = options?.fabricColors?.[product];
          if (colors && colors.length > 0) {
            for (const color of colors) {
              const canvas = document.createElement("canvas");
              canvas.width = S;
              canvas.height = S;
              const ctx = canvas.getContext("2d")!;
              renderMockup(ctx, transparentImg, product, S, color);
              results[`${product}-${color.id}`] = canvas.toDataURL("image/jpeg", 0.92);
            }
          } else {
            const canvas = document.createElement("canvas");
            canvas.width = S;
            canvas.height = S;
            const ctx = canvas.getContext("2d")!;
            renderMockup(ctx, transparentImg, product, S);
            results[product] = canvas.toDataURL("image/jpeg", 0.92);
          }
        }
        resolve(results);
      };
      transparentImg.src = transparentCanvas.toDataURL("image/png");
    };
    img.src = designDataUrl;
  });
}
