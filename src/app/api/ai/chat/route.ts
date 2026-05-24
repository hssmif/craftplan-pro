import { NextRequest } from "next/server";

// Gemini API endpoint for text generation with streaming
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Models to try in order (fallback chain)
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

async function callGemini(
  apiKey: string,
  prompt: string,
  model: string,
  streaming: boolean
): Promise<Response> {
  const endpoint = streaming ? "streamGenerateContent" : "generateContent";
  const separator = streaming ? "?alt=sse&" : "?";
  const url = `${GEMINI_API_URL}/${model}:${endpoint}${separator}key=${apiKey}`;

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured. Add it to .env.local" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { prompt, stream = true } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Try each model in the chain until one works
    let geminiResp: Response | null = null;
    let usedModel = "";

    for (const model of MODEL_CHAIN) {
      console.log(`Trying model: ${model}...`);
      const resp = await callGemini(apiKey, prompt, model, stream);

      if (resp.ok) {
        geminiResp = resp;
        usedModel = model;
        console.log(`Success with model: ${model}`);
        break;
      }

      // If rate limited, try waiting then retry once
      if (resp.status === 429) {
        const errBody = await resp.text();
        console.log(`Rate limited on ${model}, trying next...`);

        // Check if error says to retry with specific delay
        const retryMatch = errBody.match(/retry in (\d+)/i);
        const waitTime = retryMatch ? Math.min(parseInt(retryMatch[1]), 30) : 0;

        if (waitTime > 0 && waitTime <= 10) {
          console.log(`Waiting ${waitTime}s and retrying ${model}...`);
          await new Promise((r) => setTimeout(r, waitTime * 1000));
          const retry = await callGemini(apiKey, prompt, model, stream);
          if (retry.ok) {
            geminiResp = retry;
            usedModel = model;
            break;
          }
        }
        // Try next model in chain
        continue;
      }

      // Other errors — try next model
      const errText = await resp.text();
      console.error(`Error with ${model}:`, errText.substring(0, 200));
      continue;
    }

    if (!geminiResp) {
      return new Response(
        JSON.stringify({
          error: "All Gemini models are rate limited. Please wait 1 minute and try again. The free tier has limits per minute.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    if (stream) {
      // Transform SSE stream to our format
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          // Send which model is being used
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: "", model: usedModel })}\n\n`)
          );

          const reader = geminiResp!.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process SSE events
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") continue;

                  try {
                    const parsed = JSON.parse(data);
                    const text =
                      parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    if (text) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
                      );
                    }
                  } catch {
                    // Skip malformed JSON chunks
                  }
                }
              }
            }
          } catch (err) {
            console.error("Stream error:", err);
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // Non-streaming response
      const data = await geminiResp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({ text, model: usedModel }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("AI chat error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
