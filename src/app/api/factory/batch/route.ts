// ══════════════════════════════════════════════════════════════
// Factory Batch Run API
//
// POST /api/factory/batch
//   Runs the factory pipeline for multiple niches sequentially.
//   Each product is generated and stops at ready_to_list.
//   Publishing is MANUAL ONLY — use /api/factory/publish.
//
// GET /api/factory/batch?id=...
//   Returns batch run status with per-product progress.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { executeFactoryRun } from "@/lib/factory-orchestrator";

// ── Niche definitions (keyword + opportunity hint) ──────────

interface NicheDef {
  id: string;
  keywords: string[];
  opportunityData: {
    title: string;
    tags: string[];
    price: number;
    niche: string;
  };
}

const NICHES: NicheDef[] = [
  {
    id: "paycheck-budget",
    keywords: ["paycheck budget google sheets", "bi-weekly budget spreadsheet"],
    opportunityData: {
      title: "Paycheck Budget Planner Google Sheets",
      tags: ["paycheck budget", "budget by paycheck", "bi-weekly budget", "budget planner", "google sheets budget"],
      price: 5.99,
      niche: "paycheck-budget",
    },
  },
  {
    id: "debt-payoff",
    keywords: ["debt payoff tracker google sheets", "debt snowball spreadsheet"],
    opportunityData: {
      title: "Debt Payoff Tracker Google Sheets Debt Snowball",
      tags: ["debt tracker", "debt payoff", "debt snowball", "debt avalanche", "google sheets debt"],
      price: 5.99,
      niche: "debt-payoff",
    },
  },
  {
    id: "wedding-planner",
    keywords: ["wedding budget planner google sheets", "wedding tracker spreadsheet"],
    opportunityData: {
      title: "Wedding Budget Planner Google Sheets Template",
      tags: ["wedding planner", "wedding budget", "wedding tracker", "bridal planner", "google sheets wedding"],
      price: 7.99,
      niche: "wedding-planner",
    },
  },
  {
    id: "baby-tracker",
    keywords: ["baby budget tracker google sheets", "new baby expense tracker"],
    opportunityData: {
      title: "Baby Budget Tracker Google Sheets Template",
      tags: ["baby budget", "baby tracker", "new baby costs", "baby expenses", "google sheets baby"],
      price: 5.99,
      niche: "baby-budget",
    },
  },
  {
    id: "business-tracker",
    keywords: ["small business expense tracker google sheets", "business P&L spreadsheet"],
    opportunityData: {
      title: "Small Business Expense Tracker Profit Loss Google Sheets",
      tags: ["business tracker", "expense tracker", "profit loss", "P&L template", "google sheets business"],
      price: 7.99,
      niche: "business-pl",
    },
  },
  {
    id: "student-budget",
    keywords: ["student budget planner google sheets", "college budget spreadsheet"],
    opportunityData: {
      title: "Student Budget Planner Google Sheets Template",
      tags: ["student budget", "college budget", "student planner", "budget template", "google sheets student"],
      price: 4.99,
      niche: "student-budget",
    },
  },
  {
    id: "meal-planner",
    keywords: ["meal planner google sheets", "weekly meal plan spreadsheet grocery"],
    opportunityData: {
      title: "Meal Planner Google Sheets Weekly Meal Plan Grocery List",
      tags: ["meal planner", "meal prep", "grocery list", "weekly meal plan", "google sheets meal"],
      price: 5.99,
      niche: "meal-planner",
    },
  },
  {
    id: "savings-tracker",
    keywords: ["savings tracker google sheets", "savings goal spreadsheet"],
    opportunityData: {
      title: "Savings Tracker Google Sheets Savings Goal Template",
      tags: ["savings tracker", "savings goals", "money tracker", "savings plan", "google sheets savings"],
      price: 5.99,
      niche: "savings-tracker",
    },
  },
  {
    id: "travel-planner",
    keywords: ["travel budget planner google sheets", "trip planner spreadsheet"],
    opportunityData: {
      title: "Travel Budget Planner Google Sheets Trip Planner",
      tags: ["travel planner", "trip budget", "travel tracker", "vacation planner", "google sheets travel"],
      price: 5.99,
      niche: "travel-planner",
    },
  },
  {
    id: "side-hustle",
    keywords: ["side hustle tracker google sheets", "freelance income expense tracker"],
    opportunityData: {
      title: "Side Hustle Profit Tracker Google Sheets Freelance Income",
      tags: ["side hustle", "freelance tracker", "income tracker", "profit tracker", "google sheets hustle"],
      price: 5.99,
      niche: "side-hustle",
    },
  },
];

