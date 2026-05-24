import { NextRequest } from "next/server";
import sharp from "sharp";
import { writeFile, mkdir, readdir, readFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const shopName = escXml(body.shopName || "CraftPlanDigital");
    const tagline = escXml(body.tagline || "TEMPLATES &amp; DIGITAL PRODUCTS");
    const promo = escXml(body.promo || "UP TO 60% OFF");
    // Accept optional product images as base64 array
    const productImages: string[] = body.images || [];

    const outputDir = path.join(process.cwd(), "data", "shop-branding");
    await mkdir(outputDir, { recursive: true });

    // Try to find product images from disk if none provided
    const artImages: Buffer[] = [];
    if (productImages.length > 0) {
      for (const img of productImages) {
        const clean = img.replace(/^data:[^;]+;base64,/, "");
        artImages.push(Buffer.from(clean, "base64"));
      }
    } else {
      // Auto-discover images — pick diverse sources (not all same product)
      const dataDir = path.join(process.cwd(), "data");
      // Categorize by source so we can pick one from each
      const byCategory: Record<string, string[]> = { mockups: [], crops: [], bases: [], digital: [] };

      const wallArtDir = path.join(dataDir, "wall-art");
      try {
        const waDirs = await readdir(wallArtDir);
        for (const d of waDirs) {
          const mockupDir = path.join(wallArtDir, d, "mockups");
          try {
            const mockups = await readdir(mockupDir);
            for (const m of mockups) byCategory.mockups.push(path.join(mockupDir, m));
          } catch { /* skip */ }
          const cropDir = path.join(wallArtDir, d, "crops");
          try {
            const crops = await readdir(cropDir);
            for (const c of crops) byCategory.crops.push(path.join(cropDir, c));
          } catch { /* skip */ }
          const basePath = path.join(wallArtDir, d, "base.png");
          try { await readFile(basePath); byCategory.bases.push(basePath); } catch { /* skip */ }
        }
      } catch { /* no wall art dir */ }

      const dpDir = path.join(dataDir, "digital-products");
      try {
        const dpDirs = await readdir(dpDir);
        for (const d of dpDirs) {
          const dpPath = path.join(dpDir, d);
          try {
            const files = await readdir(dpPath);
            for (const f of files) {
              if (/\.(png|jpg|jpeg|webp)$/i.test(f)) byCategory.digital.push(path.join(dpPath, f));
            }
          } catch { /* skip */ }
        }
      } catch { /* no dp dir */ }

      // Pick ONE base image per unique wall-art product (not mockups/crops of same thing)
      // Only use actual art images — not document screenshots from digital products
      const picks: string[] = [];

      // One base image per wall-art product
      for (const b of byCategory.bases) {
        if (picks.length >= 6) break;
        picks.push(b);
      }
      // Fallback: one mockup if no bases found
      if (picks.length === 0 && byCategory.mockups[0]) picks.push(byCategory.mockups[0]);

      for (const p of picks.slice(0, 8)) {
        try { artImages.push(await readFile(p)); } catch { /* skip */ }
      }
    }

    // ── 1. BANNER (3360 x 840) ──
    const bw = 3360;
    const bh = 840;

    // Create dark base
    const baseBanner = await sharp({
      create: { width: bw, height: bh, channels: 4, background: { r: 15, g: 14, b: 13, alpha: 255 } },
    }).png().toBuffer();

    // Show product art as large borderless pieces flanking center text
    // Layout adapts: fewer images = larger pieces, more images = gallery grid
    const panelComposites: sharp.OverlayOptions[] = [];
    const uniqueCount = artImages.length;

    if (uniqueCount > 0) {
      // Adaptive layouts based on how many unique images we have
      type PanelConfig = { x: number; y: number; w: number; h: number };
      let panels: PanelConfig[];

      if (uniqueCount === 1) {
        // 1 image: large art on left side only, right stays clean
        panels = [
          { x: 40, y: 40, w: 760, h: bh - 80 },
        ];
      } else if (uniqueCount === 2) {
        // 2 images: one large on each side
        panels = [
          { x: 40, y: 40, w: 720, h: bh - 80 },
          { x: bw - 760, y: 40, w: 720, h: bh - 80 },
        ];
      } else if (uniqueCount <= 4) {
        // 3-4 images: like the competitor — 2 per side, large and borderless
        panels = [
          { x: 30,  y: 30,  w: 520, h: bh - 60 },
          { x: 520, y: 60,  w: 480, h: bh - 120 },
          { x: bw - 1000, y: 60, w: 480, h: bh - 120 },
          { x: bw - 550,  y: 30, w: 520, h: bh - 60 },
        ];
      } else {
        // 5+ images: gallery with 3 per side
        panels = [
          { x: 20,  y: 30,  w: 440, h: bh - 60 },
          { x: 440, y: 80,  w: 380, h: bh - 160 },
          { x: 790, y: 140, w: 300, h: bh - 280 },
          { x: bw - 1090, y: 140, w: 300, h: bh - 280 },
          { x: bw - 820,  y: 80,  w: 380, h: bh - 160 },
          { x: bw - 460,  y: 30,  w: 440, h: bh - 60 },
        ];
      }

      for (let i = 0; i < Math.min(uniqueCount, panels.length); i++) {
        const p = panels[i];
        try {
          const resized = await sharp(artImages[i])
            .resize(p.w, p.h, { fit: "cover", position: "center" })
            .ensureAlpha()
            .png()
            .toBuffer();

          // Soft shadow behind each piece
          const shadowBuf = await sharp({
            create: { width: p.w + 20, height: p.h + 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 100 } },
          }).png().toBuffer();
          const shadow = await sharp(shadowBuf).blur(10).png().toBuffer();
          panelComposites.push({ input: shadow, left: p.x + 6, top: p.y + 8 });

          panelComposites.push({ input: resized, left: p.x, top: p.y });
        } catch { /* skip bad image */ }
      }
    }

    // Composite framed art pieces onto dark base
    let bannerWithImages = baseBanner;
    if (panelComposites.length > 0) {
      bannerWithImages = await sharp(baseBanner)
        .composite(panelComposites)
        .png()
        .toBuffer();
    }

    // Text center shifts right when only 1 image on left
    const textCx = uniqueCount === 1 ? Math.round(bw * 0.58) : Math.round(bw / 2);

    // Create text overlay as SVG
    const textSvg = `<svg width="${bw}" height="${bh}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#c9a84c"/>
          <stop offset="30%" style="stop-color:#f0d78c"/>
          <stop offset="50%" style="stop-color:#dfc065"/>
          <stop offset="70%" style="stop-color:#f0d78c"/>
          <stop offset="100%" style="stop-color:#c9a84c"/>
        </linearGradient>
        <linearGradient id="goldLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:transparent"/>
          <stop offset="15%" style="stop-color:#c9a84c"/>
          <stop offset="50%" style="stop-color:#f0d78c"/>
          <stop offset="85%" style="stop-color:#c9a84c"/>
          <stop offset="100%" style="stop-color:transparent"/>
        </linearGradient>
        <!-- Fade over left image edge for text readability -->
        <linearGradient id="centerDark" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgba(15,14,13,0)"/>
          <stop offset="${uniqueCount === 1 ? 20 : 22}%" style="stop-color:rgba(15,14,13,0.95)"/>
          <stop offset="50%" style="stop-color:rgba(15,14,13,0.98)"/>
          <stop offset="${uniqueCount === 1 ? 100 : 78}%" style="stop-color:rgba(15,14,13,${uniqueCount === 1 ? 0.98 : 0.95})"/>
          <stop offset="100%" style="stop-color:rgba(15,14,13,${uniqueCount === 1 ? 0.98 : 0})"/>
        </linearGradient>
      </defs>

      <!-- Dark backdrop behind text area -->
      <rect width="${bw}" height="${bh}" fill="url(#centerDark)"/>

      <!-- Gold border frame -->
      <rect x="40" y="30" width="${bw - 80}" height="${bh - 60}" rx="2" fill="none" stroke="url(#gold)" stroke-width="1.5" opacity="0.3"/>
      <rect x="55" y="45" width="${bw - 110}" height="${bh - 90}" rx="1" fill="none" stroke="url(#gold)" stroke-width="0.8" opacity="0.2"/>

      <!-- Corner diamonds -->
      <polygon points="80,420 100,400 120,420 100,440" fill="url(#gold)" opacity="0.3"/>
      <polygon points="${bw - 80},420 ${bw - 100},400 ${bw - 120},420 ${bw - 100},440" fill="url(#gold)" opacity="0.3"/>

      <!-- Shop name -->
      <text x="${textCx}" y="290" font-family="Georgia, 'Times New Roman', serif" font-size="140" font-weight="bold" fill="url(#gold)" text-anchor="middle" letter-spacing="14">${shopName.toUpperCase()}</text>

      <!-- Line under name -->
      <rect x="${textCx - 380}" y="330" width="760" height="2.5" fill="url(#goldLine)"/>

      <!-- Tagline -->
      <text x="${textCx}" y="415" font-family="Georgia, 'Times New Roman', serif" font-size="52" fill="#c9a84c" text-anchor="middle" letter-spacing="14" opacity="0.9">${tagline}</text>

      <!-- Separator -->
      <rect x="${textCx - 260}" y="455" width="520" height="1" fill="url(#goldLine)" opacity="0.4"/>

      <!-- Promo -->
      <text x="${textCx}" y="540" font-family="Georgia, 'Times New Roman', serif" font-size="80" font-weight="bold" fill="#f0d78c" text-anchor="middle" letter-spacing="6">${promo}</text>

      <!-- Small line -->
      <rect x="${textCx - 160}" y="570" width="320" height="1.5" fill="url(#goldLine)" opacity="0.35"/>

      <!-- Bottom categories -->
      <text x="${textCx}" y="650" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#8b7540" text-anchor="middle" letter-spacing="20" opacity="0.7">WALL ART  ·  PLANNERS  ·  TEMPLATES  ·  INSTANT DOWNLOAD</text>

      <!-- Decorative stars -->
      <text x="${textCx - 530}" y="295" font-family="serif" font-size="24" fill="#c9a84c" text-anchor="middle" opacity="0.4">✦</text>
      <text x="${textCx + 530}" y="295" font-family="serif" font-size="24" fill="#c9a84c" text-anchor="middle" opacity="0.4">✦</text>
    </svg>`;

    const bannerBuffer = await sharp(bannerWithImages)
      .composite([{ input: Buffer.from(textSvg), blend: "over" }])
      .png({ quality: 95 })
      .toBuffer();

    const bannerPath = path.join(outputDir, "shop-banner.png");
    await writeFile(bannerPath, bannerBuffer);

    // ── 2. LOGO (500 x 500) — unchanged elegant design ──
    const logoSize = 500;
    const logoSvg = `<svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0d0d0d"/>
          <stop offset="100%" style="stop-color:#1a1a1a"/>
        </linearGradient>
        <linearGradient id="logoGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#c9a84c"/>
          <stop offset="30%" style="stop-color:#f0d78c"/>
          <stop offset="50%" style="stop-color:#dfc065"/>
          <stop offset="70%" style="stop-color:#f0d78c"/>
          <stop offset="100%" style="stop-color:#c9a84c"/>
        </linearGradient>
        <linearGradient id="logoGoldLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:transparent"/>
          <stop offset="20%" style="stop-color:#c9a84c"/>
          <stop offset="50%" style="stop-color:#f0d78c"/>
          <stop offset="80%" style="stop-color:#c9a84c"/>
          <stop offset="100%" style="stop-color:transparent"/>
        </linearGradient>
      </defs>
      <rect width="${logoSize}" height="${logoSize}" rx="40" fill="url(#logoBg)"/>
      <rect x="15" y="15" width="${logoSize - 30}" height="${logoSize - 30}" rx="30" fill="none" stroke="url(#logoGold)" stroke-width="1.5" opacity="0.5"/>
      <rect x="28" y="28" width="${logoSize - 56}" height="${logoSize - 56}" rx="22" fill="none" stroke="url(#logoGold)" stroke-width="0.8" opacity="0.3"/>
      <line x1="40" y1="80" x2="80" y2="80" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="80" y1="40" x2="80" y2="80" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="${logoSize - 40}" y1="80" x2="${logoSize - 80}" y2="80" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="${logoSize - 80}" y1="40" x2="${logoSize - 80}" y2="80" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="40" y1="${logoSize - 80}" x2="80" y2="${logoSize - 80}" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="80" y1="${logoSize - 40}" x2="80" y2="${logoSize - 80}" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="${logoSize - 40}" y1="${logoSize - 80}" x2="${logoSize - 80}" y2="${logoSize - 80}" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <line x1="${logoSize - 80}" y1="${logoSize - 40}" x2="${logoSize - 80}" y2="${logoSize - 80}" stroke="#c9a84c" stroke-width="1" opacity="0.4"/>
      <text x="${logoSize / 2}" y="230" font-family="Georgia, 'Times New Roman', serif" font-size="120" font-weight="bold" fill="url(#logoGold)" text-anchor="middle" letter-spacing="12">CPD</text>
      <rect x="100" y="255" width="300" height="1.5" fill="url(#logoGoldLine)"/>
      <text x="${logoSize / 2}" y="310" font-family="Georgia, 'Times New Roman', serif" font-size="32" fill="#c9a84c" text-anchor="middle" letter-spacing="8">CRAFTPLAN</text>
      <text x="${logoSize / 2}" y="350" font-family="Georgia, 'Times New Roman', serif" font-size="32" fill="#c9a84c" text-anchor="middle" letter-spacing="8">DIGITAL</text>
      <rect x="130" y="375" width="240" height="1" fill="url(#logoGoldLine)" opacity="0.5"/>
      <text x="${logoSize / 2}" y="415" font-family="Georgia, 'Times New Roman', serif" font-size="16" fill="#8b7540" text-anchor="middle" letter-spacing="6" opacity="0.8">DIGITAL PRODUCTS</text>
      <polygon points="250,440 255,435 260,440 255,445" fill="#c9a84c" opacity="0.5"/>
    </svg>`;

    const logoBuffer = await sharp(Buffer.from(logoSvg)).png({ quality: 95 }).toBuffer();
    const logoPath = path.join(outputDir, "shop-logo.png");
    await writeFile(logoPath, logoBuffer);

    const bannerBase64 = `data:image/png;base64,${bannerBuffer.toString("base64")}`;
    const logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;

    return new Response(
      JSON.stringify({ banner: bannerBase64, bannerPath, logo: logoBase64, logoPath }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Branding generation failed";
    console.error("Shop branding error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
