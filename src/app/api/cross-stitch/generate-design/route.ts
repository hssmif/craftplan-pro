import { NextRequest, NextResponse } from "next/server";
import { editImage, generateImage, OpenAIImageError, IMAGE_MODEL } from "@/lib/openai-image";
import { checkIdeaForIP } from "@/lib/trademark-filter";

// Pollinations FREE Flux endpoint — no API key required, produces Flux-based
// output in ~5-15 seconds. Used as the cheap "preview before paying" path
// so the seller can eyeball whether the prompt is worth spending $0.04 on
// GPT-Image-2 for the final render. The hosted Flux model is different
// from GPT-Image-2 stylistically but good enough to gauge composition +
// subject accuracy, which is all we need for the preview pass.
const POLLINATIONS_FREE_URL = "https://image.pollinations.ai/prompt";

// Bumped from 120 → 240 (4 min) on 2026-05-01 when the paid HQ path
// switched from parallel text-to-image to sequential generate→edit.
// Two ~60s gpt-image-2 calls back-to-back can land at ~120-140s, so
// 120s no longer leaves headroom; 240s gives comfortable margin.
export const maxDuration = 240;
export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
 * POST /api/cross-stitch/generate-design
 *
 * Text-to-image via GPT-Image-2. Replaces the old "build MJ
 * prompt → user copies → pastes into Midjourney externally" flow
 * with a direct server-side render: user describes their design
 * in the Design tab, we construct the stitch-friendly prompt
 * here, call OpenAI, and return a data URL the UI can drop
 * straight into Convert.
 *
 * Prompt construction lives server-side (not client-side) so:
 *   - The cross-stitch guardrails (flat colors, outlines, pure
 *     white bg, GPT-Image-2 canonical ender) are a single source
 *     of truth across every entry point
 *   - We can IP-gate the user's raw description before it hits
 *     OpenAI — cheaper to reject here than to render a Pokémon
 *     image and ban the user's Etsy shop later
 *
 * Request:  { description: string, style?: StyleKey, styleHint?: string,
 *             engine?: "gpt-image-2" | "flux-free" }
 * Response: { dataUrl: string, model: string, engine: string,
 *             cleanConvertDataUrl?: string,   // text designs only
 *             textDetected?: boolean }
 *           { error: string }                 on failure (any non-200)
 *
 * Dual-prompt rule (paid HQ path) — image-edit version (2026-05-01):
 *
 *   1. generateImage(promptB) → `dataUrl`
 *      Pretty stitch-preview on aida fabric — the listing image.
 *
 *   2. editImage(images=[stitchPNG], CLEAN_CONVERT_EDIT_PROMPT)
 *      → `cleanConvertDataUrl`
 *      Style-transfer of the SAME listing image into a clean
 *      flat-colour vector illustration on plain white.  Subject,
 *      pose, objects, text, composition, layout, and proportions
 *      are preserved by the edit; only the surface treatment
 *      changes (no aida, no X-stitches, flat fills, bold outlines,
 *      pure white background).
 *
 * The two images now match because the clean variant is derived
 * from the listing image, not generated from text.  Step 2 is
 * sequential after step 1 (the edit input is the step-1 output),
 * so latency is the sum of two ~60s gpt-image-2 calls (~120-140s
 * end-to-end) instead of the parallel ~70s of the prior version.
 * Cost stays ~$0.08 per HQ design; reliability — and now
 * composition match — beats latency.
 *
 * Why this matters (decided 2026-05-01): the previous parallel
 * version used two independent text-to-image calls with different
 * prompts.  Convert worked, but the customer saw a listing image
 * of (say) "mouse + sombrero + cactus" while the chart they
 * received was for a different rendering of the same description
 * — different pose, different objects, sometimes different
 * subject entirely.  The image-edit flow makes the clean source a
 * provable derivative of the listing, eliminating the mismatch.
 *
 * `textDetected` is debug/analytics only — it does NOT gate
 * generation.  The earlier always-on Codex finding (non-text
 * subjects converting with bgDmc=null and 100% fill if Python
 * receives the stitch preview) still applies; the clean source is
 * always generated.
 *
 * Free Flux preview (engine="flux-free") stays single-image — the
 * preview-before-paying flow doesn't need the clean sibling.
 *
 * The route preserves the upstream OpenAI status code (429 on
 * rate limit, 400 on bad prompt, etc.) so the UI can surface
 * the real reason to the user instead of "something went wrong".
 * ───────────────────────────────────────────────────────────── */

type StyleKey =
  | "cute"
  | "vintage"
  | "modern"
  | "sampler"
  | "pixel"
  // Beginner / Etsy mode — calibrated against NalaAndStitch listings
  // (see Convert-tab BEGINNER_PATTERN_WIDTH constant in page.tsx).
  // Generates a radically simpler source than "cute": single centred
  // animal, ONE accessory max, NO text banner, NO wreath, NO scenery.
  // Targets ~80-stitch chart with 10-13 DMC threads.  Uses an
  // early-return branch in buildDesignPrompt with tighter feature-size
  // and palette directives.
  | "nala-beginner";

// 2026-04-29 — flipped AGAIN, this time from photoreal to STITCH-ART.
// Reference: Etsy best-sellers (Nala&Stitch, Goose Princess Cross
// Stitch Pattern, Highland Cow With Green Bow, Bunny In A Flower
// Garden) all share a specific aesthetic: cute chibi animal character
// rendered as a finished cross-stitch piece on white aida cloth, with
// a thick dark brown outline, ~12-18 flat colours, large readable
// shapes, no smooth gradients.  When that artwork is fed to Python
// KMeans+DMC, the quantizer sees pre-flattened colour regions and
// produces a clean stitch chart.  When we feed Python a photoreal
// image (gradient body shading, fine feather texture), the quantizer
// honestly reports every tonal step as a separate DMC thread, which
// reads as salt-and-pepper confetti to the stitcher.
//
// The old realism rules ("real feathers, photoreal detail, smooth
// tonal gradients") were fighting the downstream pipeline; the new
// rules align the source with what Convert actually wants: pre-
// flattened cross-stitch-style artwork.
//
// What we KEEP from the old behaviour:
//   - Square 1:1 / clean white background (Convert depends on it)
//   - Single centered subject (no busy scenes)
//   - Trademark-term stripping (IP gate is style-agnostic)
//   - Prop-simplification ("simple cactus, simple hat" still applies)
//
// What FLIPPED:
//   - Opener: "Photorealistic photograph of X" → "Cute cross-stitch
//     pattern artwork of X on white aida fabric"
//   - STYLE_MAP entries: photographic vocabulary → stitch-art vocab
//   - "NOT cartoon, NOT illustration" negatives DROPPED — we now WANT
//     stylised illustration with bold outlines and flat colours.
//   - "NOT a photograph of cross-stitch" DROPPED — we now WANT the
//     cross-stitch aesthetic (still excluding the literal hoop frame
//     so Convert isn't framing wood + cloth).
const STYLE_MAP: Record<StyleKey, string> = {
  // Cute chibi animal character cross-stitch design — the dominant
  // best-seller aesthetic on Etsy (Goose Princess, Highland Cow With
  // Bow, Duckling In Green Bonnet).
  cute: "cute chibi animal character cross-stitch design, kawaii baby-animal proportions, big expressive eyes, soft pastel accent colours, friendly gentle pose, beginner-intermediate cross-stitch friendly composition",
  // Vintage sampler-style — heritage thread palette + traditional
  // composition, but still rendered as flat stitch artwork (NOT
  // photoreal still-life).
  vintage:
    "traditional vintage cross-stitch sampler-style figure, heritage flat thread palette (sage green, terracotta, dusty mustard, dusty rose, warm cream), classic centred composition, traditional folk character",
  // Modern minimalist stitch art — clean geometric shapes, contemporary
  // accent colour, fewer total colours than the cute style.
  modern:
    "modern minimalist cross-stitch design, contemporary clean palette with one bold accent colour, simple geometric flat shapes, calm balanced composition",
  // Sampler — symmetrical centred motif arrangement, ALWAYS stitch-art
  // (this used to be a still-life photo in the photoreal era).
  sampler:
    "classic cross-stitch sampler motif, symmetrical centred figure, traditional flat thread palette, decorative central focus with simple bold shapes",
  // Pixel art — already stitch-friendly conceptually, kept similar.
  pixel:
    "crisp pixel-art cross-stitch design, retro game-asset aesthetic, bold saturated primary colours, sharp defined pixel blocks, no anti-aliasing",
  // Nala-beginner — recorded here for completeness so STYLE_MAP stays
  // exhaustive over StyleKey, but not actually used at request time:
  // buildDesignPrompt early-returns a tailored prompt for this style,
  // so this entry is fallback-only (in case a future caller bypasses
  // the early-return).
  "nala-beginner":
    "single centred chibi animal cross-stitch design, beginner-friendly small project aesthetic, very limited flat thread palette (10-13 DMC threads), large simple body shapes, NO text banner, NO floral wreath, NO decorative chrome",
};

