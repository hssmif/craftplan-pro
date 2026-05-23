// SEO title/tag/description generator for Etsy listings

const STYLE_KEYWORDS = [
  'minimalist', 'boho', 'modern', 'abstract', 'watercolor', 'vintage',
  'botanical', 'geometric', 'line art', 'scandinavian', 'nordic',
  'aesthetic', 'contemporary', 'rustic', 'farmhouse', 'coastal',
];

const ROOM_KEYWORDS = [
  'living room', 'bedroom', 'nursery', 'office', 'bathroom',
  'kitchen', 'hallway', 'dorm room', 'apartment',
];

const FORMAT_KEYWORDS = [
  'printable', 'digital download', 'instant download', 'wall art',
  'home decor', 'wall decor', 'art print',
];

export function generateTitle(prompt: string, type: string): string {
  const baseTitle = prompt.replace(/[^a-zA-Z0-9\s,'-]/g, '').trim();

  let suffix = '';
  switch (type) {
    case 'wall_art':
      suffix = 'Printable Wall Art Digital Download';
      break;
    case 'svg':
      suffix = 'SVG Cut File Digital Download';
      break;
    case 'planner':
      suffix = 'Printable Planner Digital Download';
      break;
    case 'mockup':
      suffix = 'Digital Mockup Template';
      break;
  }

  const title = `${baseTitle} ${suffix}`.substring(0, 140);
  return title;
}

export function generateTags(prompt: string, type: string): string[] {
  const tags: Set<string> = new Set();

  // Add type-specific tags
  switch (type) {
    case 'wall_art':
      tags.add('wall art');
      tags.add('printable wall art');
      tags.add('digital download');
      tags.add('art print');
      tags.add('home decor');
      break;
    case 'svg':
      tags.add('svg');
      tags.add('svg file');
      tags.add('cut file');
      tags.add('digital download');
      tags.add('cricut svg');
      break;
    case 'planner':
      tags.add('printable planner');
      tags.add('digital planner');
      tags.add('planner pages');
      tags.add('digital download');
      break;
    case 'mockup':
      tags.add('mockup');
      tags.add('digital mockup');
      tags.add('frame mockup');
      tags.add('mockup template');
      break;
  }

  // Extract style keywords from prompt
  const lowerPrompt = prompt.toLowerCase();
  for (const style of STYLE_KEYWORDS) {
    if (lowerPrompt.includes(style)) {
      tags.add(style);
    }
  }

  // Extract room keywords
  for (const room of ROOM_KEYWORDS) {
    if (lowerPrompt.includes(room)) {
      tags.add(room);
    }
  }

  // Add general keywords
  tags.add('instant download');
  tags.add('printable');

  // Extract significant words from prompt (3+ chars, not common)
  const commonWords = new Set(['the', 'and', 'for', 'with', 'art', 'digital', 'print', 'wall', 'style', 'design']);
  const promptWords = lowerPrompt.split(/\s+/).filter(w => w.length >= 3 && !commonWords.has(w));
  for (const word of promptWords.slice(0, 3)) {
    tags.add(word);
  }

  // Return max 13 tags (Etsy limit), each max 20 chars
  return Array.from(tags).slice(0, 13).map(t => t.substring(0, 20));
}

export function generateDescription(prompt: string, type: string, title: string): string {
  const typeDescriptions: Record<string, string> = {
    wall_art: `This beautiful printable wall art is perfect for adding a touch of style to any room in your home.

WHAT YOU GET:
- High-resolution digital file (300 DPI)
- Print-ready format (PNG)
- Suitable for standard frame sizes (8x10, 11x14, 12x16, 16x20)

HOW TO USE:
1. Purchase and download the file
2. Print at home or at a local print shop
3. Frame and display!

No physical item will be shipped. This is a digital download.`,

    svg: `This SVG cut file is perfect for your Cricut, Silhouette, or other cutting machine projects.

WHAT YOU GET:
- SVG file (compatible with all cutting machines)
- PNG file (transparent background)
- High-resolution for printing

Compatible with: Cricut, Silhouette, Brother, and more.

No physical item will be shipped. This is a digital download.`,

    planner: `Stay organized with this beautiful printable planner!

WHAT YOU GET:
- PDF file (print-ready, 300 DPI)
- US Letter size (8.5 x 11 inches)
- Clean, minimalist design

HOW TO USE:
1. Purchase and download
2. Print at home or at a print shop
3. Use as-is or punch holes for a binder

No physical item will be shipped. This is a digital download.`,

    mockup: `Professional digital mockup template for showcasing your designs.

WHAT YOU GET:
- High-resolution mockup file
- Easy to use - just place your design
- Realistic rendering

Perfect for: Etsy listings, social media, portfolio, client presentations.

No physical item will be shipped. This is a digital download.`,
  };

  return `${title}

${typeDescriptions[type] || typeDescriptions.wall_art}

---
${String.fromCodePoint(0x00A9)} CraftPlanDigital - All designs are original creations.`;
}

// Generate full SEO package
export function generateSEO(prompt: string, type: string): {
  title: string;
  tags: string[];
  description: string;
} {
  const title = generateTitle(prompt, type);
  const tags = generateTags(prompt, type);
  const description = generateDescription(prompt, type, title);

  return { title, tags, description };
}
