"use client";

import { useState, useRef } from "react";

declare global {
  interface Window {
    puter: {
      ai: {
        txt2img: (prompt: string, options?: { model?: string }) => Promise<HTMLImageElement>;
      };
    };
  }
}

const STYLE_PRESETS = [
  { label: "Minimalist", prompt: "minimalist clean lines simple shapes" },
  { label: "Watercolor", prompt: "soft watercolor painting artistic brushstrokes" },
  { label: "Abstract", prompt: "abstract modern geometric shapes bold colors" },
  { label: "Botanical", prompt: "botanical illustration detailed plants leaves flowers" },
  { label: "Line Art", prompt: "elegant line art drawing black and white" },
  { label: "Nordic", prompt: "scandinavian nordic design simple muted colors" },
  { label: "Boho", prompt: "bohemian earthy tones natural elements" },
  { label: "Vintage", prompt: "vintage retro nostalgic aged texture" },
];

const PRINT_SIZES = ["8x10", "11x14", "12x16", "16x20", "18x24"];

const AI_MODELS = [
  { value: "pollinations", label: "Pollinations Flux (Recommended)" },
  { value: "default", label: "Puter Auto" },
  { value: "togetherai:black-forest-labs/flux.1-schnell", label: "Puter Flux Schnell" },
  { value: "togetherai:black-forest-labs/flux.1-dev", label: "Puter Flux 1 Dev" },
  { value: "openai:openai/dall-e-3", label: "Puter DALL-E 3" },
  { value: "togetherai:stabilityai/stable-diffusion-xl-base-1.0", label: "Puter SDXL" },
  { value: "togetherai:black-forest-labs/flux.2-dev", label: "Puter Flux 2 Dev" },
];