/**
 * Strip cross-stitch/embroidery terminology from the user's description
 * BEFORE it hits GPT-Image-2.
 *
 * Why: Research-imported ideas (e.g. "mothers day cross stitch card")
 * literally contain "cross stitch" — GPT-Image-2 interprets that as
 * "render a finished cross-stitch piece in a hoop with thread and
 * aida cloth," which is the OPPOSITE of what Convert needs. We want
 * the SUBJECT (flowers, cat, whatever) as clean flat source art; the
 * Convert tab pixelates it into a stitch chart downstream.
 *
 * We strip craft-medium nouns but keep subject descriptors.
 *   "mothers day cross stitch card"         → "mothers day card"
 *   "floral cross-stitch pattern"           → "floral"
 *   "cute cat embroidery hoop design"       → "cute cat design"
 *
 * At $0.04/render this is the highest-leverage tweak we can make:
 * removes the strongest signal pushing GPT-Image-2 toward hoops.
 */
function stripCraftTerms(raw: string): string {
  // Ordered longest-first so multi-word phrases match before singles
  // (prevents leaving a dangling "pattern" after stripping "cross stitch").
  const patterns: RegExp[] = [
    /\bcross[-\s]?stitch(ed|ing)?\s+(pattern|chart|design|card|hoop|sampler|kit|piece|art|project)\b/gi,
    /\bcross[-\s]?stitch(ed|ing)?\b/gi,
    /\bembroidery\s+(hoop|pattern|design|kit|art)\b/gi,
    /\bembroider(y|ed|ing)\b/gi,
    /\bneedle[-\s]?point(ing)?\b/gi,
    /\bneedle[-\s]?work\b/gi,
    /\baida\s+cloth\b/gi,
    /\baida\b/gi,
    /\bdmc\s+(thread|floss)?\b/gi,
    /\b(floss|skein)s?\b/gi,
    /\b(wooden\s+)?(embroidery\s+)?hoops?\b/gi,
    /\b(counted\s+)?stitch(es|ing|ed)?\b/gi,
    /\bpixel(ated)?\s+(pattern|chart)\b/gi,
  ];
  let clean = raw;
  for (const p of patterns) clean = clean.replace(p, " ");
  // Collapse whitespace + clean up orphan punctuation from strips
  clean = clean
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:])\1+/g, "$1")
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
    .trim();
  // If we stripped so much there's nothing left (e.g. user literally
  // typed "cross stitch pattern"), fall back to a generic subject
  // prompt — better than sending an empty string to OpenAI.
  return clean.length >= 3 ? clean : raw;
}

/**
 * Mandatory flat-cartoon style tags appended to EVERY generation
 * prompt regardless of StyleKey.  GPT-image-2 defaults to painterly /
 * gradient output; without explicit tags it produces airbrushed cheeks,
 * tonal shading, and 30+ near-duplicate hues — which libimagequant
 * faithfully quantizes into confetti palettes.
 *
 * These mirror the Midjourney prompt the previous workflow used:
 *
 *   "flat illustration, limited color palette, white background, clean
 *    outlines, cross stitch friendly, soft pastel colors, rounded
 *    shapes, kawaii cartoon style"
 *
 * Appended to BOTH the nala-beginner branch and the general branch of
 * buildDesignPrompt.  The subject phrase ("white bunny with pink bow")
 * stays as-is at the front of the prompt; gpt-image-2 weights the
 * opener heaviest, so style tags at the end act as constraints rather
 * than the main subject of the image.
 */
const MANDATORY_FLAT_STYLE_TAGS =
  "flat illustration style, solid color fills with NO gradients and NO shading, " +
  "limited color palette of 8-12 colors maximum, pure white background, " +
  "clean bold outlines, kawaii cute cartoon style, cross-stitch friendly, " +
  "soft pastel colors, rounded simple shapes, like a sticker illustration.";


/**
 * Build the full GPT-Image-2 prompt from user fragments. Mirrors the
 * logic that used to live in `buildMjPrompt()` on the client — moved
 * here so we have one canonical prompt builder for every cross-stitch
 * rendering surface.
 */
