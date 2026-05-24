// Persistent cache for the Convert-tab state.
//
// Problem: pattern + rendered preview + source image are all big base64
// strings. localStorage (5MB/origin) quickly fills up, so saves started
// silently failing and refreshes reloaded the previous-but-one state.
//
// Fix: put the big images in IndexedDB (no practical size limit) and
// keep only the small stuff (pattern grid, settings, timestamp) in
// localStorage for instant hydration.

const DB_NAME = "craftplan_convert_v1";
const STORE = "blobs";
const IMG_KEYS = ["sourceImage", "cleanedImage", "renderedPreview"] as const;

// Extra IDB keys for the collections we don't want to re-generate on refresh.
// These are JSON-serialized (array / object) rather than raw base64 strings
// because they contain multiple blobs — but IDB stores them as single values
// so we round-trip through JSON.stringify.
//
// Cost motivation: `gptMockups` is 10 × gpt-image-2 calls (~$0.20–0.50),
// `renderedPreviewsByModel` is 1–3 gpt-image-* calls. User explicitly asked
// that "all whats cost us money we need to save it for the next time."
const GPT_MOCKUPS_KEY = "gptMockups";
const RENDERED_BY_MODEL_KEY = "renderedPreviewsByModel";

export type ConvertSnapshot = {
  sourceImage: string | null;
  cleanedImage: string | null;
  cleanedModel: string | null;
  pattern: unknown;
  renderedPreview: string | null;
  /** 10-scene GPT-image-2 mockup batch. Each entry is a data: URL. */
  gptMockups: string[] | null;
  /**
   * First 120 chars of the pattern data URL that produced gptMockups.
   * Used to detect cache/pattern mismatch: if the user converts a new
   * pattern (Lavender Sprigs) while old cached mockups (Duck) still
   * live in IDB, hydrating them blindly shows the wrong design in the
   * Etsy gallery. Comparing this key to the current renderedPreview's
   * prefix catches the mismatch and lets us drop the stale mockups so
   * the Export-tab auto-trigger re-fires on the new pattern.
   *
   * Why a prefix instead of a hash: data URLs are deterministic — the
   * same PNG always base64-encodes to the same string, so two
   * different patterns produce different prefixes with near-certainty
   * (the PNG header + IHDR chunk alone vary byte-for-byte per image).
   * 120 chars fits comfortably in localStorage alongside settings.
   */
  gptMockupsSourceKey: string | null;
  /** Per-model cache so toggling gpt-image-1 ↔ gpt-image-2 doesn't
   *  re-hit the API for a result already rendered this session. */
  renderedPreviewsByModel: Record<string, string> | null;
  gridSize: number;
  maxColors: number;
  useDither: boolean;
  useAiClean: boolean;
  enforceOutlines: boolean;
  patternName: string;
  savedAt: number;
  /**
   * Hint for the Python convert pipeline.  "stitch_art" means the
   * sourceImage came from the Design tab (HQ render or its clean-convert
   * sibling) and should activate stitch_art mode in pipeline.py
   * (singleton absorption + interior bg flood-fill etc.).  "photo" /
   * null means a manual upload, AI-Best-Picker pick, or any other
   * non-AI-design source — pipeline.py runs the canonical photo path.
   *
   * Why this is persisted: the dual-prompt URLs (generatedDesignUrl,
   * cleanConvertDataUrl) used to be the implicit signal but they live
   * only in component state.  After a refresh the IDB cache restores
   * `sourceImage` but those URLs come back null, so the source-mode
   * predicate in convertViaPython would silently fall back to "photo"
   * — yielding a different chart for the SAME image between first and
   * second Convert.  This hint preserves the original decision across
   * refreshes.
   *
   * Optional so callers that don't care (legacy save points, the
   * baseline backup copy) keep compiling.  loadConvertState returns
   * `Partial<ConvertSnapshot>` already, so consumers always need the
   * `=== "stitch_art" || === "photo"` guard regardless of optionality.
   */
  sourceModeHint?: "photo" | "stitch_art" | null;
};

const META_KEY = "cross_stitch_convert_meta_v2";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (value == null) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  const out = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

