// Mockup Frame Library — Upload custom frames + AI matching
// Each frame has metadata: style tags, art area coordinates, and display settings

import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { callGeminiJSON, parseGeminiJSON } from "./gemini";

// ── Types ──

export interface MockupFrame {
  id: string;
  name: string;
  filename: string;          // PNG file in mockup-library/
  thumbnail?: string;        // Thumbnail path
  // Art placement area (where the art goes inside the frame)
  artArea: {
    x: number;               // Left edge of art area (px)
    y: number;               // Top edge of art area (px)
    width: number;            // Art area width (px)
    height: number;           // Art area height (px)
  };
  // Frame dimensions
  frameWidth: number;
  frameHeight: number;
  // Style tags for AI matching
  styleTags: string[];        // e.g. ["rustic", "wood", "farmhouse", "warm"]
  // What art styles this frame works best with
  bestFor: string[];          // e.g. ["cross-stitch", "botanical", "vintage", "cottage"]
  // What art styles to AVOID with this frame
  notFor: string[];           // e.g. ["modern", "minimalist", "geometric"]
  // Orientation
  orientation: "portrait" | "landscape" | "square" | "oval";
  // Background color of the frame image (for compositing)
  bgColor?: string;
  // Is the art composited UNDER the frame (overlay mode) or inside a cutout?
  compositeMode: "overlay" | "under";
  // Added timestamp
  createdAt: string;
}

export interface FrameLibrary {
  frames: MockupFrame[];
  version: number;
}

// ── Paths ──

const LIBRARY_DIR = () => path.join(process.cwd(), "public", "mockup-library");
const LIBRARY_JSON = () => path.join(LIBRARY_DIR(), "library.json");

// ── Load / Save Library ──

export async function loadLibrary(): Promise<FrameLibrary> {
  try {
    const data = await readFile(LIBRARY_JSON(), "utf-8");
    return JSON.parse(data);
  } catch {
    return { frames: [], version: 1 };
  }
}

export async function saveLibrary(lib: FrameLibrary): Promise<void> {
  await mkdir(LIBRARY_DIR(), { recursive: true });
  await writeFile(LIBRARY_JSON(), JSON.stringify(lib, null, 2));
}

// ── Add Frame to Library ──