function buildDesignPrompt(opts: {
  description: string;
  style: StyleKey;
  styleHint?: string;
}): string {
  const cleanDescription = stripCraftTerms(opts.description);
  const hintPart = opts.styleHint ? `${opts.styleHint}, ` : "";
  const isBookmark = /\bbook\s*-?\s*mark\b|book lover|reading/i.test(opts.description);

  // Nala-beginner — calibrated against NalaAndStitch's full Etsy
  // catalogue (Goose with Blue Bow, Pink Dancer Goose, White Swan,
  // Cowgirl Goose, Highland Cow, Lamb with Bow, Cavalier Spaniel,
  // Bunny in Flower Hat, Duckling, Cocker Spaniel in Party Hat,
  // Elephant with Bow, Pink Tulips).  Their formula is consistent:
  //   • single centred cute animal
  //   • EXACTLY ONE accessory (bow OR boots OR hat — never combined,
  //     never plus a flower or basket or bouquet)
  //   • soft muted pastel palette, flat solid fills
  //   • dark brown outline (not pure black)
  //   • pure white background, NOTHING else in the scene
  //   • simple children's-coloring-book aesthetic
  //   • 8-10 colours total
  //
  // Rewrite history:
  //   Iter 1 (12-bullet STRICT): too negative-heavy, model ignored.
  //   Iter 2 (8-line plain prose): better but Flux still added a
  //     second small bow at the neck on test "goose with blue bow".
  //   Iter 3 (this rewrite): explicit FORBIDDEN list calling out
  //     bouquets / flower bunches / baskets / multiple accessories,
  //     plus an enumerated reference-examples line ("white bunny
  //     with ONE pink bow, ...") that anchors gpt-image-2 on the
  //     exact pattern NalaAndStitch ships.
  if (opts.style === "nala-beginner") {
    if (isBookmark) {
      return [
        `Tall narrow cross-stitch BOOKMARK design source art: ${hintPart}${cleanDescription}, on a pure white background.`,
        "The output must look like artwork for a finished fabric bookmark: one long vertical rectangular bookmark shape, not a square hoop design.",
        "Include the full bookmark from top to bottom: stitched border, a small top hole or loop area, optional tassel cue, and the main motif arranged vertically down the bookmark.",
        "The subject and details in the title must be clearly visible on the bookmark. If the subject is an object like a key, flower, animal, or cottage motif, stretch the composition into an elegant vertical layout with decorative corner motifs or a slim border.",
        "FORBIDDEN — no embroidery hoop, no wooden frame, no oval frame, no wall art, no shelf scene, no hand, no book, no mockup background, no room photo. This is clean source art for conversion only.",
        "Flat vector-like cross-stitch source style: solid color fills, thick pure black outline around major motif shapes, no gradients, no shadows, no photoreal texture, no scenery.",
        "Limited palette: 8 to 12 distinct colors total across the entire image, including the outline color. Pure white background fills the canvas outside the bookmark.",
        "Composition: square 1:1 canvas, but the bookmark itself is tall and narrow, centered, occupying about 35-45% of canvas width and 80-90% of canvas height.",
        MANDATORY_FLAT_STYLE_TAGS,
      ].join(" ");
    }

    return [
      `Single illustrated cross-stitch design: ${hintPart}${cleanDescription}, on a pure white background.`,
      "The image contains exactly: ONE subject (animal/character/object) + the costume and props described above + white background. Nothing else.",
      // Loosened 2026-05-14: previous "ONE accessory only" rule was
      // killing the funny Ideas that have multiple props (e.g.,
      // 'Wombat in Judge Robes Banging Tiny Gavel' = robes + gavel,
      // 'Tardigrade in Tuxedo with Martini Glass' = tuxedo + glass).
      // We now include EVERY costume/prop the idea title describes.
      "Include EVERY costume item and prop described in the subject above. If the title says 'judge robes AND gavel', draw BOTH. If it says 'tuxedo AND martini glass', draw BOTH. Do not simplify the description down to 'animal with hat'.",
      "FORBIDDEN — must NOT appear anywhere in the image (other than items in the subject description): bouquets, flower bunches, single flowers as the main element, wreaths, garlands, baskets, scenery, floor, ground line, sky, leaves, branches, grass, frames, banners, ribbons with words, scrolls, speech bubbles, text, captions, dates, decorative borders, decorative elements that the user didn't ask for.",
      // 2026-05-14: Natural animal anatomy rule ported from buildReferenceGuidedPrompt.
      // Funny Ideas (Wombat Judge, Secretary Bird Detective, etc.) benefit
      // from real-animal anatomy — a real wombat in a robe is much funnier
      // than a chibi blob in a robe.  This rule overrides the "kawaii"
      // default that MANDATORY_FLAT_STYLE_TAGS appends below.
      "ANIMAL ANATOMY — CRITICAL RULE OVERRIDING ANY 'kawaii' DEFAULT: if the subject is an animal, render it with NATURAL ANIMAL ANATOMY, NOT an anthropomorphic chibi mascot. Real Etsy cross-stitch bestsellers show animals AS ACTUAL ANIMALS in costumes. Specifically: EYE POSITION must match the species — prey animals (rabbits, geese, ducks, sheep, mice, lambs, wombats) have eyes on the SIDES of the head with one eye visible in profile, NOT two giant frontal anime eyes; predators (cats, dogs, owls, foxes, secretary birds) have eyes facing forward but still small and natural. EYE SHAPE is small natural animal-eye, NOT giant manga/sparkle eyes. MOUTH is anatomically correct — beak for birds, small mouth-line for mammals, NO human-style curved smile painted on. CHEEKS: do NOT add pink blush dots on cheeks — that is a chibi anime trope, real animals don't have painted-on blush. BODY PROPORTIONS are natural for the species — a wombat has a wombat body, an axolotl has an axolotl body — NOT a chubby round mascot torso. INSECTS / SEA CREATURES (mantis shrimp, tardigrade, axolotl, butterflies, moths) have real anatomical features — segmented body, real limbs, real antennae — NOT a fluffy bear-body with stuck-on features. The output must look like a STYLIZED ILLUSTRATION OF A REAL ANIMAL in a funny costume, NOT a Pokemon or Pusheen sticker.",
      "Soft muted pastel colors, flat solid color fills only. No gradients. No shading. No shadows. No highlights. No fur texture. No feather texture. Looks like a simple coloring book page that has been filled in with flat color.",
      "BOLD PURE BLACK outline (#000000 — a SINGLE solid black color, NOT brown, NOT dark brown, NOT charcoal — just one consistent pure black tone) around the animal silhouette and major shape boundaries (head, body, limbs, the single accessory, eyes, beak, hooves). The outline must be THICK and CONTINUOUS — at least 6-8 pixels wide in the 1024px source render, with NO gaps and NO thin spots, so it survives downsampling to a 142×142 chart as a single unbroken DMC 310 black line. CRITICAL: use only ONE outline color (pure black) — do NOT mix dark brown + dark grey + near-black variants, that fragments the chart's outline into multiple DMC threads and breaks continuity. NO fine outline detail beyond major shapes — no individual fur strokes, no feather outlines, no wrinkles.",
      "Body color rule — CRITICAL FOR CHART READABILITY (2026-05-14 darkened): ANY body part, face, torso, head, or central area that would NATURALLY be cream/ivory/off-white/light beige MUST be rendered as a RICHLY DISTINCT WARM CREAM — RGB 232,213,176 / hex #E8D5B0 (visibly darker than pure white, like buttercream frosting). This applies to: white animals (bunny, goose, swan, duck, cat, sheep, lamb), animal faces with light fur, INSECT BODIES (butterflies, moths, bees, ladybugs), mushroom caps/stems, flower centers, AND any element that would otherwise blend into the white background. ABSOLUTE RULE: do NOT use any color lighter than #EAD9B5 for body fills — anything lighter (such as #F5EBD7 or #FFFAF0) quantizes as aida background in the chart and the body becomes empty unstitched cells. The background stays pure white #FFFFFF; only the SUBJECT body uses the warm cream.",
      "Style: stylized illustrated cross-stitch art (like NalaAndStitch and Cross Stitch Pattern shop bestsellers — wombat judge, gardener bunny, wedding goose, witch cat). Flat vector aesthetic. NOT photographic. NOT 3D. NOT painterly. NOT watercolor. NOT airbrush. NOT chibi sticker.",
      "Limited palette: 8 to 10 distinct colors total across the entire image, including the outline color.",
      // Reference examples updated 2026-05-14 to show the costume-character
      // style from real Etsy bestsellers (animal in role, natural anatomy).
      // These are AESTHETIC anchors only — do NOT copy the subject unless
      // the actual idea is one of these.
      "Reference aesthetic (animal as actual animal IN a costume/role, NOT chibi mascot): wombat in black judge robes holding tiny wooden gavel, looking serious; axolotl in NASA astronaut suit with helmet, floating; secretary bird in beige trench coat and brown fedora, detective pose; tardigrade in tiny tuxedo holding a martini glass; cream goose in wedding tuxedo with top hat and bow tie. Each example has the REAL ANIMAL anatomy + the costume, not a humanoid mascot with that animal's name.",
      "Square 1:1 composition. Pure white background fills the entire frame; any cream/ivory body parts use #E8D5B0 (warm cream, distinct from pure white).",
      MANDATORY_FLAT_STYLE_TAGS,
    ].join(" ");
  }

  const style = STYLE_MAP[opts.style] || STYLE_MAP.cute;
  return [
    // Front-load the render target: gpt-image-2 weights the first
    // sentence heaviest.  Asking for "cross-stitch pattern artwork of
    // X on white aida fabric" lands the entire stitch-art aesthetic in
    // one phrase — flat colours + bold outline + aida bg all flow from
    // the framing, instead of having to be argued for one negative at
    // a time.
    `Cute cross-stitch pattern artwork preview of: ${hintPart}${cleanDescription}, rendered as a finished cross-stitch design on clean white aida fabric.`,
    style,
    // Stitch-art rendering directives — the four rules that make a
    // gpt-image-2 output land cleanly on the Etsy best-seller silhouette.
    "STRICT — render as a stylised cross-stitch design, NOT a photograph: visible chunky individual X-stitch blocks across the entire subject, the image must look like a finished stitched piece of art, not a photo of an animal.",
    "STRICT — thick dark brown or near-black contour outline around the entire subject silhouette AND around major internal shape boundaries (head, body, limbs, accessories, eyes, beak, hooves, paws). Bold defined edges, the outline must be obviously readable against the white aida background, NO soft fading edges, NO white-on-white silhouette.",
    "STRICT — limited flat-colour palette, target 12 to 18 distinct colours total across the entire image. Every colour region is a flat solid block, NO smooth tonal gradients, NO continuous shading, NO airbrush blending. Where shading is needed, use 2-3 stepped flat tones (e.g. body light + body mid + body shadow) rather than a continuous gradient.",
    "STRICT — single cute chibi-style character composition, kawaii baby-animal proportions (oversized head, big expressive eyes, small body), large readable shapes everywhere, no fine detail smaller than roughly 8 source pixels so every feature survives a 100-cell stitch grid downstream.",
    // Prop-simplification kept from the prior iteration — still applies
    // in stitch-art form.  Cactus prickles / sombrero embroidery / boot
    // weave still fragment into confetti even after Python sees flat
    // source colours, so we keep these as explicit rules.
    "STRICT — accessories and props rendered as bold simple shapes with at most 1-3 visible details each.  Hats / bonnets / scarves / dresses: bold flat colour with a single accent stripe or trim, NO ornate embroidery, NO scattered tiny motifs, NO fine pattern texture.  Cactus / plants: smooth solid pads with at most 3-5 large fruit / accent shapes, NO dense prickles, NO speckled dots.  Clothing fabric: solid colour blocks, NO weave texture, NO fine stripes.",
    "STRICT — frame the subject to fill 75 to 85 percent of the square, single subject centred prominently on a clean white aida fabric texture background.  NO embroidery hoop frame around the artwork, NO wooden hoop edge, NO scenery, NO floor, NO additional decorative elements unless the user explicitly requested them.",
    // Anti-photoreal negatives — the OPPOSITE of what the prior version
    // demanded.  Tells gpt-image-2 not to drift back into product-photo
    // territory just because the subject is described realistically.
    "NOT a photograph, NOT photorealistic, NOT a real animal photograph, NOT a 3D render, NOT a toy figurine photo, NOT a stuffed-animal photo, NOT studio product photography.",
    "NOT smooth tonal gradients, NOT airbrush shading, NOT realistic feather / fur / wool micro-texture, NOT soft pastel watercolour, NOT painterly wash, NOT continuous tones, NOT subtle shadows.",
    "NOT a wooden embroidery hoop frame around the design, NOT a craft-product photograph, NOT a finished hoop hanging on a wall, NOT a hand holding a hoop, NOT a desk scene with thread / floss / needles.",
    // Canonical composition lock — square aida-fabric output, the
    // single image format Convert expects.
    "Square 1:1 composition, plain white aida fabric texture filling the background, no other elements.",
    MANDATORY_FLAT_STYLE_TAGS,
  ].join(" ");
}

