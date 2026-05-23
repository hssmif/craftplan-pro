// Shared OpenAI helper for JSON-structured LLM calls.
//
// Priority model: gpt-5-mini — small, cheap, fast, produces noticeably better
// Etsy-style marketing copy than Gemini flash. Falls back to gpt-4o-mini if
// gpt-5-mini isn't enabled on the account. Caller can fall further back to
// Gemini via `callBestJSON` below.

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

// Ordered by preference. Each is attempted once.
const OPENAI_MODEL_CHAIN = ["gpt-5-mini", "gpt-4o-mini"];

interface TryResult { text?: string; error?: string; status?: number }

async function tryOpenAIModel(
  apiKey: string,
  model: string,
  prompt: string,
  systemHint?: string
): Promise<TryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    // gpt-5 family uses the newer responses API conventions but still accepts
    // chat.completions with a response_format hint for JSON. Keep it
    // compatible with both gpt-5-mini and gpt-4o-mini.
    const body: Record<string, unknown> = {
      model,
      messages: [
        systemHint
          ? { role: "system", content: systemHint }
          : { role: "system", content: "Return only valid JSON. No commentary, no markdown." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    };
    // gpt-5-mini doesn't support custom temperature; gpt-4o-mini benefits from lower temp.
    if (!model.startsWith("gpt-5")) body.temperature = 0.5;

    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { status: resp.status, error: `${resp.status}: ${errText.slice(0, 200)}` };
    }
    const data = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content?.trim() || "";
    return text ? { text } : { error: "Empty response" };
  } catch (err) {
    clearTimeout(timeout);
    return { error: (err as Error).message };
  }
}

export async function callOpenAIJSON(apiKey: string, prompt: string, systemHint?: string): Promise<string> {
  for (const model of OPENAI_MODEL_CHAIN) {
    const r = await tryOpenAIModel(apiKey, model, prompt, systemHint);
    if (r.text) {
      console.log(`[OpenAI] JSON success via ${model}`);
      return r.text;
    }
    console.log(`[OpenAI] ${model} failed: ${r.error}`);
    // If the error is a hard auth/quota error, don't keep hammering — bail.
    if (r.status === 401 || r.status === 403) break;
  }
  throw new Error("All OpenAI models failed");
}

// Unified best-effort JSON caller: gpt-5-mini → Gemini fallback.
// Pass both keys; missing ones are skipped.
// Per user 2026-05-16 cost-saving directive: gpt-4o-mini disabled
// globally.  callBestJSON forces every caller to use Gemini regardless
// of whether an openaiKey is passed.  This catches the wall-art
// pipeline and any other downstream that imports this helper.
const GPT_4O_MINI_DISABLED = true;

export async function callBestJSON(opts: {
  openaiKey?: string;
  geminiKey?: string;
  prompt: string;
  systemHint?: string;
}): Promise<string> {
  if (!GPT_4O_MINI_DISABLED && opts.openaiKey) {
    try {
      return await callOpenAIJSON(opts.openaiKey, opts.prompt, opts.systemHint);
    } catch (err) {
      console.warn("[callBestJSON] OpenAI failed, falling back to Gemini:", (err as Error).message);
    }
  }
  if (opts.geminiKey) {
    // Lazy import to avoid pulling Gemini code when caller never uses it.
    const { callGeminiJSON } = await import("./gemini");
    return callGeminiJSON(opts.geminiKey, opts.prompt);
  }
  throw new Error("No LLM API key configured (OPENAI_API_KEY or GEMINI_API_KEY)");
}
