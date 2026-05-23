// ══════════════════════════════════════════════════════════════
// Creative Boost — shared prompt fragment for trend/idea endpoints
//
// CALIBRATED AGAINST ETSY TOP-SELLERS (April 2026 scan)
//
// The earlier version over-rotated on humor/snark because we
// assumed cross-stitch on Etsy was mostly sarcasm-driven. That
// assumption was wrong. A scan of the top ~80 results for
// "cross stitch pattern" (most-relevant + "Funny" filter) showed:
//
//   ~50%  cute farm animals — geese in boots, highland cows in
//         teacups, frogs with florals, ducks, chickens. This is
//         THE dominant lane, not humor.
//   ~20%  cottagecore samplers — jam jar shelves (13k+ reviews),
//         12-month house calendars, wildflower/bumblebee pieces.
//   ~15%  seasonal/holiday (Easter, Mother's Day at scan time,
//         spring florals).
//   ~10%  humor — and even here, the winners were CUTE SUBJECT +
//         SILLY CAPTION ("HONK HONK" goose in toy car, "YEE HAW"
//         cowboy duck), NOT pure snarky-quote samplers.
//    ~5%  pure snark / dark / edgy as bestseller — most snark
//         lives in ads and recommendations, not organic rankings.
//
// So this module now biases toward cute-animal-as-protagonist
// + cottagecore + seasonal, while keeping humor/snark/nostalgia
// as smaller rotating lenses so output stays varied.
//
// Two problems this still solves:
//
//   1. "Same output every time" — Gemini sees identical inputs
//      and returns identical picks. We inject a rotating "angle
//      of the call" picked via weighted sampling, plus a nonce
//      so each call is measurably distinct.
//
//   2. "Anchor on proven winners" — Gemini left alone proposes
//      category labels ("autumn floral sampler"). We inject the
//      observed winning formulas (goose-in-boots, highland-cow-
//      in-teacup, frog-in-flower-teacup, HONK-HONK-vehicle-goose,
//      house-calendar-sampler, jam-jar-shelf) so riffing happens
//      on compositions that actually sell.
// ══════════════════════════════════════════════════════════════

/** Tone lenses the ideation pass is biased toward on any given call.
 *  Weighted sampling picks one per request — weights reflect the
 *  market share each lane holds in Etsy cross-stitch top results,
 *  NOT our prior assumptions about what "should" sell. */
const ANGLES: { name: string; description: string; weight: number }[] = [
  {
    name: "CUTE FARM ANIMAL WHIMSY",
    weight: 30,
    description:
      "The single biggest lane on Etsy cross-stitch. A charming farm animal as the protagonist — goose in pink boots, highland cow in a teacup, frog in a floral teacup, duckling in a flower hat, chicken sampler, mother goose with ducklings. Often wearing a bow, hat, or bonnet. A soft silly caption is optional but the STAR is the cute animal character. Anchors: 'Goose In Pink Boots' (Bestseller, $4.34), 'Cute Teacup Highland Cow' (Bestseller), 'Spring Frog in Flower Teacup' (1.8k reviews).",
  },
  {
    name: "COTTAGECORE COZY",
    weight: 18,
    description:
      "Soft, warm, wholesome — vintage jam-jar shelves, teapots, mushrooms, wildflowers, bumblebees, strawberries, floral borders, gingham-and-lace backgrounds, woodland scenes. The #1 non-animal lane. Anchors: 'Happy Little Jam Jars' ($8.10, 13.1k reviews), 'Bumblebee Wildflower Sampler', '12 Month House Calendar' (Bestseller).",
  },
  {
    name: "SEASONAL / HOLIDAY-SPECIFIC",
    weight: 15,
    description:
      "Anchored on an upcoming event within 45 days, with a specific design angle — NOT a generic 'Christmas sampler'. Easter duck trios, Mother's Day goose-and-duckling, Halloween spooky-cute, Valentine heart samplers, July 4th patriotic mouse. Combine the event with a cute animal or cottagecore motif for maximum sellability.",
  },
  {
    name: "FUNNY & SNARKY QUOTE",
    weight: 10,
    description:
      "Quote-forward designs — sarcastic adult-burnout humor, stitcher in-jokes ('I don't need therapy, I just need more aida and DMC floss'), pet-owner jokes, relatable one-liners. Typically framed with a decorative floral or gingham border. Smaller lane than assumed but still real — lean in when the call angle demands it.",
  },
  {
    name: "VINTAGE SAMPLER / NOSTALGIA",
    weight: 10,
    description:
      "Classic cross-stitch heritage motifs — alphabet samplers, house-of-the-month calendars, vintage floral borders, 80s/90s nostalgia revival, old-school Americana, retro textbook illustrations, countryside scenes, hen-and-chick samplers. These convert well because buyers see them as 'proper' cross-stitch.",
  },
  {
    name: "HOBBY / IDENTITY PRIDE",
    weight: 7,
    description:
      "Designs that loudly announce a hobby, profession, or identity — readers, gardeners, nurses, cat moms, D&D players, runners, teachers, knitters. Usually paired with a cute supporting illustration (cat on book, floral stethoscope). Gift-driven purchases.",
  },
  {
    name: "DARK HUMOR / COTTAGEGOTH",
    weight: 5,
    description:
      "Slightly morbid cuteness — skeletons drinking tea, haunted mushrooms, moody ghosts, witchy vibes, black cat + moon samplers. Gen-Z/Millennial lane. Niche but loyal — use sparingly so output doesn't skew edgy.",
  },
  {
    name: "MOTIVATIONAL / AFFIRMATION",
    weight: 3,
    description:
      "Affirmations on florals, self-love quotes, therapy-speak turned into wall art, gentle encouragements. Works when paired with a strong floral or cute-animal background.",
  },
  {
    name: "POP-CULTURE RIFF (NO IP)",
    weight: 2,
    description:
      "Original designs riffing on a cultural mood or meme format — NOT copying any trademarked IP. Western cowboy animals ('Cowboy Duck'), cottagegoth aesthetics, fandom-adjacent vibes via original symbolism. Rarest lane — use for variety only.",
  },
];

