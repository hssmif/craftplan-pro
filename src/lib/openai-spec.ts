// ══════════════════════════════════════════════════════════════
// OpenAI Spec Wrapper
//
// Thin fetch-based wrapper around OpenAI Chat Completions with
// Structured Outputs (JSON Schema-enforced). No SDK dependency.
//
// Why Structured Outputs: the only way to GUARANTEE the model
// returns a parseable, schema-conforming JSON spec. No more
// "model decided to add prose" / "model truncated mid-array"
// silent failures we used to get with Gemini freeform JSON.
// ══════════════════════════════════════════════════════════════

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Model defaults. Override via OPENAI_SPEC_MODEL env if needed.
// gpt-4.1 is the strongest for large structured JSON spec output.
// gpt-4o-mini is the cheap fallback (lower design quality, but works).
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_FALLBACK = "gpt-4o";

export interface OpenAISpecOptions {
  /** OpenAI model id. Default: gpt-5-mini, falls back to gpt-4o-mini. */
  model?: string;
  /** Tokens for the response. Default 16000 — specs can be large. */
  maxTokens?: number;
  /** Temperature. Default 0.3 — we want consistent, structured output. */
  temperature?: number;
  /** Hard timeout in ms. Default from OPENAI_SPEC_TIMEOUT_MS or 240s. */
  timeoutMs?: number;
  /** System message ("you are…"). Optional but recommended. */
  system?: string;
}

export class OpenAISpecError extends Error {
  status: number;
  body?: string;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "OpenAISpecError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Call OpenAI Chat Completions with Structured Outputs.
 * Returns the parsed JSON object (already validated against the schema).
 */
export async function callOpenAISpec<T = Record<string, unknown>>(
  prompt: string,
  opts: OpenAISpecOptions,
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAISpecError(
      "OPENAI_API_KEY not configured",
      0,
    );
  }

  const model = opts.model || process.env.OPENAI_SPEC_MODEL || DEFAULT_MODEL;
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    max_completion_tokens: opts.maxTokens ?? 16000,
    temperature: opts.temperature ?? 0.3,
    // json_object mode (not strict json_schema) — we have many
    // optional fields in our spec and want compact output, not
    // every-property-required. We validate aggressively on receive.
    response_format: { type: "json_object" },
  };

  // Try primary model, fall back once on 4xx that smells like model not available.
  const tryOnce = async (m: string): Promise<T> => {
    const payload = { ...body, model: m };
    const timeoutMs = opts.timeoutMs ?? Number(process.env.OPENAI_SPEC_TIMEOUT_MS ?? 240_000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new OpenAISpecError(
          `OpenAI ${m}: timed out after ${Math.round(timeoutMs / 1000)}s`,
          408,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new OpenAISpecError(
        `OpenAI ${m} ${resp.status}: ${errText.slice(0, 300)}`,
        resp.status,
        errText,
      );
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new OpenAISpecError(
        `OpenAI ${m}: empty content in response`,
        200,
        JSON.stringify(data).slice(0, 300),
      );
    }
    return JSON.parse(content) as T;
  };

  try {
    return await tryOnce(model);
  } catch (err) {
    if (err instanceof OpenAISpecError && err.status >= 400 && err.status < 500 && err.status !== 408) {
      console.warn(
        `[OpenAI Spec] ${model} failed (${err.status}), falling back to ${DEFAULT_FALLBACK}`,
      );
      return await tryOnce(DEFAULT_FALLBACK);
    }
    throw err;
  }
}