/**
 * Detect whether the user's description contains explicit text/quoted
 * content that should appear in the rendered design.
 *
 * Returned in the response as `textDetected` for debug/analytics only.
 * Does NOT gate generation — the paid HQ path always renders both the
 * stitch preview and the clean Convert source (decided 2026-05-01 after
 * Codex found non-text designs converted with stitch sources produced
 * bgDmc=null + 100% fabric fill).
 */
function containsText(description: string): boolean {
  const d = description.trim();
  if (!d) return false;
  // Quoted content (straight or curly quotes) with at least 2 chars between.
  if (/["'“”‘’]\s*[\S\s]{2,}\s*["'“”‘’]/.test(d)) {
    return true;
  }
  // Indicator phrases.
  if (
    /\b(with\s+text|with\s+the\s+(?:words|quote|caption)|that\s+says|saying|the\s+(?:quote|caption|words)|read(?:s|ing)\s+(?:as|the)?|caption(?:ed)?)\b/i.test(
      d,
    )
  ) {
    return true;
  }
  // Bare keyword followed by content: "text X", "quote X", "caption X".
  if (/\b(?:text|quote|caption)\s+[A-Za-z'"]/i.test(d)) return true;
  return false;
}

/**
 * Analyze a reference image with GPT-4o mini vision and return a short
 * description of the subject and ALL accessories/clothing.
 *
 * Why: when the user clicks "Design Similar" on an Etsy cross-stitch listing,
 * the reference image is a finished cross-stitch photo (goose on gingham
 * fabric with wooden hoop).  Passing it directly to an image-edit endpoint
 * doesn't reliably transfer DISTINCTIVE DETAILS like rain boots — the model
 * focuses on the dominant texture (aida cloth, X-stitches) instead.
 *
 * Vision analysis ignores the medium (hoop, fabric) and extracts only the
 * subject + accessories in plain language: "cream goose with blue bow at neck
 * and blue rain boots".  We then build a fresh text prompt from that
 * description, which is far more reliable than trying to edit a cross-stitch
 * photo into a flat cartoon.
 */
// Per user 2026-05-16 cost-saving directive: gpt-4o-mini is disabled
// globally.  This vision call (only used by the Inspiration flow
// "Design Similar →") now short-circuits to null, so the downstream
// `buildReferenceGuidedPrompt` falls back to the title-only path.
// Flip GPT_4O_MINI_DISABLED to false to re-enable.
const GPT_4O_MINI_DISABLED = true;

async function analyzeReferenceImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  if (GPT_4O_MINI_DISABLED) {
    console.warn("[generate-design] vision analysis SKIPPED — gpt-4o-mini disabled by cost-saving flag");
    return null;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const base64 = imageBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Analyze this Etsy cross-stitch listing and identify the SCENARIO / ROLE the animal is in — not just accessories.",
                  "FIRST identify the ROLE: is the animal a bride? groom? gardener? ballerina? witch? sailor? chef? baker? clown? wedding couple? party host? holiday character? Most bestsellers have an animal CHARACTER playing a role, not just wearing a bow.",
                  "SECOND scan top-to-bottom for accessories: head (hat/veil/crown/bonnet), neck (bow/ribbon/collar/tie), body (clothing/apron/dress/suit), hands/paws (holding objects), feet (boots/shoes), AND any prop the animal is interacting with (wheelbarrow, basket, broom, flower, wand, sign, etc.).",
                  "If the image shows MANY subjects (a collection or grid): pick the ONE most distinctive/quirky character and describe just that one.",
                  "Output format: \"[animal] as [role/scenario] wearing [outfit details] and [accessories], holding/with [prop if any]\" — colors specified.",
                  "Do NOT mention: cross-stitch, embroidery, hoop, fabric, aida, pattern, stitching.",
                  "FORMAT examples (notice the structure — DESCRIBE WHAT YOU SEE, do NOT copy these subjects): if the image shows an animal in a costume → '<animal> as <role> in <outfit> with <props>'. If the image shows a single object → '<object> with <details>'. If the image shows a collection → pick ONE distinctive item → '<that one item> with <details>'.",
                  "Concrete examples ONLY to show formatting (these are NOT subjects to default to — describe what's ACTUALLY in this image): if image is a mushroom collection → 'red mushroom with white spots and green grass at base'. If image is a wedding-goose pattern → 'white goose as groom in black tuxedo with top hat'. If image is a botanical wreath → 'circular floral wreath of pink roses and green leaves'.",
                  "CRITICAL: describe ONLY what you see in THIS image. Do NOT default to 'wedding goose' or 'ballerina goose' unless the image actually shows that. If unsure, lean toward literal description of the visible content.",
                  "One sentence only, max 35 words.  Be specific about what's IN this image, not what's typical of cross-stitch in general.",
                ].join(" "),
              },
              {
                // detail:"high" sends the full image (~$0.005 instead of
                // ~$0.001 for "low") — required to spot small accessories
                // like rain boots at the bottom of a 570×570 Etsy thumbnail.
                // "low" downsamples to 512px and routinely misses footwear
                // because it occupies <8% of the frame.
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
        max_tokens: 90,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) return null;
    interface ChatResp { choices?: [{ message?: { content?: string } }] }
    const data = await (resp.json() as Promise<ChatResp>);
    const visionDesc = data?.choices?.[0]?.message?.content?.trim() ?? null;
    console.log(`[generate-design] vision analysis result: "${visionDesc}"`);
    return visionDesc && visionDesc.length > 3 ? visionDesc : null;
  } catch (err) {
    console.warn("[generate-design] vision analysis failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build a generation prompt from a vision-extracted description.
 * Used when the user has a reference image — produces a prompt that
 * FAITHFULLY includes every feature the vision step identified
 * (bow + boots + animal type) while applying the nala-beginner flat
 * cartoon visual style.
 *
 * Unlike the standard nala-beginner prompt this does NOT enforce the
 * "ONE accessory only" rule — the reference has multiple accessories
 * and we want to include them all.
 */
function buildReferenceGuidedPrompt(visionDescription: string): string {
  // Mirrors the nala-beginner style rules (charm-preserving, chart-
  // friendly) AND adds a "make it better than the reference" directive.
  // The goal is NalaAndStitch-style funny/charming designs that beat
  // the Etsy bestseller they were inspired by — not a generic clean
  // copy.  Buyer should think "oh that's even cuter than the one I
  // saw before, I want this version".
  //
  // Convert safety: flat colors + 8-10 palette + outline rules stay
  // intact, so the downstream flatten-for-convert + Python KMeans
  // still produces a clean chart even when gpt-image-2 adds creative
  // flourishes.  The flatten step normalizes whatever gpt-image-2
  // returns into flat-vector form before Python sees it.
  return [
    // ── Subject line — vision-extracted description (REPEATED for emphasis) ──
    // We REPEAT the vision description so gpt-image-2 weights the actual
    // subject heavily.  Earlier version put it once in the opener then
    // followed with so many concrete examples (goose ballerina, gardener
    // bunny, etc.) that gpt-image-2 sometimes followed an EXAMPLE instead
    // of the subject (e.g., mushroom reference → goose ballerina output).
    `THE SUBJECT IS: ${visionDescription}. Draw THIS exact subject. The image shows: ${visionDescription}. On a pure white background.`,

    // ── THE BIG DIRECTIVE — push for CREATIVE INTERPRETATION ──
    // Rewrite 2026-05-14 (v2): we no longer enumerate specific animal+role
    // combinations because the model copies them verbatim.  Instead we
    // describe the PATTERN abstractly and let vision provide the actual
    // subject.
    "MOST IMPORTANT — CREATIVE INTERPRETATION: render the EXACT subject above (do NOT swap it for a different animal or object). If the subject is an animal IN A ROLE (e.g., wedding, gardener, ballerina, witch, sailor, chef), draw it AS THAT CHARACTER with the full outfit + props — don't water down to 'animal with hat'. If the subject is a simple object (mushroom, flower, fruit), make IT visually charming and memorable on its own. The goal is a design buyers screenshot because it's unexpected and well-executed.",

    // ── Include all elements from the subject description ──
    "Include EVERY element listed in the subject description above (every accessory, costume item, prop, and pose). If the description mentions a wheelbarrow, draw the wheelbarrow. If it mentions a veil, draw the veil. If it mentions white spots on a mushroom, draw the spots. Do NOT simplify the subject into a generic version of itself.",

    // ── Style: illustrated cross-stitch (NOT chibi, NOT photoreal) ──
    "Style: STYLIZED ILLUSTRATED CROSS-STITCH art (like classic NalaAndStitch, Lord Libidan, Cross Stitch Pattern shop bestsellers). For animals: NATURAL proportions — believable character, not chibi bobble-head sticker. For plants/objects: clean botanical-illustration vibe with friendly shapes. Still warm and inviting — just illustrated like real cross-stitch bestseller patterns are.",

    // ── Animal anatomy rule — CRITICAL (2026-05-14): no humanoid mascot faces ──
    // Real Etsy bestsellers (NalaAndStitch wedding goose, Cross Stitch
    // Pattern duck-in-cup, gardener bunny, golden retriever puppy)
    // use NATURAL ANIMAL anatomy.  Our earlier "kawaii face + cheek
    // dots + smile" rule was producing humanoid Pokemon-style mascots
    // that look NOTHING like the real Etsy products.  This rule
    // explicitly negates the chibi/anthropomorphic defaults.
    "ANIMAL ANATOMY — CRITICAL RULE OVERRIDING ANY 'kawaii' DEFAULT: render the animal with NATURAL ANIMAL ANATOMY, NOT an anthropomorphic chibi mascot. Real Etsy cross-stitch bestsellers show animals AS ACTUAL ANIMALS. Specifically: EYE POSITION must match the species — prey animals (rabbits, geese, ducks, sheep, mice, lambs) have eyes on the SIDES of the head with one eye visible in profile, NOT two giant frontal anime eyes; predators (cats, dogs, owls, foxes) have eyes facing forward but still small and natural. EYE SHAPE is small natural animal-eye, NOT giant manga/sparkle eyes. MOUTH is anatomically correct — beak for birds, small mouth-line for mammals, NO human-style curved smile. CHEEKS: do NOT add pink blush dots on cheeks — that is a chibi anime trope, real animals don't have painted-on blush. BODY PROPORTIONS are natural for the species — NOT a chubby round mascot torso unless the animal naturally is round (hen, owl). INSECTS (butterflies, moths, bees) have a real segmented body and real antennae shape — NOT a fluffy bear-body with stuck-on wings. The output must look like a STYLIZED ILLUSTRATION OF A REAL ANIMAL (like the Etsy bestsellers: NalaAndStitch's natural-faced goose, Cross Stitch Pattern's bunny-with-carrot, the wedding geese), NOT a Pokemon or Pusheen or Sanrio sticker.",

    // ── FORBIDDEN environment list — exactly as nala-beginner ──
    "FORBIDDEN — must NOT appear anywhere in the image: bouquets, flower bunches, single flowers (as the main element), wreaths, garlands, baskets, scenery, floor, ground line, sky, leaves (other than tiny accent on hat), branches, grass, frames, banners, ribbons with words, scrolls, speech bubbles, text, captions, dates, decorative borders, decorative elements of any kind besides the listed accessories and the ONE allowed small accent.",

    // ── Flat-color discipline — exactly as nala-beginner ──
    "Soft muted pastel colors, flat solid color fills only. No gradients. No shading. No shadows. No highlights. No fur texture. No feather texture. Looks like a simple coloring book page that has been filled in with flat color.",

    // ── Outline rule — pure black, thick, continuous ──
    // 2026-05-14: switched from "dark brown" to "pure black" because
    // brown outlines were fragmenting into 2 DMC threads (938 Coffee
    // Brown UltraDark + 3781 Mocha Brown Dark) when gpt-image-2's
    // anti-aliasing produced slightly different brown shades along
    // the outline.  Pure black quantizes to a single DMC (310 black)
    // and stays continuous.
    "BOLD PURE BLACK outline (#000000 — a SINGLE solid black color, NOT brown, NOT dark brown, NOT charcoal — just one consistent pure black tone) around the animal silhouette and major shape boundaries (head, body, limbs, accessories, eyes, beak, hooves). The outline must be THICK and CONTINUOUS — at least 6-8 pixels wide in the 1024px source render, with NO gaps and NO thin spots, so it survives downsampling to a 142×142 chart as a single unbroken DMC 310 black line. CRITICAL: use only ONE outline color (pure black) — do NOT mix dark brown + dark grey + near-black variants, that fragments the chart's outline into multiple DMC threads and breaks continuity. NO fine outline detail beyond major shapes — no individual fur strokes, no feather outlines, no wrinkles.",

    // ── White-body ivory rule — exactly as nala-beginner ──
    "Body color rule — CRITICAL FOR CHART READABILITY (2026-05-14 darkened): ANY body part, face, torso, head, or central area that would NATURALLY be cream/ivory/off-white/light beige MUST be rendered as a RICHLY DISTINCT WARM CREAM — RGB 232,213,176 / hex #E8D5B0 (visibly darker than pure white, like buttercream frosting). This applies to: white animals (bunny, goose, swan, duck, cat, sheep, lamb), animal faces with light fur, INSECT BODIES (butterflies, moths, bees, ladybugs), mushroom caps/stems, flower centers, AND any element that would otherwise blend into the white background. ABSOLUTE RULE: do NOT use any color lighter than #EAD9B5 for body fills — anything lighter (such as #F5EBD7 or #FFFAF0) quantizes as aida background in the chart and the body becomes empty unstitched cells. The background stays pure white #FFFFFF; only the SUBJECT body uses the warm cream.",

    // ── Style line — exactly as nala-beginner ──
    "Style: simple children's coloring book illustration, flat vector aesthetic. NOT photographic. NOT 3D. NOT painterly. NOT watercolor. NOT airbrush. NOT realistic. NOT detailed.",

    // ── Palette — same as nala-beginner ──
    "Limited palette: 8 to 10 distinct colors total across the entire image, including the outline color.",

    // ── Abstract style references (NO concrete animal-role combos to copy) ──
    // 2026-05-14 v2: previous version listed "BALLERINA GOOSE — white
    // goose on tippy-toes in pink tutu...", "GARDENER BUNNY...", etc.,
    // and gpt-image-2 sometimes copied those examples verbatim even
    // when the subject was unrelated (e.g., mushroom reference produced
    // a goose ballerina).  This version describes the AESTHETIC pattern
    // without naming specific animal-role combinations.
    "Style reference (the AESTHETIC, not a literal description of what to draw): hand-illustrated cross-stitch art, single centered subject on pure white, soft warm palette, character if applicable has a kind face, clean shape silhouettes, professional bestseller-quality. Think of the polished feel of top Etsy listings — not generic AI sticker output. Whatever the SUBJECT line above says, render it in this aesthetic. DO NOT substitute the subject — if the subject is a mushroom, draw a mushroom; if it's a rabbit gardener, draw a rabbit gardener; if it's flowers, draw flowers.",

    "Square 1:1 composition. Pure white background fills the entire frame; subject body is ivory/cream if it would otherwise be white.",
    MANDATORY_FLAT_STYLE_TAGS,
  ].join(" ");
}

/**
 * Edit instruction passed to gpt-image-2's /v1/images/edits endpoint
 * along with the stitch-preview PNG as input.
 *
 * 2026-05-06 rewrite — softened from the prior aggressive
 * "absolute flat coloring-book sticker" framing to a gentler
 * "preserve charm, simplify only what's needed" framing.  The
 * 2026-05-05 aggressive version (which itself replaced an even
 * earlier preserve-everything version) drove gpt-image-2 toward
 * thick-black-outline sticker output that the user found
 * "chunky/sticker-like" once it landed in production charts.
 * Sandbox at /tmp/soft-cleanconvert-sandbox-2026-05-06/ A/B'd this
 * SOFT prompt against the previous aggressive prompt across 4
 * subjects (duck-with-quote, simple bunny, cat-on-moon, herb sprigs)
 * — SOFT won every comparison on charm preservation while landing
 * the same 13-DMC chart cap and lower stitch counts (-7% to -24%)
 * because it leaves more pastel light regions un-blocked instead of
 * forcing solid-fill coverage.
 *
 * Philosophy of the SOFT prompt:
 *   - PRESERVE the listing image's character, palette, and rounded
 *     kawaii personality.  Outlines stay proportional, not thick
 *     black sticker strokes.  Charming small details (cheek dots,
 *     eye highlights, simple flower centers) are explicitly KEPT
 *     when they read clearly at chart scale.
 *   - GENTLY SIMPLIFY only the things that genuinely fragment KMeans:
 *     fine textures, tiny veins, busy ground clutter, airbrush
 *     gradients (collapse to 1-2 stepped soft tones).
 *   - REMOVE the surface artefacts that are always wrong for a
 *     clean source: aida texture, X-blocks, weave grain, halftone
 *     dots.
 *   - DO NOT force absolute flatness, NOT thick sticker outlines,
 *     NOT redraw the subject.  Subtle 1-2 tone shading is welcomed
 *     when it adds personality.
 *
 * The downstream Python Convert at source_mode="stitch_art" still
 * applies its MedianFilter pre-pass + singleton-component absorb
 * (see pattern-engine/pipeline.py), so any extra micro-detail the
 * softer source preserves gets cleaned up at the chart level
 * without hurting cleanliness — DMC count stays at the engine cap
 * regardless.
 */
export const CLEAN_CONVERT_EDIT_PROMPT = [
  "Gently clean up this image so it converts cleanly into a cross-stitch chart, while preserving its cute pastel charm.",
  "PRESERVE (do not redraw, do not flatten away):",
  "- the subject identity, pose, and expression,",
  "- the rounded shape personality and soft kawaii styling,",
  "- the pastel color palette and overall mood,",
  "- clean medium-thickness outlines (NOT thick black sticker outlines — keep outlines proportionate to the subject),",
  "- the white background,",
  "- charming small details that read clearly at this scale: cheek dots, eye highlights, simple flower centers, small stars, tiny accent shapes that aren't sub-pixel.",
  "GENTLY SIMPLIFY (only when needed for chart readability):",
  "- noisy fine textures: single-pixel sparkles, hairline fur strands, stray micro-marks, dust speckles,",
  "- complex layered tiny details: intricate flower stamen clusters, tiny petal veins, busy ground clutter,",
  "- continuous airbrush gradients become 1-2 stepped soft tones (a base color + one gentle shadow tone — subtle shading is OK and welcomed when it adds charm),",
  "- heavy drop shadows soften to a faint hint or disappear.",
  "REMOVE entirely:",
  "- aida fabric texture,",
  "- visible cross-stitch X-blocks,",
  "- embroidery / stitch hatching,",
  "- weave / canvas grain / paper grain,",
  "- noise, film grain, halftone dots.",
  "KEEP THE LOOK:",
  "- soft pastel palette (do not desaturate or recolor),",
  "- limited but pretty color count, roughly 10-14 distinct tones,",
  "- handcrafted kawaii feel — rounded, soft, charming, NOT sterile sticker / coloring-book style.",
  "DO NOT:",
  "- force thick black sticker outlines,",
  "- force absolute flat coloring-book aesthetic,",
  "- delete charm-essential features (cheek blush, eye sparkles, tiny but visible accents),",
  "- desaturate, recolor, or reposition the design,",
  "- redraw the subject as a different character or in a different pose.",
  "Output: the same charming kawaii illustration, slightly tidier and a bit more readable as a cross-stitch chart, with subtle soft 1-2 tone shading allowed where it adds personality but no airbrush gradients, no fabric texture, and no aggressive flattening. Etsy-cute, NOT chunky-sticker.",
].join(" ");

/**
 * Engine selector — which image model actually renders the final PNG.
 *
 *   "gpt-image-2"   — OpenAI GPT-Image-2, ~$0.04/render medium quality.
 *                     Best stylistic fidelity for flat-color vector work;
 *                     used when the user commits to the paid path.
 *   "flux-free"     — Pollinations FREE Flux endpoint, zero cost.
 *                     Lower fidelity than GPT-Image-2 but perfectly
 *                     adequate as a composition / subject preview. This
 *                     is the "see how the idea looks BEFORE spending
 *                     $0.04" preview path the seller asked for.
 *
 * Prompt construction is shared between both engines so a preview ↔
 * final render pair represents the SAME underlying design brief. Only
 * the downstream service changes.
 */
type Engine = "gpt-image-2" | "flux-free" | "fal-fast";

/**
 * Call the free Pollinations Flux endpoint. Mirrors the shape of
 * generateImage() so the route handler can use either interchangeably.
 *
 * No API key required — the free tier is rate-limited per IP but
 * consistent enough for a preview-button use case where users re-roll
 * a few times per prompt. Returns a base64 data URL identical in shape
 * to what GPT-Image-2 returns, so the frontend doesn't care which
 * engine produced the image.
 */
// ── FAL.ai FLUX Schnell (paid fast path, ~2-4s, ~$0.003/image) ───────────
async function generateImageFAL(prompt: string): Promise<{
  dataUrl: string;
  model: string;
}> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("FAL_KEY not configured");

  // Synchronous endpoint — FLUX Schnell finishes in ~2-4s so no queue needed
  const resp = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",   // 1024×1024
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`FAL error ${resp.status}: ${msg.substring(0, 200)}`);
  }

  interface FalResponse { images?: { url: string; content_type?: string }[] }
  const data = await resp.json() as FalResponse;
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error("FAL: no image URL in response");

  // Fetch the image from FAL's CDN and convert to data URL
  const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!imgResp.ok) throw new Error(`FAL CDN fetch failed: ${imgResp.status}`);
  const imgBuf = await imgResp.arrayBuffer();
  const mime = imgResp.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(imgBuf).toString("base64");

  return { dataUrl: `data:${mime};base64,${b64}`, model: "fal-flux-schnell" };
}