export default function WallArtPage() {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [model, setModel] = useState("default");
  const [size, setSize] = useState("12x16");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savedProductId, setSavedProductId] = useState<number | null>(null);
  const [listing, setListing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fullPrompt = selectedStyle
    ? `${prompt}, ${STYLE_PRESETS.find((s) => s.label === selectedStyle)?.prompt || ""}, wall art print, high quality`
    : `${prompt}, wall art print, high quality`;

  async function generateImage() {
    if (!prompt.trim()) return;

    setGenerating(true);
    setStatus("Initializing AI...");
    setPreviewUrl(null);
    setSavedProductId(null);

    try {
      const modelLabel = AI_MODELS.find((m) => m.value === model)?.label || model;
      setStatus(`Generating with ${modelLabel}...`);

      let blob: Blob;

      if (model === "pollinations") {
        // ── Pollinations: server-side via /api/ai/image ──
        const resp = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: fullPrompt,
            provider: "pollinations",
            width: 1024,
            height: 1024,
            model: "flux",
            seed: Math.floor(Math.random() * 2147483647),
            enhance: true,
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (!data.image) throw new Error("No image in response");

        const mimeType = data.mimeType || "image/jpeg";
        const binary = atob(data.image);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mimeType });

        // Load into canvas for preview & upscale
        const dataUrl = `data:${mimeType};base64,${data.image}`;
        const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
          const newImg = new Image();
          newImg.onload = () => resolve(newImg);
          newImg.onerror = () => reject(new Error("Failed to load image"));
          newImg.src = dataUrl;
        });

        const canvas = canvasRef.current!;
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(imageElement, 0, 0);
      } else {
        // ── Puter.js: client-side AI generation ──
        if (!window.puter?.ai) {
          setStatus("Loading Puter.js AI...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (!window.puter?.ai) {
            throw new Error("Puter.js not loaded. Please refresh the page.");
          }
        }

        const img = model === "default"
          ? await window.puter.ai.txt2img(fullPrompt)
          : await window.puter.ai.txt2img(fullPrompt, { model });

        let imageElement: HTMLImageElement;
        if (img instanceof HTMLImageElement) {
          imageElement = img;
        } else {
          const src = (img as unknown as { src?: string }).src || String(img);
          imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
            const newImg = new Image();
            newImg.onload = () => resolve(newImg);
            newImg.onerror = () => reject(new Error("Failed to load generated image"));
            newImg.src = src;
          });
        }

        if (!imageElement.complete) {
          await new Promise<void>((resolve) => {
            imageElement.onload = () => resolve();
          });
        }

        const canvas = canvasRef.current!;
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(imageElement, 0, 0);

        blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png")
        );
      }

      // Show preview
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);

      // Upscale to print quality
      setStatus("Upscaling to 300 DPI...");
      const formData = new FormData();
      formData.append("image", blob, "wallart.png");
      formData.append("size", size);

      const upscaleResp = await fetch("/api/generate/upscale", {
        method: "POST",
        body: formData,
      });

      if (!upscaleResp.ok) {
        const error = await upscaleResp.json();
        throw new Error(error.error || "Upscale failed");
      }

      const upscaleData = await upscaleResp.json();

      // Save to catalog
      setStatus("Saving to catalog...");
      const productResp = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "wall_art",
          title: prompt.substring(0, 100),
          prompt: fullPrompt,
          file_paths: [upscaleData.outputPath],
          preview_path: upscaleData.previewPath,
          price: 2.99,
        }),
      });

      if (productResp.ok) {
        const product = await productResp.json();
        setSavedProductId(product.id);
      }

      setStatus("Done! Image generated and saved.");
    } catch (err: unknown) {
      let errorMsg = "Generation failed";
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        if (e.error && typeof e.error === "object") {
          const inner = e.error as Record<string, unknown>;
          errorMsg = (inner.message || inner.key || JSON.stringify(inner)) as string;
        } else if (e.message) {
          errorMsg = String(e.message);
        } else {
          errorMsg = JSON.stringify(err);
        }
      }
      setStatus(`Error: ${errorMsg}`);
    } finally {
      setGenerating(false);
    }
  }

  async function listOnEtsy() {
    if (!savedProductId) return;

    setListing(true);
    setStatus("Creating Etsy listing...");

    try {
      const resp = await fetch("/api/etsy/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: savedProductId }),
      });

      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || "Listing failed");

      setStatus(`Listed on Etsy! Listing ID: ${data.listing_id}`);
    } catch (err) {
      setStatus(`Listing error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setListing(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Wall Art Generator</h2>
        <p className="text-slate-500 mt-1">Generate AI wall art and list on Etsy</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Describe your wall art
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A serene mountain landscape with morning mist, soft pastel colors..."
              className="w-full h-32 px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Style presets */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Style</label>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map((style) => (
                <button
                  key={style.label}
                  onClick={() => setSelectedStyle(selectedStyle === style.label ? "" : style.label)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedStyle === style.label
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model + Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">AI Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {AI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Print Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {PRINT_SIZES.map((s) => (
                  <option key={s} value={s}>{s} inches</option>
                ))}
              </select>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateImage}
            disabled={generating || !prompt.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? "Generating..." : "Generate Wall Art"}
          </button>

          {/* Status */}
          {status && (
            <div className={`p-3 rounded-lg text-sm ${
              status.startsWith("Error") || status.startsWith("Listing error")
                ? "bg-red-50 text-red-700"
                : status.startsWith("Done") || status.startsWith("Listed")
                ? "bg-green-50 text-green-700"
                : "bg-blue-50 text-blue-700"
            }`}>
              {status}
            </div>
          )}

          {/* List on Etsy button */}
          {savedProductId && (
            <button
              onClick={listOnEtsy}
              disabled={listing}
              className="w-full py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {listing ? "Listing..." : "List on Etsy"}
            </button>
          )}
        </div>

        {/* Right: Preview */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Preview</label>
          <div className="bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 aspect-[3/4] flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Generated wall art"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="text-center text-slate-400 p-8">
                <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Your generated art will appear here</p>
              </div>
            )}
          </div>
          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}