export async function saveConvertState(snap: ConvertSnapshot): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    // Images → IndexedDB
    await Promise.all(
      IMG_KEYS.map((k) => idbPut(k, (snap[k] as string | null) ?? null))
    );
    // Collections → IndexedDB as JSON. Stored as single string values so
    // they fit the same `string | null` contract as single images.
    //
    // gptMockups wraps the array with the source-preview key that
    // produced it (see ConvertSnapshot.gptMockupsSourceKey docs) so on
    // load we can detect "these mockups were generated for a DIFFERENT
    // pattern" and drop them instead of silently hydrating ducks into a
    // lavender listing. Backward-compat: arrays written by the
    // pre-key format still deserialize (see loadConvertState) —
    // they're just treated as "source unknown" and invalidated.
    await Promise.all([
      idbPut(
        GPT_MOCKUPS_KEY,
        snap.gptMockups && snap.gptMockups.length
          ? JSON.stringify({
              mockups: snap.gptMockups,
              sourceKey: snap.gptMockupsSourceKey ?? null,
            })
          : null
      ),
      idbPut(
        RENDERED_BY_MODEL_KEY,
        snap.renderedPreviewsByModel && Object.keys(snap.renderedPreviewsByModel).length
          ? JSON.stringify(snap.renderedPreviewsByModel)
          : null
      ),
    ]);
    // Small stuff → localStorage.  Strip the chart-PDF base64 field
    // before persisting — the PDF is ~80–200 KB of derived data we re-
    // produce on every Convert anyway, and keeping it in the meta blob
    // would push a 142×142 pattern + 24 DMC palette + the multi-page
    // PDF close to the 5 MB localStorage cap.  Re-convert produces a
    // fresh PDF in <3 s, so the round-trip cost is negligible.
    let patternForCache: unknown = snap.pattern;
    if (
      patternForCache && typeof patternForCache === "object" &&
      "patternPdfB64" in (patternForCache as Record<string, unknown>)
    ) {
      const { patternPdfB64: _p, ...rest } =
        patternForCache as Record<string, unknown>;
      void _p;
      patternForCache = rest;
    }
    const meta = {
      cleanedModel: snap.cleanedModel,
      pattern: patternForCache,
      gridSize: snap.gridSize,
      maxColors: snap.maxColors,
      useDither: snap.useDither,
      useAiClean: snap.useAiClean,
      enforceOutlines: snap.enforceOutlines,
      patternName: snap.patternName,
      savedAt: snap.savedAt,
      sourceModeHint: snap.sourceModeHint,
    };
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      // Pattern grid is ~200KB for a 150x150x21 grid; if even that fails,
      // drop the grid but keep settings so next refresh at least has config.
      const lite = { ...meta, pattern: null };
      localStorage.setItem(META_KEY, JSON.stringify(lite));
    }
    return true;
  } catch (err) {
    console.warn("[convert-cache] save failed:", err);
    return false;
  }
}

export async function loadConvertState(): Promise<Partial<ConvertSnapshot> | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(META_KEY);
    const meta = raw ? JSON.parse(raw) : {};
    const [sourceImage, cleanedImage, renderedPreview, gptMockupsRaw, byModelRaw] =
      await Promise.all([
        idbGet("sourceImage"),
        idbGet("cleanedImage"),
        idbGet("renderedPreview"),
        idbGet(GPT_MOCKUPS_KEY),
        idbGet(RENDERED_BY_MODEL_KEY),
      ]);

    let gptMockups: string[] | null = null;
    let gptMockupsSourceKey: string | null = null;
    if (gptMockupsRaw) {
      try {
        const parsed = JSON.parse(gptMockupsRaw);
        // Forward format: { mockups: string[], sourceKey: string | null }
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          Array.isArray(parsed.mockups) &&
          parsed.mockups.every((x: unknown) => typeof x === "string")
        ) {
          gptMockups = parsed.mockups;
          gptMockupsSourceKey =
            typeof parsed.sourceKey === "string" ? parsed.sourceKey : null;
        }
        // Legacy format: bare string[]. We accept it but leave sourceKey
        // null — the caller uses that signal to invalidate the cache
        // (pre-key entries can't be safely restored because we don't
        // know which pattern they belong to).
        else if (
          Array.isArray(parsed) &&
          parsed.every((x) => typeof x === "string")
        ) {
          gptMockups = parsed;
          gptMockupsSourceKey = null;
        }
      } catch { /* corrupt cache — treat as miss */ }
    }

    let renderedPreviewsByModel: Record<string, string> | null = null;
    if (byModelRaw) {
      try {
        const parsed = JSON.parse(byModelRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          renderedPreviewsByModel = parsed as Record<string, string>;
        }
      } catch { /* corrupt cache — treat as miss */ }
    }

    return {
      ...meta,
      sourceImage,
      cleanedImage,
      renderedPreview,
      gptMockups,
      gptMockupsSourceKey,
      renderedPreviewsByModel,
    };
  } catch (err) {
    console.warn("[convert-cache] load failed:", err);
    return null;
  }
}

export async function clearConvertState(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_KEY);
    await Promise.all([
      ...IMG_KEYS.map((k) => idbPut(k, null)),
      idbPut(GPT_MOCKUPS_KEY, null),
      idbPut(RENDERED_BY_MODEL_KEY, null),
    ]);
  } catch {}
}