// ── Pollinations FREE Flux (zero cost preview) ────────────────────────────
async function generateImageFluxFree(prompt: string): Promise<{
  dataUrl: string;
  model: string;
}> {
  // 1024² matches GPT-Image-2's default output size so the Convert step
  // treats preview and final renders identically. Seed is rotated so
  // re-clicking Preview with the same prompt gives a fresh image
  // (otherwise Pollinations caches aggressively on the URL).
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    seed: String(seed),
    nologo: "true",
    enhance: "true",
  });
  const url = `${POLLINATIONS_FREE_URL}/${encoded}?${params.toString()}`;

  const resp = await fetch(url, {
    method: "GET",
    // Pollinations queues requests; 90s is comfortable for the free tier
    // without pushing into Vercel's maxDuration ceiling (120s).
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    throw new Error(
      `Pollinations free ${resp.status}: ${(await resp.text().catch(() => "")).substring(0, 300) || "request failed"}`,
    );
  }

  const buf = await resp.arrayBuffer();
  // Guard against empty / HTML-error responses that sneak through as 200.
  if (buf.byteLength < 1000) {
    throw new Error(`Pollinations returned ${buf.byteLength} bytes — likely an error page, not an image`);
  }
  const mime = resp.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(buf).toString("base64");
  return {
    dataUrl: `data:${mime};base64,${b64}`,
    model: "pollinations-flux-free",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description = (body?.description ?? "").toString().trim();
    const style = (body?.style ?? "cute").toString() as StyleKey;
    const styleHint = body?.styleHint ? String(body.styleHint) : undefined;
    // Engine defaults to the paid GPT-Image-2 for backward compat with
    // callers that existed before preview mode (bulk pipeline, etc.).
    // The UI explicitly passes "flux-free" for the Preview button.
    const engine: Engine =
      body?.engine === "flux-free" ? "flux-free" :
      body?.engine === "fal-fast"  ? "fal-fast"  : "gpt-image-2";
    // Reference image URL from "Design Similar" — Etsy product thumbnail.
    // When present and engine = gpt-image-2, we fetch it and use editImage()
    // so the model can see the reference and generate something inspired by it.
    const referenceImageUrl: string | undefined = body?.referenceImageUrl ? String(body.referenceImageUrl) : undefined;

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    // IP gate: reject trademarked subjects BEFORE spending the OpenAI
    // call. A Pokémon render at $0.04/image adds up AND would still
    // get the user's Etsy shop banned if they listed it.
    const ipHit = checkIdeaForIP({ title: description });
    if (ipHit) {
      return NextResponse.json(
        {
          error: `The description contains "${ipHit}" which is trademarked. Cross-stitch patterns featuring this would get your Etsy shop banned. Please describe an original subject.`,
        },
        { status: 400 },
      );
    }

    if (!["cute", "vintage", "modern", "sampler", "pixel", "nala-beginner"].includes(style)) {
      return NextResponse.json(
        { error: `unknown style "${style}"` },
        { status: 400 },
      );
    }

    // Pre-flight: if the user typed ONLY craft terms (e.g. "cross
    // stitch pattern" with no subject), bail out with a 400 BEFORE
    // spending $0.04 on a render of… nothing meaningful. Runs the
    // same stripper buildDesignPrompt uses so the check is in sync.
    const stripped = stripCraftTerms(description);
    if (
      stripped.length < 3 ||
      // Stripper returned the raw as a fallback — means it found no
      // real subject. We detect this by comparing: if the strip
      // changed nothing AND the raw is short/craft-heavy, reject.
      (stripped === description &&
        /^(cross[-\s]?stitch|embroidery|needle(point|work)|sampler|aida|floss|thread|hoop|stitch|pattern|chart|design)[\s,.]*$/i.test(
          description.replace(/\s+/g, " ").trim(),
        ))
    ) {
      return NextResponse.json(
        {
          error:
            "Please describe the SUBJECT of your design (e.g. 'silly goose with chef hat', 'floral wreath with quote'). Don't just say 'cross stitch pattern' — the Convert tab turns your subject art INTO a pattern.",
        },
        { status: 400 },
      );
    }

    // ── Reference image — vision analysis ─────────────────────────────
    // When the user clicked "Design Similar" on an Etsy product, we have
    // a reference image URL.  Rather than trying to "edit" the cross-stitch
    // photo (which loses distinctive accessories), we call GPT-4o mini vision
    // to extract all features in plain language ("cream goose with blue bow
    // and blue rain boots"), then build a fresh prompt from that description.
    // This runs before the engine branches so ALL engines (fal-fast, flux-free,
    // gpt-image-2) benefit from the enriched subject description.
    let visionEnrichedPrompt: string | null = null;
    if (referenceImageUrl) {
      try {
        const refResp = await fetch(referenceImageUrl, { signal: AbortSignal.timeout(10_000) });
        if (refResp.ok) {
          const refBuf = Buffer.from(await refResp.arrayBuffer());
          const refMime = refResp.headers.get("content-type") || "image/jpeg";
          const visionDesc = await analyzeReferenceImage(refBuf, refMime);
          if (visionDesc) {
            visionEnrichedPrompt = buildReferenceGuidedPrompt(visionDesc);
            console.log(`[generate-design] using vision-enriched prompt for reference: "${visionEnrichedPrompt.substring(0, 200)}..."`);
          }
        }
      } catch (err) {
        console.warn("[generate-design] reference fetch failed (non-fatal):", err instanceof Error ? err.message : err);
      }
    }

    // The effective prompt: vision-enriched when reference is available,
    // standard design-prompt otherwise.
    const prompt = visionEnrichedPrompt ?? buildDesignPrompt({ description, style, styleHint });

    // Log the final prompt server-side so we can audit what each engine
    // is actually seeing without burning a render for each check.
    // Truncated to keep server logs readable — the full prompt is
    // ~600 chars, the first 240 capture the render-critical prefix.
    console.log(
      `[generate-design] engine=${engine} style=${style} ref=${!!referenceImageUrl} prompt="${prompt.substring(0, 240)}..."`,
    );

    // Free preview path — Pollinations Flux, zero cost
    if (engine === "flux-free") {
      const result = await generateImageFluxFree(prompt);
      return NextResponse.json({ dataUrl: result.dataUrl, cleanConvertDataUrl: result.dataUrl, model: result.model, engine });
    }

    // Fast paid path — FAL FLUX Schnell (~2-4s, ~$0.003/image)
    // Returns a single clean image; skips the two-step gpt-image-2 pipeline.
    if (engine === "fal-fast") {
      const result = await generateImageFAL(prompt);
      return NextResponse.json({ dataUrl: result.dataUrl, cleanConvertDataUrl: result.dataUrl, model: result.model, engine });
    }

    // Paid path — gpt-image-2.  Always render BOTH the stitch preview
    // (for listing/mockup) AND a clean flat-vector source (for
    // Convert).  The clean source is now a STYLE TRANSFER of the
    // stitch preview via /v1/images/edits, so subject / pose /
    // objects / text / composition all match.  This is sequential —
    // step 2 needs step 1's PNG as input — so end-to-end is roughly
    // 2× a single generation (~120-140s).
    //
    // Quality "medium" is the sweet spot for flat-color vector work
    // that gets re-quantized into a cross-stitch chart anyway.
    // "high" ($0.17 vs $0.04) doesn't improve stitch-friendliness.
    //
    // textDetected is informational only (see containsText() doc).
    const textDetected = containsText(description);
    console.log(
      `[generate-design] dual-prompt edit-flow always-on (textDetected=${textDetected}). step 1: generate stitch preview...`,
    );

    // Step 1 — generate the stitch preview.
    // For reference-guided generation the prompt is already vision-enriched
    // (all accessories extracted); we use text-to-image (generateImage) for
    // both reference and non-reference paths.  The old editImage() reference
    // approach is removed — it confused the model because it tried to "edit"
    // a cross-stitch photo rather than working from a clean description.
    const stitchResult = await generateImage({
      prompt,
      quality: "medium",
      size: "1024x1024",
      caller: `cross-stitch/generate-design[stitch-preview${referenceImageUrl ? "-vision-guided" : ""}]`,
    });

    // Step 2 — style-edit the stitch preview into a clean
    // flat-vector source for Convert.  Decoding the data URL back
    // to a Buffer because that's what editImage() expects (it
    // builds a multipart/form-data body for /v1/images/edits, which
    // requires raw image bytes, not data URLs).
    //
    // SKIPPED for nala-beginner mode: the Beginner / Etsy prompt
    // already produces a Nala-clean listing image (single subject,
    // ONE accessory, white bg, flat fills, dark outline).  The
    // SOFT edit pass (CLEAN_CONVERT_EDIT_PROMPT) is tuned to
    // "preserve charm" by keeping cheek dots, eye sparkles, and
    // simple flower centers — which on a Beginner source it
    // helpfully ADDS as new decorative elements (scattered pink
    // flowers, yellow stars, small hearts).  Those additions
    // violate the Beginner formula's "ONE animal + ONE accessory +
    // nothing else" rule.  For Beginner mode, the listing image
    // goes straight to cleanConvertDataUrl unchanged.  Saves a
    // gpt-image-2 edit call (~$0.04) per Beginner generation as a
    // bonus.
    let cleanConvertDataUrl: string;
    // Step 2 (SOFT edit) is ONLY skipped for nala-beginner.  Even when the
    // user has a reference image and a vision-enriched prompt, gpt-image-2's
    // raw output still has subtle gradients and anti-aliased edges that the
    // Python KMeans+DMC quantizer reads as confetti.  SOFT cleanup flattens
    // those before Python sees the image.  Skipping SOFT for reference-guided
    // generation (which I tried in this session) caused the pattern output
    // quality to regress — Python received a ~30-tone gradient image and
    // produced a salt-and-pepper chart instead of clean color regions.
    if (style === "nala-beginner") {
      cleanConvertDataUrl = stitchResult.dataUrl;
      console.log(
        `[generate-design] step 2 skipped (nala-beginner) — source is already flat/clean.`,
      );
    } else {
      const stitchPreviewBytes = Buffer.from(
        stitchResult.dataUrl.split(",", 2)[1] ?? "",
        "base64",
      );
      console.log(
        `[generate-design] step 2: edit listing PNG (${stitchPreviewBytes.length} bytes) into clean flat-vector source...`,
      );
      const cleanResult = await editImage({
        images: [
          {
            buffer: stitchPreviewBytes,
            mimeType: "image/png",
            filename: "listing-preview.png",
          },
        ],
        prompt: CLEAN_CONVERT_EDIT_PROMPT,
        quality: "medium",
        size: "1024x1024",
        caller: "cross-stitch/generate-design[clean-convert-edit]",
      });
      cleanConvertDataUrl = cleanResult.dataUrl;
    }

    return NextResponse.json({
      dataUrl: stitchResult.dataUrl,
      cleanConvertDataUrl,
      model: stitchResult.model,
      engine,
      textDetected,
    });
  } catch (err) {
    if (err instanceof OpenAIImageError) {
      // Preserve upstream status so the UI can distinguish rate limit
      // (429) from bad prompt (400) from server error (500).
      return NextResponse.json(
        { error: err.message, model: err.model },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : "generate-design failed";
    console.error("[generate-design] failed:", msg);
    return NextResponse.json({ error: msg, model: IMAGE_MODEL }, { status: 500 });
  }
}
