/* ═══════════════════════════════════════════════════════════════════
 * TRADEMARK / IP FILTER
 *
 * Etsy aggressively removes cross-stitch listings that use protected
 * characters, franchises, or brands. Repeated offenses get shops
 * banned. Every idea-generator in this app (Live Pulse, Best Idea,
 * emerging trends, autocomplete) runs its outputs through this
 * filter BEFORE surfacing them to the user.
 *
 * This list is curated — not exhaustive. It covers the 95% of
 * terms that would get a shop suspended. When in doubt, fall back
 * to the official Etsy IP policy and/or the LegalZoom checker.
 *
 * Matching uses word-boundary checks against a lowercased needle,
 * so "pokemon" matches "pokemon pattern" but NOT "unpokemonlike"
 * (won't happen, but illustrates the guard).
 * ═══════════════════════════════════════════════════════════════════ */

// Each entry is a lowercased substring. Multi-word phrases are matched
// as-is (whitespace-sensitive). If you add entries, keep them
// alphabetized within their section to make reviews easier.
const TRADEMARKED_TERMS: readonly string[] = [
  // ── Pokémon franchise ────────────────────────────────────────
  "pokemon", "pokémon", "pokeball", "poke ball", "pikachu",
  "charizard", "charmander", "charmeleon", "bulbasaur", "ivysaur",
  "venusaur", "squirtle", "wartortle", "blastoise", "eevee",
  "mewtwo", "mew", "snorlax", "jigglypuff", "psyduck", "gengar",
  "lucario", "gardevoir", "sylveon", "espeon", "umbreon",
  "vaporeon", "flareon", "jolteon", "leafeon", "glaceon",
  "ditto pokemon", "lapras", "growlithe", "arcanine", "ninetales",
  "dragonite", "magikarp", "gyarados", "togepi",

  // ── Disney + Pixar characters ────────────────────────────────
  "disney", "mickey mouse", "minnie mouse", "donald duck", "daisy duck",
  "goofy disney", "pluto disney", "elsa", "anna frozen", "olaf frozen",
  "frozen disney", "ariel", "belle disney", "cinderella",
  "rapunzel", "moana", "mulan", "jasmine disney", "pocahontas",
  "aurora disney", "snow white", "tiana disney", "merida",
  "simba", "nala", "timon", "pumbaa", "lion king",
  "lilo and stitch", "stitch disney", "winnie the pooh", "winnie pooh",
  "eeyore", "tigger", "piglet", "bambi", "dumbo",
  "alice in wonderland", "cheshire cat", "mad hatter",
  "peter pan", "tinkerbell", "tinker bell", "captain hook",
  "mary poppins", "toy story", "buzz lightyear", "woody toy",
  "jessie toy story", "wall-e", "wall e", "eve wall-e",
  "finding nemo", "dory", "monsters inc", "monsters university",
  "sulley", "incredibles", "coco disney", "miguel coco",
  "up pixar", "brave pixar", "merida brave", "inside out",
  "cars pixar", "lightning mcqueen", "mater", "ratatouille", "remy",
  "cruella", "maleficent", "encanto", "mirabel", "bruno madrigal",
  "zootopia", "judy hopps", "nick wilde", "big hero 6",
  "baymax", "frozen elsa", "olaf",

  // ── Marvel ───────────────────────────────────────────────────
  "marvel", "avengers", "spider-man", "spiderman", "spider man",
  "iron man", "ironman", "tony stark", "captain america", "steve rogers",
  "thor marvel", "hulk marvel", "bruce banner", "black widow",
  "hawkeye", "black panther", "wakanda", "doctor strange",
  "scarlet witch", "wanda maximoff", "vision marvel", "falcon marvel",
  "winter soldier", "bucky barnes", "loki marvel", "thanos",
  "deadpool", "wolverine", "x-men", "xmen", "x men",
  "professor x", "magneto", "storm x-men", "cyclops x-men",
  "gamora", "groot", "rocket raccoon", "star-lord", "star lord",
  "venom marvel", "carnage marvel", "daredevil", "punisher marvel",
  "moon knight", "she-hulk", "ms marvel", "kamala khan",

  // ── DC Comics ────────────────────────────────────────────────
  "dc comics", "superman", "clark kent", "batman", "bruce wayne",
  "batgirl", "batwoman", "wonder woman", "diana prince",
  "the flash dc", "barry allen", "aquaman", "green lantern",
  "joker dc", "harley quinn", "catwoman", "poison ivy dc",
  "supergirl", "nightwing", "robin dc",

  // ── Star Wars ────────────────────────────────────────────────
  "star wars", "darth vader", "luke skywalker", "leia",
  "han solo", "yoda", "baby yoda", "grogu", "the mandalorian",
  "mandalorian", "boba fett", "jango fett", "chewbacca",
  "r2-d2", "r2d2", "c-3po", "c3po", "bb-8", "bb8",
  "kylo ren", "rey skywalker", "obi-wan", "obi wan",
  "palpatine", "emperor palpatine", "stormtrooper",
  "death trooper", "ahsoka", "ahsoka tano",

  // ── Harry Potter / Wizarding World ───────────────────────────
  "harry potter", "hogwarts", "gryffindor", "slytherin",
  "hufflepuff", "ravenclaw", "hermione granger", "ron weasley",
  "dumbledore", "voldemort", "severus snape", "draco malfoy",
  "fantastic beasts", "niffler", "hedwig", "marauder's map",

  // ── Nintendo ─────────────────────────────────────────────────
  "nintendo", "super mario", "mario bros", "luigi nintendo",
  "princess peach", "princess daisy", "bowser", "yoshi",
  "toad mario", "donkey kong", "diddy kong", "zelda",
  "link zelda", "legend of zelda", "breath of the wild",
  "tears of the kingdom", "ganon", "ganondorf",
  "metroid", "samus aran", "kirby nintendo", "starfox",
  "splatoon", "animal crossing", "tom nook", "isabelle animal",

  // ── Studio Ghibli ────────────────────────────────────────────
  "studio ghibli", "ghibli", "totoro", "my neighbor totoro",
  "spirited away", "chihiro", "no face", "kiki's delivery",
  "howl's moving castle", "howl ghibli", "princess mononoke",
  "ponyo", "kodama", "catbus", "jiji kiki", "arrietty",

  // ── Sanrio ───────────────────────────────────────────────────
  "hello kitty", "sanrio", "my melody", "kuromi", "cinnamoroll",
  "pompompurin", "gudetama", "keroppi", "badtz-maru", "aggretsuko",

  // ── Peanuts / classic American cartoons ──────────────────────
  "snoopy", "charlie brown", "peanuts gang", "woodstock peanuts",
  "garfield", "odie garfield", "jon arbuckle",
  "spongebob", "squarepants", "patrick star", "sandy cheeks",
  "squidward", "mr krabs",
  "sesame street", "elmo", "big bird", "cookie monster",
  "oscar the grouch", "bert and ernie", "kermit", "miss piggy",
  "the muppets", "muppet show",
  "scooby doo", "scooby-doo", "shaggy scooby", "velma",
  "tom and jerry", "looney tunes", "bugs bunny", "daffy duck",
  "porky pig", "tweety", "sylvester cat", "road runner",
  "wile e coyote", "marvin the martian", "taz", "tasmanian devil",

  // ── Modern TV cartoons ───────────────────────────────────────
  "simpsons", "homer simpson", "bart simpson", "lisa simpson",
  "marge simpson", "family guy", "peter griffin", "stewie griffin",
  "brian griffin", "rick and morty", "south park", "eric cartman",
  "adventure time", "finn the human", "jake the dog",
  "steven universe", "powerpuff girls", "dexter's laboratory",
  "ben 10", "teen titans", "bluey", "peppa pig", "george pig",
  "paw patrol", "cocomelon", "my little pony", "rainbow dash",
  "twilight sparkle", "fluttershy", "pinkie pie",

  // ── Anime (major franchises) ─────────────────────────────────
  "naruto", "sasuke uchiha", "sakura haruno", "kakashi",
  "itachi", "akatsuki naruto", "hinata naruto",
  "one piece", "monkey d luffy", "roronoa zoro", "nami one piece",
  "dragon ball", "goku", "vegeta", "piccolo dbz", "saiyan",
  "super saiyan", "gohan", "frieza",
  "attack on titan", "shingeki no kyojin", "eren yeager",
  "mikasa ackerman", "levi ackerman", "armin arlert",
  "demon slayer", "kimetsu no yaiba", "tanjiro", "nezuko",
  "zenitsu", "inosuke", "giyu tomioka",
  "my hero academia", "boku no hero", "deku midoriya", "bakugo",
  "all might", "shoto todoroki",
  "jujutsu kaisen", "gojo satoru", "yuji itadori", "megumi fushiguro",
  "sailor moon", "usagi tsukino", "tuxedo mask",
  "death note", "light yagami", "ryuk",
  "bleach anime", "ichigo kurosaki",
  "fullmetal alchemist", "edward elric", "alphonse elric",
  "evangelion", "rei ayanami", "asuka langley", "shinji ikari",
  "chainsaw man", "denji", "power chainsaw",
  "spy x family", "anya forger", "loid forger",
  "jojo bizarre", "jotaro kujo", "dio brando",
  "one punch man", "saitama",
  "hunter x hunter", "gon freecss", "killua",
  "cowboy bebop", "tokyo ghoul",
  "haikyuu", "your name anime",

  // ── Video games ──────────────────────────────────────────────
  "minecraft", "creeper minecraft", "steve minecraft", "enderman",
  "roblox", "fortnite", "among us", "crewmate", "impostor",
  "sonic the hedgehog", "sonic cross stitch", "tails sonic",
  "knuckles sonic", "shadow the hedgehog", "amy rose",
  "mega man", "megaman", "pac-man", "pacman", "pac man",
  "ms pac-man", "tetris", "space invaders",
  "street fighter", "ryu street", "chun-li", "ken street fighter",
  "mortal kombat", "scorpion kombat", "sub-zero",
  "final fantasy", "chocobo", "moogle", "cloud strife",
  "world of warcraft", "warcraft", "diablo blizzard",
  "overwatch", "tracer overwatch", "mercy overwatch",
  "halo master chief", "master chief", "call of duty",
  "cuphead", "mugman", "hollow knight", "undertale",
  "sans undertale", "papyrus undertale", "deltarune",
  "stardew valley", "fall guys", "genshin impact", "honkai",
  "league of legends", "valorant", "apex legends",
  "dota 2", "counter-strike", "cs:go",
  "five nights at freddy's", "fnaf", "freddy fazbear",
  "metal gear solid", "solid snake", "resident evil",

  // ── Brands (Etsy blocks direct brand reproductions) ──────────
  "coca-cola", "coca cola", "pepsi cola", "starbucks", "mcdonalds",
  "mcdonald's", "burger king", "kfc chicken",
  "nike swoosh", "nike cross", "adidas stripes", "apple logo",
  "apple iphone", "google logo", "microsoft logo", "meta facebook",
  "gucci logo", "louis vuitton", "chanel logo", "prada logo",
  "supreme brand", "bmw logo", "mercedes logo", "ferrari logo",
  "lamborghini", "rolex watch",

  // ── Music artists (likenesses are protected) ─────────────────
  "taylor swift", "swiftie era", "bts kpop", "blackpink",
  "beyonce", "jay-z", "kanye west", "drake rapper",
  "the beatles", "rolling stones", "elvis presley",
  "michael jackson", "madonna singer", "lady gaga",
  "ariana grande", "billie eilish", "olivia rodrigo",

  // ── TV / movie franchises ────────────────────────────────────
  "game of thrones", "house of the dragon", "targaryen",
  "stark game", "daenerys", "jon snow",
  "stranger things", "eleven stranger", "hawkins indiana",
  "demogorgon", "breaking bad", "walter white", "heisenberg",
  "the office show", "dunder mifflin", "michael scott",
  "friends tv", "central perk", "seinfeld",
  "the witcher", "geralt of rivia",
  "the crown netflix", "squid game", "bridgerton",
  "barbie movie", "barbie doll", "ken barbie",
  "polly pocket", "hot wheels", "matchbox cars",
  "lego", "duplo lego", "lego movie",
  "trolls movie", "poppy trolls", "shrek", "donkey shrek",
  "fiona shrek", "puss in boots",
  "kung fu panda", "po panda", "how to train your dragon",
  "toothless dragon", "hiccup dragon",
  "minions", "despicable me", "gru minion",
  "madagascar movie", "alex the lion",
  "happy meal", "build a bear", "american girl doll",
  "cabbage patch kids", "care bears",

  // ── Sports leagues + iconic team marks ───────────────────────
  "nfl logo", "nba logo", "mlb logo", "nhl logo",
  "fifa world cup", "olympics rings", "super bowl",
  "lakers lebron", "patriots nfl",
];