// ── In-memory batch state ───────────────────────────────────

interface BatchProduct {
  nicheId: string;
  status: "pending" | "running" | "ready" | "failed";
  factoryRunId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface BatchState {
  batchId: string;
  status: "running" | "completed" | "failed";
  products: BatchProduct[];
  startedAt: string;
  completedAt?: string;
  totalReady: number;
  totalFailed: number;
}

const activeBatches = new Map<string, BatchState>();

// ── POST: Start batch ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nicheIds: string[] = body.niches || NICHES.map((n) => n.id);
    const selectedNiches = NICHES.filter((n) => nicheIds.includes(n.id));

    if (selectedNiches.length === 0) {
      return NextResponse.json({ error: "No valid niches specified" }, { status: 400 });
    }

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const batchState: BatchState = {
      batchId,
      status: "running",
      products: selectedNiches.map((n) => ({
        nicheId: n.id,
        status: "pending" as const,
      })),
      startedAt: new Date().toISOString(),
      totalReady: 0,
      totalFailed: 0,
    };
    activeBatches.set(batchId, batchState);

    // Run the batch in background — sequential to avoid overloading
    runBatch(batchState, selectedNiches, baseUrl).catch((err) => {
      console.error(`[Batch] Fatal error:`, err);
      batchState.status = "failed";
      batchState.completedAt = new Date().toISOString();
    });

    return NextResponse.json({
      success: true,
      batchId,
      totalProducts: selectedNiches.length,
      niches: selectedNiches.map((n) => n.id),
      message: `Batch started. ${selectedNiches.length} products will be generated sequentially (ready_to_list only — publishing is manual). Poll GET /api/factory/batch?id=${batchId} for progress.`,
    });
  } catch (err) {
    console.error("[Batch POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Batch start failed" },
      { status: 500 },
    );
  }
}

// ── GET: Check batch status ─────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("id");

  if (!batchId) {
    // List all batches
    const all = Array.from(activeBatches.values()).map((b) => ({
      batchId: b.batchId,
      status: b.status,
      totalProducts: b.products.length,
      totalReady: b.totalReady,
      totalFailed: b.totalFailed,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
    }));
    return NextResponse.json({ batches: all });
  }

  const batch = activeBatches.get(batchId);
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}

// ── Batch execution engine ──────────────────────────────────

async function runBatch(
  batch: BatchState,
  niches: NicheDef[],
  baseUrl: string,
): Promise<void> {
  console.log(`[Batch] Starting ${niches.length} products (generate only — no auto-publish)...`);

  for (let i = 0; i < niches.length; i++) {
    const niche = niches[i];
    const product = batch.products[i];
    product.status = "running";
    product.startedAt = new Date().toISOString();

    console.log(`[Batch] [${i + 1}/${niches.length}] ${niche.id}...`);

    try {
      // Run the factory pipeline (generate product + images + copy)
      // Stops at ready_to_list — NO auto-publish
      const result = await executeFactoryRun(
        {
          mode: "full",
          keywords: niche.keywords,
          opportunityData: niche.opportunityData,
        },
        baseUrl,
      );

      product.factoryRunId = result.factoryRunId;

      if (result.status !== "ready_to_list") {
        throw new Error(`Factory run ended with status: ${result.status}`);
      }

      product.status = "ready";
      product.completedAt = new Date().toISOString();
      batch.totalReady++;

      console.log(`[Batch] [${i + 1}/${niches.length}] ${niche.id} ready_to_list (runId: ${result.factoryRunId}). Review and publish manually via /api/factory/publish.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      product.status = "failed";
      product.error = message;
      product.completedAt = new Date().toISOString();
      batch.totalFailed++;

      console.error(`[Batch] [${i + 1}/${niches.length}] ${niche.id} FAILED:`, message);
      // Continue with next product — don't stop the batch
    }

    // Small delay between products to avoid rate limiting
    if (i < niches.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  batch.status = "completed";
  batch.completedAt = new Date().toISOString();
  console.log(`[Batch] Done. ${batch.totalReady} ready to list, ${batch.totalFailed} failed out of ${niches.length}. Publish manually.`);
}