/** Weighted-random angle pick. Weights sum to 100 and reflect
 *  observed Etsy market share so ideation output matches what
 *  actually sells, not what we assume sells. */
export function pickCreativeAngle(): { name: string; description: string } {
  const totalWeight = ANGLES.reduce((sum, a) => sum + a.weight, 0);
  let r = Math.random() * totalWeight;
  for (const angle of ANGLES) {
    r -= angle.weight;
    if (r <= 0) return { name: angle.name, description: angle.description };
  }
  // Fallback — shouldn't be reached, but guarantees a return.
  return { name: ANGLES[0].name, description: ANGLES[0].description };
}

/** Observed top-seller compositions — injected into every prompt so
 *  Gemini anchors on proven winning patterns rather than generic
 *  category labels. Updated from the April 2026 Etsy scan. */
const WINNING_FORMULAS = `
Observed top-selling compositions on Etsy cross-stitch (anchor your ideas as riffs of these proven formulas):
- Cute animal + footwear combo: "Goose In Pink Boots", "Goose with Green Hat & Boots", "Yee Haw Cowboy Duck"
- Cute animal + teacup/drink: "Highland Cow in Teacup with Florals", "Frog in Floral Teacup", "Cozy Goose Hot Chocolate Blanket"
- Cute animal + vehicle (silly caption): "HONK HONK Goose in Toy Car", "Got Too Silly Goose in Cop Car"
- Cute animal + bow + gingham background: "Goose with Blue Bow" (Bestseller, 115 reviews), "Vintage Goose Lace Heart"
- Multi-pack variation sheet: "Dressed Goose 9 Mini Geese Pack", "Chicken Sampler", "Mallard Duck PDF Bundle"
- Cottagecore shelf sampler: "Happy Little Jam Jars" (13.1k reviews!), "12 Month House Calendar"
- Wholesome wildlife + florals: "Bumblebee Wildflower Sampler", "Spring Frog in Tea Garden"
- Seasonal cute-animal mashup: "Easter Duck Trio Cottagecore", "Spring Geese Garden Pastel"
- Stitcher in-joke with decorative border: "I Don't Need Therapy, I Just Need More Aida and DMC Floss"

Price sweet spot: $3–$6 (most top-sellers are $5–$8 sticker heavily discounted 50–75%).
`.trim();

/** Tone block injected into every ideation prompt. Anchors Gemini on
 *  observed top-seller formulas, then varies the output via the
 *  rotating call angle so consecutive calls produce different picks. */
export function creativeBoostBlock(angle: { name: string; description: string }): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `
═══ ETSY MARKET REALITY (April 2026 top-seller scan) ═══
Cross-stitch on Etsy is dominated by CUTE FARM ANIMALS (geese, ducks, cows, frogs, chickens) as protagonists — usually in boots, hats, or teacups, often with a soft silly caption but the STAR is the cute character. Cottagecore samplers (jam jars, house calendars, wildflowers) are the strong #2 lane. Seasonal/holiday-timed designs sell well when tied to a specific cute motif. Pure snark-quote humor IS a lane but smaller than commonly assumed — quote-only designs typically sit in ads, not organic top rankings.

${WINNING_FORMULAS}

═══ CALL ANGLE FOR THIS REQUEST: "${angle.name}" ═══
${angle.description}

Hard requirements:
- Anchor each idea on a PROVEN WINNING COMPOSITION above — remix, don't reinvent. Example: "goose in pink boots" → "duckling in yellow rain boots with umbrella"; "highland cow in teacup" → "baby cow peeking out of coffee mug with daisies".
- Each title must be SPECIFIC enough to start designing from — subject + style + mood (add a caption only when the lane is humor-forward). Bad: "autumn patterns". Good: "Highland Cow Peeking From Pumpkin-Spice Mug — Autumn Cottagecore".
- Include AT LEAST ONE humor-forward concept (cute-subject + silly caption) even when the call angle is non-humor, since that pairing is a consistent secondary lane. Do NOT let humor dominate — the primary lane is cute-animal whimsy.
- Concepts should feel DIFFERENT from what this endpoint returned on the previous call — the call angle above is the tiebreaker when signals are identical.

Nonce (ignore, just for variety): ${nonce}
`.trim();
}

/** Convenience: combined picker + block in one call. */
export function creativeBoost(): string {
  return creativeBoostBlock(pickCreativeAngle());
}
