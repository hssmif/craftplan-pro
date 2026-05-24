import { NextRequest } from "next/server";
import sharp from "sharp";

// Generate a "What You Get" info image for Etsy listings
export async function POST(req: NextRequest) {
  try {
    const { ratios = ["2:3", "3:4", "4:5", "5:7", "11:14"] } = await req.json();

    const width = 2400;
    const height = 3000;

    // Ratio → print sizes lookup
    const ratioSizes: Record<string, string[]> = {
      "2:3": ["4×6\"", "8×12\"", "10×15\"", "12×18\"", "16×24\"", "20×30\""],
      "3:4": ["6×8\"", "9×12\"", "12×16\"", "15×20\"", "18×24\"", "24×32\""],
      "4:5": ["4×5\"", "8×10\"", "12×15\"", "16×20\"", "24×30\""],
      "5:7": ["5×7\"", "10×14\"", "20×28\""],
      "11:14": ["11×14\""],
      "1:1": ["10×10\"", "12×12\"", "16×16\"", "20×20\""],
      "3:2": ["6×4\"", "12×8\"", "18×12\"", "24×16\"", "30×20\""],
      "16:9": ["16×9\"", "32×18\""],
    };

    // Build SVG info graphic
    const ratioEntries = ratios
      .filter((r: string) => ratioSizes[r])
      .map((r: string) => ({ ratio: r, sizes: ratioSizes[r] }));

    const startY = 900;
    const lineHeight = 90;
    const sectionGap = 50;

    let ratioSVG = "";
    let y = startY;

    for (const entry of ratioEntries) {
      // Ratio heading
      ratioSVG += `<text x="200" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="bold" fill="#1a1a1a">★ ${entry.ratio} RATIO:</text>`;
      y += lineHeight;
      // Sizes
      const sizeLine = entry.sizes.join(", ");
      ratioSVG += `<text x="280" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="48" fill="#333333">${sizeLine}</text>`;
      y += lineHeight + sectionGap;
    }

    // Custom size note
    y += 40;
    const noteY = y;

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#6b7c5e"/>

      <!-- Left icons column -->
      <!-- Download icon -->
      <g transform="translate(120, 200)">
        <!-- Cloud -->
        <path d="M80 30 C80 10 120 10 120 30 C140 20 160 35 155 55 L45 55 C35 50 40 30 60 30 C65 15 80 15 80 30Z" fill="none" stroke="#1a1a1a" stroke-width="6"/>
        <!-- Arrow down from cloud -->
        <line x1="100" y1="60" x2="100" y2="120" stroke="#1a1a1a" stroke-width="6"/>
        <polyline points="75,95 100,120 125,95" fill="none" stroke="#1a1a1a" stroke-width="6"/>
        <text x="100" y="165" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="#1a1a1a" text-anchor="middle">DOWNLOAD</text>
      </g>

      <!-- Down arrow -->
      <line x1="220" y1="400" x2="220" y2="480" stroke="#1a1a1a" stroke-width="5"/>
      <polyline points="200,460 220,480 240,460" fill="none" stroke="#1a1a1a" stroke-width="5"/>

      <!-- Printer icon -->
      <g transform="translate(150, 500)">
        <rect x="30" y="30" width="100" height="60" rx="5" fill="none" stroke="#1a1a1a" stroke-width="5"/>
        <rect x="50" y="5" width="60" height="30" fill="none" stroke="#1a1a1a" stroke-width="4"/>
        <rect x="50" y="85" width="60" height="35" fill="none" stroke="#1a1a1a" stroke-width="4"/>
        <line x1="60" y1="97" x2="100" y2="97" stroke="#1a1a1a" stroke-width="3"/>
        <line x1="60" y1="107" x2="90" y2="107" stroke="#1a1a1a" stroke-width="3"/>
        <text x="80" y="155" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="#1a1a1a" text-anchor="middle">PRINT</text>
      </g>

      <!-- Down arrow -->
      <line x1="220" y1="690" x2="220" y2="770" stroke="#1a1a1a" stroke-width="5"/>
      <polyline points="200,750 220,770 240,750" fill="none" stroke="#1a1a1a" stroke-width="5"/>

      <!-- Frame icon -->
      <g transform="translate(150, 790)">
        <rect x="20" y="5" width="110" height="85" rx="3" fill="none" stroke="#1a1a1a" stroke-width="6"/>
        <rect x="35" y="18" width="80" height="60" rx="2" fill="none" stroke="#1a1a1a" stroke-width="3"/>
        <polyline points="35,60 60,42 80,55 100,38 115,50" fill="none" stroke="#1a1a1a" stroke-width="3"/>
        <circle cx="55" cy="35" r="8" fill="none" stroke="#1a1a1a" stroke-width="2"/>
        <text x="75" y="130" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="#1a1a1a" text-anchor="middle">FRAME</text>
      </g>

      <!-- Right content area -->
      <!-- Title -->
      <text x="600" y="280" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="bold" fill="#1a1a1a" text-decoration="underline">INSTANT DOWNLOAD</text>
      <line x1="600" y1="310" x2="2100" y2="310" stroke="#1a1a1a" stroke-width="4"/>

      <!-- Subtitle -->
      <text x="600" y="420" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#1a1a1a" font-style="italic">Each digital print comes in the following printing</text>
      <text x="600" y="480" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#1a1a1a" font-style="italic">ratios for you to print out and fit into almost any</text>
      <text x="600" y="540" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#1a1a1a" font-style="italic">standard frame:</text>

      <!-- Ratio list -->
      <g transform="translate(400, 0)">
        ${ratioSVG}
      </g>

      <!-- Custom size note -->
      <text x="200" y="${noteY + 100}" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="#1a1a1a" font-style="italic">If you need a custom size or have any questions, please</text>
      <text x="200" y="${noteY + 160}" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="#1a1a1a" font-style="italic">message me. I'm always happy to help!</text>
    </svg>`;

    const imageBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    const base64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    return new Response(
      JSON.stringify({ image: base64 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Info image generation failed";
    console.error("Info image error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
