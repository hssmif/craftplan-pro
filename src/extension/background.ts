// ══════════════════════════════════════════════════════════════════════
// CraftPlan Research — Background Service Worker
//
// Two responsibilities today:
//
//   1. RELAY messages between content scripts (Marketplace Insights
//      scanner) and storage / the Next.js app. Most current capture
//      work bypasses this — the content script POSTs directly to
//      localhost:3461 because it has localhost host_permission.
//
//   2. HANDLE the SEND_TO_DIGITAL_STUDIO action when a downstream
//      surface (popup or external page) wants to hand a listing off
//      to /digital-studio for further work. Fetches the reference
//      image, resizes it, base64-encodes, and injects via the studio's
//      localStorage import path.
//
// The old POD scanner / Printful / Etsy form-filler handlers were
// removed when that pipeline was retired (see extension cleanup).
// ══════════════════════════════════════════════════════════════════════

// ── Helper: fetch image, resize to max 512px, return base64 JPEG ──
//
// Used only by SEND_TO_DIGITAL_STUDIO. Service workers can't use the
// regular Image() API — we use createImageBitmap + OffscreenCanvas
// which are available in workers.
async function fetchAndEncodeImage(imageUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const maxSize = 512;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxSize || h > maxSize) {
      const scale = maxSize / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const arrayBuffer = await outBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn("[CraftPlan BG] Image fetch/encode failed:", err);
    return null;
  }
}

// ── Internal messages (from content scripts & popup) ─────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Popup / external surface wants to send a listing to Digital Studio.
  //
  // Payload shape matches ExtensionToDigitalStudioPayload in types.ts —
  // we add a `referenceImageBase64` field at runtime after fetching the
  // image, then inject everything into the studio via its existing
  // localStorage import path (key: "craftplan_digital_studio_payload").
  if (msg.type === "SEND_TO_DIGITAL_STUDIO") {
    const payload = msg.payload;

    const imagePromise = payload.imageUrl
      ? fetchAndEncodeImage(payload.imageUrl)
      : Promise.resolve(null);

    chrome.storage.local.get("craftplanUrl", (data) => {
      const baseUrl = data.craftplanUrl || "http://localhost:3461";
      const targetUrl = `${baseUrl}/digital-studio?source=extension`;

      chrome.tabs.create({ url: targetUrl }, (tab) => {
        if (!tab?.id) {
          sendResponse({ ok: false, error: "Failed to create tab" });
          return;
        }
        const tabId = tab.id;

        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
          if (updatedTabId === tabId && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            imagePromise.then((base64) => {
              if (base64) payload.referenceImageBase64 = base64;
              const payloadJson = JSON.stringify(payload);
              chrome.scripting.executeScript(
                {
                  target: { tabId },
                  func: (json: string) => {
                    localStorage.setItem("craftplan_digital_studio_payload", json);
                    window.dispatchEvent(new Event("craftplan-digital-studio-ready"));
                  },
                  args: [payloadJson],
                },
                () => {
                  console.log("[CraftPlan BG] Payload injected into Digital Studio");
                },
              );
            });
          }
        });

        sendResponse({ ok: true, tabId });
      });
    });
    return true; // async
  }
});

// ── External messages (from Next.js app at localhost:3461) ────────────

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Health check / version probe — lets /research detect whether the
  // extension is installed.
  if (msg.type === "PING") {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version,
      name: "CraftPlan Research",
    });
    return;
  }

  // Reload the entire extension (picks up new content scripts from disk)
  if (msg.type === "RELOAD_EXTENSION") {
    console.log("[CraftPlan BG] Reloading extension...");
    sendResponse({ ok: true, reloading: true });
    setTimeout(() => chrome.runtime.reload(), 500);
    return true;
  }
});

// ── Extension installed/updated ──────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ craftplanUrl: "http://localhost:3461" });
    console.log("[CraftPlan] Extension installed. Default URL: http://localhost:3461");
  }
});