// Precompute character-class lookup so the hot path is branch-free.
const ALNUM = /[a-z0-9]/;

/* ─────────────────────────────────────────────────────────────
 * getTrademarkMatch(term)
 * Returns the first blocklisted needle that matches `term`
 * with word boundaries, or null. Used for UI warnings so we can
 * say "⚠️ Pokemon" instead of a generic flag.
 *
 * Word boundary check: the needle must not be flanked by
 * alphanumerics on either side. This correctly handles:
 *   "pokemon cross stitch" → matches "pokemon"
 *   "dumb pokemon puns"    → matches "pokemon"
 *   "impokemonate"         → does NOT match (prefix letter)
 * ───────────────────────────────────────────────────────────── */
export function getTrademarkMatch(term: string): string | null {
  if (!term) return null;
  const lower = term.toLowerCase();
  for (const tm of TRADEMARKED_TERMS) {
    const idx = lower.indexOf(tm);
    if (idx < 0) continue;
    const before = idx === 0 ? "" : lower[idx - 1];
    const endIdx = idx + tm.length;
    const after = endIdx >= lower.length ? "" : lower[endIdx];
    if (!ALNUM.test(before) && !ALNUM.test(after)) return tm;
  }
  return null;
}

export function isTrademarked(term: string): boolean {
  return getTrademarkMatch(term) !== null;
}

