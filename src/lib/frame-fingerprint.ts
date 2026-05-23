// Client-side perceptual fingerprinting for frame mockup images.
//
// Goal: when the user uploads a frame image that looks similar to one
// they've positioned before, instantly restore the saved position without
// running detection or requiring any manual work.
//
// We use a 9x8 dHash (difference hash): downsample to grayscale, compare
// adjacent horizontal pixels, pack 64 bits. Similar images have similar
// hashes. Hamming distance < ~12 bits = match.

export type FramePosition = {
  x: number;          // center x (0-100)
  y: number;          // center y (0-100)
  scale: number;      // width percentage
  aspect: number;     // height / width
  shape: "circle" | "oval" | "rectangle";
};

export type CachedFrame = {
  hash: string;         // hex dhash
  pos: FramePosition;
  savedAt: number;      // ms since epoch
};

const CACHE_KEY = "frame_position_cache_v19";
const HASH_SIZE = 9; // 9x8 grid → 8*8 = 64 bits
const HASH_HEIGHT = 8;
const MATCH_THRESHOLD = 12; // hamming distance; <= this means "same frame"
const MAX_CACHE = 60;

/** Compute a 64-bit dhash as a 16-char hex string from an image element. */
export async function computeFingerprint(imgSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = HASH_SIZE;
        canvas.height = HASH_HEIGHT;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_HEIGHT);
        const data = ctx.getImageData(0, 0, HASH_SIZE, HASH_HEIGHT).data;

        // Grayscale values
        const gray = new Uint8Array(HASH_SIZE * HASH_HEIGHT);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        }

        // Horizontal gradient: each row contributes 8 bits (compare cols 0..7 with 1..8)
        const bits: number[] = [];
        for (let y = 0; y < HASH_HEIGHT; y++) {
          for (let x = 0; x < HASH_SIZE - 1; x++) {
            const left = gray[y * HASH_SIZE + x];
            const right = gray[y * HASH_SIZE + x + 1];
            bits.push(left < right ? 1 : 0);
          }
        }

        // Pack 64 bits to hex
        let hex = "";
        for (let i = 0; i < bits.length; i += 4) {
          const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
          hex += nibble.toString(16);
        }
        resolve(hex);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imgSrc;
  });
}

/** Hamming distance between two equal-length hex strings. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

function readCache(): CachedFrame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CachedFrame[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCache(cache: CachedFrame[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep most recent MAX_CACHE entries
    const trimmed = cache.slice(-MAX_CACHE);
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded — drop oldest half and retry once
    try {
      const trimmed = cache.slice(-Math.floor(MAX_CACHE / 2));
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } catch { /* give up silently */ }
  }
}

/** Look up a previously-saved position for a similar-looking frame. */
export function findCachedPosition(hash: string): FramePosition | null {
  const cache = readCache();
  let best: { entry: CachedFrame; dist: number } | null = null;
  for (const entry of cache) {
    const dist = hammingDistance(hash, entry.hash);
    if (dist <= MATCH_THRESHOLD && (!best || dist < best.dist)) {
      best = { entry, dist };
    }
  }
  return best ? best.entry.pos : null;
}

/** Save a position against this frame's hash. Overwrites any existing
 *  near-duplicate so the cache stays current. */
export function savePosition(hash: string, pos: FramePosition): void {
  const cache = readCache();
  // Remove any existing near-duplicate so we don't accumulate stale variants.
  const filtered = cache.filter((entry) => hammingDistance(hash, entry.hash) > MATCH_THRESHOLD);
  filtered.push({ hash, pos, savedAt: Date.now() });
  writeCache(filtered);
}

/** Total cached frame count — useful for UI feedback. */
export function cacheSize(): number {
  return readCache().length;
}