export async function addFrame(
  imageBuffer: Buffer,
  name: string,
  artArea: MockupFrame["artArea"],
  styleTags: string[],
  bestFor: string[],
  notFor: string[],
  orientation: MockupFrame["orientation"],
  compositeMode: MockupFrame["compositeMode"]
): Promise<MockupFrame> {
  await mkdir(LIBRARY_DIR(), { recursive: true });

  const id = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const filename = `${id}.png`;
  const filepath = path.join(LIBRARY_DIR(), filename);

  // Save the frame image
  const meta = await sharp(imageBuffer).metadata();
  await writeFile(filepath, imageBuffer);

  // Generate thumbnail
  const thumbFilename = `${id}_thumb.jpg`;
  const thumbPath = path.join(LIBRARY_DIR(), thumbFilename);
  await sharp(imageBuffer).resize(300, 300, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()
    .then(buf => writeFile(thumbPath, buf));

  const frame: MockupFrame = {
    id,
    name,
    filename,
    thumbnail: thumbFilename,
    artArea,
    frameWidth: meta.width || 1200,
    frameHeight: meta.height || 900,
    styleTags,
    bestFor,
    notFor,
    orientation,
    bgColor: undefined,
    compositeMode,
    createdAt: new Date().toISOString(),
  };

  const lib = await loadLibrary();
  lib.frames.push(frame);
  await saveLibrary(lib);

  return frame;
}

// ── Remove Frame ──

export async function removeFrame(frameId: string): Promise<boolean> {
  const lib = await loadLibrary();
  const idx = lib.frames.findIndex(f => f.id === frameId);
  if (idx === -1) return false;
  lib.frames.splice(idx, 1);
  await saveLibrary(lib);
  return true;
}

// ── AI Frame Matcher ──
// Analyzes art style and picks the best matching frames from the library

export async function matchFramesToArt(
  artDescription: string,
  niche: string,
  artBuffer: Buffer,
  maxFrames: number = 5
): Promise<{ frameId: string; score: number; reason: string }[]> {
  const lib = await loadLibrary();
  if (lib.frames.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback: simple tag matching
    return simpleTagMatch(lib.frames, niche, artDescription, maxFrames);
  }

  // Get art color info
  const stats = await sharp(artBuffer).stats();
  const dominantChannel = stats.channels[0]; // R channel
  const avgBrightness = Math.round((stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3);
  const colorProfile = avgBrightness > 180 ? "light/bright" : avgBrightness > 100 ? "medium tones" : "dark/moody";

  const frameList = lib.frames.map(f => ({
    id: f.id,
    name: f.name,
    styleTags: f.styleTags.join(", "),
    bestFor: f.bestFor.join(", "),
    notFor: f.notFor.join(", "),
    orientation: f.orientation,
  }));

  const prompt = `You are an expert interior designer and art curator. Your job is to match artwork with the PERFECT frame/mockup.

ART DETAILS:
- Description: ${artDescription}
- Niche: ${niche}
- Color profile: ${colorProfile} (avg brightness: ${avgBrightness}/255)
- Dominant color mean R:${Math.round(stats.channels[0].mean)} G:${Math.round(stats.channels[1].mean)} B:${Math.round(stats.channels[2].mean)}

AVAILABLE FRAMES:
${JSON.stringify(frameList, null, 2)}

MATCHING RULES:
- Cross-stitch/embroidery art → wooden hoop, rustic wood, craft frames
- Modern abstract/geometric → clean black, white, or floating frames
- Vintage/antique art → ornate gold, baroque, dark wood frames
- Botanical/nature → natural wood, white mat, farmhouse frames
- Nursery/kids → colorful, playful, or soft pastel frames
- Photography/landscape → gallery-style, thin black, or frameless
- Gothic/dark academia → dark ornate, black baroque, moody frames
- Boho/cottagecore → rattan, woven, natural material frames
- Minimalist → thin profile, no-mat, floating mount
- The frame should COMPLEMENT the art, not compete with it
- Consider color harmony between art and frame

Return JSON array of matches (best first, up to ${maxFrames}):
[{ "frameId": "...", "score": 0-100, "reason": "brief explanation" }]`;

  try {
    const raw = await callGeminiJSON(apiKey, prompt);
    const matches = parseGeminiJSON<{ frameId: string; score: number; reason: string }[]>(raw);
    return Array.isArray(matches) ? matches.slice(0, maxFrames) : [];
  } catch {
    return simpleTagMatch(lib.frames, niche, artDescription, maxFrames);
  }
}

// Fallback: simple keyword-based matching
function simpleTagMatch(
  frames: MockupFrame[],
  niche: string,
  artDescription: string,
  maxFrames: number
): { frameId: string; score: number; reason: string }[] {
  const keywords = `${niche} ${artDescription}`.toLowerCase().split(/\s+/);

  const scored = frames.map(frame => {
    let score = 50; // base score

    // Boost for matching styleTags
    for (const tag of frame.bestFor) {
      if (keywords.some(k => tag.toLowerCase().includes(k) || k.includes(tag.toLowerCase()))) {
        score += 15;
      }
    }
    for (const tag of frame.styleTags) {
      if (keywords.some(k => tag.toLowerCase().includes(k))) {
        score += 10;
      }
    }

    // Penalize for notFor matches
    for (const tag of frame.notFor) {
      if (keywords.some(k => tag.toLowerCase().includes(k) || k.includes(tag.toLowerCase()))) {
        score -= 20;
      }
    }

    return { frameId: frame.id, score: Math.max(0, Math.min(100, score)), reason: "Tag-based match" };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, maxFrames);
}

// ── Composite Art into Frame ──

export async function compositeArtInFrame(
  artBuffer: Buffer,
  frame: MockupFrame
): Promise<Buffer> {
  const framePath = path.join(LIBRARY_DIR(), frame.filename);
  const frameBuffer = await readFile(framePath);

  const { x, y, width, height } = frame.artArea;

  // Resize art to fit the art area while maintaining aspect ratio
  const resizedArt = await sharp(artBuffer)
    .resize(width, height, { fit: "cover" })
    .toBuffer();

  if (frame.compositeMode === "overlay") {
    // Art goes UNDER the frame (frame has transparent cutout for art area)
    const bgSvg = Buffer.from(
      `<svg width="${frame.frameWidth}" height="${frame.frameHeight}"><rect width="${frame.frameWidth}" height="${frame.frameHeight}" fill="${frame.bgColor || '#f5f0eb'}"/></svg>`
    );
    return sharp(bgSvg)
      .resize(frame.frameWidth, frame.frameHeight)
      .composite([
        { input: resizedArt, left: x, top: y },
        { input: frameBuffer, left: 0, top: 0 },
      ])
      .png({ quality: 90 })
      .toBuffer();
  } else {
    // Art composited ON TOP of the frame background (frame is the base)
    return sharp(frameBuffer)
      .composite([
        { input: resizedArt, left: x, top: y },
      ])
      .png({ quality: 90 })
      .toBuffer();
  }
}

// ── MJ Prompt Generator for Mockup Frames ──

export const MOCKUP_MJ_PROMPTS: {
  style: string;
  bestFor: string;
  prompt: string;
  styleTags: string[];
  tips: string;
}[] = [
  {
    style: "Rustic Wood Oval Hoop",
    bestFor: "Cross-stitch, embroidery, cottage, nursery",
    prompt: "Product photography of an empty oval wooden embroidery hoop frame on a light blue gingham fabric background, the center of the hoop is pure white linen fabric with no design, soft natural lighting, overhead shot, clean and minimal --ar 3:4 --s 200",
    styleTags: ["rustic", "wood", "embroidery", "craft", "cottage", "nursery"],
    tips: "After generating, use the empty white center as your art area. The linen texture adds authenticity for cross-stitch designs.",
  },
  {
    style: "Modern Black Gallery Frame",
    bestFor: "Abstract, minimalist, photography, modern art",
    prompt: "Product photography of a thin black metal picture frame with white mat border, hanging on a white textured wall, empty frame showing white mat inside, soft shadows, minimalist interior design style --ar 3:4 --s 150",
    styleTags: ["modern", "black", "gallery", "minimalist", "clean"],
    tips: "The white mat area is your art placement zone. Works great for abstract and modern pieces.",
  },
  {
    style: "Ornate Gold Baroque Frame",
    bestFor: "Vintage, dark academia, renaissance, classical art",
    prompt: "Product photography of an ornate baroque gold picture frame with detailed carved scrollwork, displayed on a dark moody wall, the inside of the frame is empty showing dark wall, dramatic lighting, museum quality --ar 3:4 --s 250",
    styleTags: ["gold", "baroque", "ornate", "vintage", "classical", "dark academia"],
    tips: "Composite art inside the frame area. The dramatic lighting adds museum-quality feel.",
  },
  {
    style: "Natural Light Wood Frame",
    bestFor: "Botanical, farmhouse, nature, Scandinavian",
    prompt: "Product photography of a simple natural oak wood picture frame with a wide white mat, leaning against a warm beige wall on a wooden shelf, small potted plant next to it, warm natural light, cozy Scandinavian interior --ar 3:4 --s 200",
    styleTags: ["wood", "natural", "farmhouse", "scandinavian", "botanical", "warm"],
    tips: "The white mat area is where art goes. Lifestyle setting increases conversion on Etsy.",
  },
  {
    style: "Floating Acrylic Frame",
    bestFor: "Modern, abstract, photography, tech/futuristic",
    prompt: "Product photography of a frameless acrylic floating picture frame mounted on a clean white wall, the frame has a transparent edge creating a floating effect, modern living room background slightly blurred, soft ambient lighting --ar 3:4 --s 150",
    styleTags: ["modern", "floating", "acrylic", "clean", "contemporary", "minimalist"],
    tips: "The transparent edges create a premium floating look. Best for bold art that stands on its own.",
  },
  {
    style: "Rattan/Woven Boho Frame",
    bestFor: "Boho, cottagecore, beach, macrame, eclectic",
    prompt: "Product photography of a round rattan woven picture frame on a cream textured wall, bohemian interior with dried pampas grass in the background, warm golden hour lighting, earthy tones --ar 3:4 --s 200",
    styleTags: ["boho", "rattan", "woven", "natural", "eclectic", "beach", "cottagecore"],
    tips: "Circular frame — crop art to 1:1 ratio. The boho styling targets a passionate buyer audience.",
  },
  {
    style: "Samsung Frame TV on Wall",
    bestFor: "Landscape art, Samsung Frame TV listings, panoramic",
    prompt: "Product photography of a Samsung Frame TV with thin black bezel mounted on a warm beige living room wall, showing a completely white screen, modern console table below with a small plant and books, soft ambient lighting, editorial interior design photo --ar 16:9 --s 200",
    styleTags: ["tv", "samsung", "modern", "landscape", "living room", "tech"],
    tips: "Use 16:9 ratio art. The white screen is your art area. Top opportunity niche per 2026 report.",
  },
  {
    style: "Gallery Wall Set (3 Frames)",
    bestFor: "Gallery wall sets, coordinated prints, curated collections",
    prompt: "Product photography of three matching white picture frames with white mats arranged on a warm off-white wall, one large frame in center flanked by two smaller frames, modern living room with a low wooden credenza below, small plant and candle on credenza, soft natural lighting --ar 4:3 --s 200",
    styleTags: ["gallery", "set", "white", "arranged", "modern", "curated"],
    tips: "Three art areas to fill. Gallery sets command $12-$25 per the market report — 3-4x single listing price.",
  },
  {
    style: "Nursery Pastel Frame",
    bestFor: "Nursery art, kids room, baby shower, cute animals",
    prompt: "Product photography of a soft pastel pink picture frame with rounded corners on a light nursery wall, small stuffed bunny toy beside it, soft diffused lighting, gentle dreamy atmosphere, baby room interior --ar 3:4 --s 150",
    styleTags: ["nursery", "pastel", "kids", "baby", "cute", "soft"],
    tips: "Nursery art with premium frames commands $8-$93 per the report. Sets of 6 perform best.",
  },
  {
    style: "Dark Moody Interior Frame",
    bestFor: "Gothic, dark academia, moody florals, memento mori",
    prompt: "Product photography of a dark matte black picture frame with no mat on a dark charcoal wall, moody dramatic side lighting, old leather book and dried dark roses nearby, gothic interior aesthetic, fine art photography style --ar 3:4 --s 250",
    styleTags: ["dark", "gothic", "moody", "black", "dramatic", "academia"],
    tips: "Dark academia is HIGH opportunity with LOW competition per 2026 report. The moody setting sells the vibe.",
  },
];