/** Convenience: filter an array, dropping any item whose `getTerm`
 * output matches a trademarked needle. Does NOT mutate the source. */
export function filterOutTrademarked<T>(items: T[], getTerm: (item: T) => string): T[] {
  return items.filter((i) => !isTrademarked(getTerm(i)));
}

/* ─────────────────────────────────────────────────────────────
 * checkIdeaForIP(idea)
 * Scans title + tags + search_query for any TM hits. Returns
 * the matched term or null. Use this as a last-line defense
 * on Gemini-generated ideas before surfacing them. */
export function checkIdeaForIP(idea: {
  title?: string;
  tags?: string[];
  search_query?: string;
  image_prompt?: string;
}): string | null {
  const fields = [idea.title, idea.search_query, idea.image_prompt, ...(idea.tags ?? [])];
  for (const f of fields) {
    if (!f) continue;
    const hit = getTrademarkMatch(f);
    if (hit) return hit;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────
 * IP_GUARDRAIL_PROMPT
 * The boilerplate every Gemini prompt should include so the
 * model doesn't even TRY to propose trademarked subjects.
 * Kept as a single string so copy stays consistent. */
export const IP_GUARDRAIL_PROMPT = `
CRITICAL — INTELLECTUAL PROPERTY RULES (VIOLATION = SHOP BAN):
- NEVER propose products based on copyrighted or trademarked characters, franchises, or brands. This includes but is not limited to:
  Pokemon/Pokémon, Disney (Mickey, Elsa, Stitch, etc.), Pixar, Marvel, DC, Star Wars, Harry Potter, Nintendo (Mario, Zelda, Kirby), Studio Ghibli (Totoro), Sanrio (Hello Kitty), Peanuts, Garfield, SpongeBob, Sesame Street, Looney Tunes, any anime franchise (Naruto, Dragon Ball, Demon Slayer, My Hero Academia, Jujutsu Kaisen, Sailor Moon, etc.), Minecraft, Roblox, Fortnite, Sonic, any sports league logo, any brand logo (Nike, Apple, Coca-Cola, etc.), any celebrity/musician likeness.
- Even "inspired by" or "unofficial" versions of the above WILL get the shop banned on Etsy.
- If a live trend references a trademarked franchise (e.g. "pokemon cross stitch is spiking"), DO NOT propose a pokemon pattern — instead, extract the underlying aesthetic (e.g. "pixel-art monsters with elemental themes") and propose an ORIGINAL, non-IP version.
- Favor original designs: cottagecore animals, botanical/floral, abstract geometric, mandalas, public-domain fairytales, generic holiday motifs, original typography/quotes, nature subjects, food, hobbies.
`.trim();
