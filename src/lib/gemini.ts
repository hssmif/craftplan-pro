// Shared Gemini API helper for all Design Sensei routes

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

export interface GeminiOptions {
  /** Override Gemini's max output tokens.  Default 8192 — bump to 16384 for
   *  cross-stitch listing copy which routinely exceeds 8 K tokens (long
   *  description + FAQs + 13 tags + attributes).  Truncation produces a
   *  syntactically-valid-looking JSON without the tags array, which loops
   *  the retry logic indefinitely. */
  maxOutputTokens?: number;
  /** Temperature override.  Default 0.6. */
  temperature?: number;
}

async function tryGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
  opts: GeminiOptions = {},
): Promise<{ text?: string; retryAfterSec?: number; error?: string }> {
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        temperature: opts.temperature ?? 0.6,
        responseMimeType: "application/json",
      },
    }),
  });
  if (resp.status === 429 || resp.status === 503) {
    const body = await resp.text().catch(() => "");
    const match = body.match(/retry in ([\d.]+)s/i);
    const retryAfterSec = match ? Math.ceil(parseFloat(match[1])) + 3 : 30;
    return { retryAfterSec };
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    return { error: `${resp.status}: ${errText.slice(0, 200)}` };
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { text } : { error: "No text in response" };
}

export async function callGeminiJSON(
  apiKey: string,
  prompt: string,
  opts: GeminiOptions = {},
): Promise<string> {
  // Try primary model first
  const primary = MODEL_CHAIN[0];
  const r1 = await tryGeminiModel(apiKey, primary, prompt, opts);
  if (r1.text) return r1.text;

  // If rate limited, wait the server-specified time and retry ONCE with primary model
  if (r1.retryAfterSec) {
    console.log(`[Gemini] ${primary} rate-limited, waiting ${r1.retryAfterSec}s before retry...`);
    await new Promise((r) => setTimeout(r, (r1.retryAfterSec ?? 30) * 1000));
    const r2 = await tryGeminiModel(apiKey, primary, prompt, opts);
    if (r2.text) return r2.text;
    // If still rate limited, wait again
    if (r2.retryAfterSec) {
      console.log(`[Gemini] ${primary} still rate-limited, waiting ${r2.retryAfterSec}s...`);
      await new Promise((r) => setTimeout(r, (r2.retryAfterSec ?? 30) * 1000));
      const r3 = await tryGeminiModel(apiKey, primary, prompt, opts);
      if (r3.text) return r3.text;
    }
  }

  // Try fallback models (no retries — just one shot each)
  for (let i = 1; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    console.log(`[Gemini] Trying fallback model ${model}...`);
    const result = await tryGeminiModel(apiKey, model, prompt, opts);
    if (result.text) return result.text;
    if (result.error) console.log(`[Gemini] ${model}: ${result.error}`);
  }

  throw new Error("All Gemini models failed after retries");
}

export async function callGeminiVision(
  apiKey: string,
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  opts: GeminiOptions = {},
): Promise<string> {
  const parts = [
    { text: prompt },
    ...images.map((image) => ({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64.replace(/^data:[^,]+,/, ""),
      },
    })),
  ];

  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: opts.maxOutputTokens ?? 8192,
            temperature: opts.temperature ?? 0.4,
            responseMimeType: "application/json",
          },
        }),
      });
      if (resp.status === 429 || resp.status === 503) continue;
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }

  throw new Error("All Gemini vision models failed");
}

export function repairJSON(text: string): string {
  let s = text.trim();
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  const opens = { "{": 0, "[": 0 };
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") opens["{"]++;
    else if (ch === "}") opens["{"]--;
    else if (ch === "[") opens["["]++;
    else if (ch === "]") opens["["]--;
  }
  s = s.replace(/,\s*$/, "");
  for (let i = 0; i < opens["["]; i++) s += "]";
  for (let i = 0; i < opens["{"]; i++) s += "}";
  return s;
}

export function parseGeminiJSON<T>(text: string): T {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(repairJSON(text));
  }
}
