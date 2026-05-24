// ══════════════════════════════════════════════════════════════
// Printful Pro Mockup Service
// Batch uploads designs and generates photorealistic mockups
// via Printful's async mockup generator API.
// ══════════════════════════════════════════════════════════════

import { PRODUCT_TO_PRINTFUL_ID, type MockupProduct } from "./mockup-renderer";

// Default variant IDs (one representative variant per product for mockup rendering)
const DEFAULT_VARIANT_IDS: Record<MockupProduct, number[]> = {
  "T-Shirt": [4012],   // White / M
  "Hoodie": [14575],   // Black / M
  "Mug": [1320],       // 11oz White
  "Tote Bag": [3606],  // Natural
  "Poster": [150],     // 18×24
};

export interface MockupTaskState {
  designId: number;
  product: MockupProduct;
  status: "pending" | "uploading" | "creating" | "polling" | "done" | "error";
  taskKey?: string;
  mockupUrl?: string;
  error?: string;
}

export interface BatchMockupProgress {
  total: number;
  completed: number;
  tasks: MockupTaskState[];
}

export type ProgressCallback = (progress: BatchMockupProgress) => void;

// ── Internals ──

async function uploadDesignToPrintful(base64DataUrl: string, fileName: string): Promise<string> {
  const resp = await fetch("/api/printful/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64DataUrl, fileName }),
  });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
  const data = await resp.json();
  return data.url;
}

async function createMockupForProduct(fileUrl: string, product: MockupProduct): Promise<string> {
  const productId = PRODUCT_TO_PRINTFUL_ID[product];
  const variantIds = DEFAULT_VARIANT_IDS[product];
  const resp = await fetch("/api/printful/mockups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, variantIds, fileUrl, placement: "front" }),
  });
  if (!resp.ok) throw new Error(`Mockup task failed: ${resp.status}`);
  const data = await resp.json();
  return data.taskKey;
}

async function pollMockupTask(taskKey: string, maxAttempts = 30, intervalMs = 2000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const resp = await fetch(`/api/printful/mockups?taskKey=${taskKey}`);
    if (!resp.ok) throw new Error(`Poll failed: ${resp.status}`);
    const data = await resp.json();
    if (data.status === "completed" && data.mockups?.[0]?.mockupUrl) {
      return data.mockups[0].mockupUrl;
    }
    if (data.status === "error") {
      throw new Error(data.error || "Mockup generation failed");
    }
  }
  throw new Error("Mockup generation timed out");
}

// ── Public API ──

export async function generatePrintfulMockups(
  designs: Array<{ id: number; dataUrl: string; text: string }>,
  products: MockupProduct[],
  onProgress: ProgressCallback
): Promise<Map<number, Record<string, string>>> {
  const results = new Map<number, Record<string, string>>();
  const totalTasks = designs.length * products.length;
  let completedCount = 0;
  const tasks: MockupTaskState[] = [];

  // Initialize task states
  for (const design of designs) {
    for (const product of products) {
      tasks.push({ designId: design.id, product, status: "pending" });
    }
  }

  const reportProgress = () => {
    onProgress({ total: totalTasks, completed: completedCount, tasks: [...tasks] });
  };
  reportProgress();

  // Concurrency control
  const CONCURRENCY = 3;
  const fileUrlCache = new Map<number, string>();

  const processDesignProduct = async (design: typeof designs[0], product: MockupProduct) => {
    const task = tasks.find(t => t.designId === design.id && t.product === product)!;

    try {
      // Upload once per design
      if (!fileUrlCache.has(design.id)) {
        task.status = "uploading";
        reportProgress();
        const fileName = `sensei-${design.text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.png`;
        const fileUrl = await uploadDesignToPrintful(design.dataUrl, fileName);
        fileUrlCache.set(design.id, fileUrl);
      }
      const fileUrl = fileUrlCache.get(design.id)!;

      // Create mockup task
      task.status = "creating";
      reportProgress();
      const taskKey = await createMockupForProduct(fileUrl, product);
      task.taskKey = taskKey;

      // Poll for result
      task.status = "polling";
      reportProgress();
      const mockupUrl = await pollMockupTask(taskKey);
      task.mockupUrl = mockupUrl;
      task.status = "done";

      if (!results.has(design.id)) results.set(design.id, {});
      results.get(design.id)![product] = mockupUrl;
    } catch (err) {
      task.status = "error";
      task.error = (err as Error).message;
    }

    completedCount++;
    reportProgress();
  };

  // Run with concurrency limit
  const queue = designs.flatMap(d => products.map(p => () => processDesignProduct(d, p)));
  const executing = new Set<Promise<void>>();

  for (const task of queue) {
    const p = task().then(() => { executing.delete(p); });
    executing.add(p);
    if (executing.size >= CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  return results;
}
