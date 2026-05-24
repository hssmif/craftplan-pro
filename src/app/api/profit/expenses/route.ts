// ══════════════════════════════════════════════════════════════
// Profit Tracker — Operating Expenses CRUD
//
// GET    /api/profit/expenses            → list
// POST   /api/profit/expenses            → create or update (upsert)
// DELETE /api/profit/expenses?id=xxx     → delete
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  listOperatingExpenses,
  upsertOperatingExpense,
  deleteOperatingExpense,
} from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json({ success: true, expenses: listOperatingExpenses() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, category, monthlyAmount, startedAt, endedAt, notes } = body as {
      id?: string;
      name?: string;
      category?: string;
      monthlyAmount?: number;
      startedAt?: string;
      endedAt?: string;
      notes?: string;
    };

    if (!name?.trim() || typeof monthlyAmount !== "number" || monthlyAmount < 0) {
      return NextResponse.json(
        { error: "name and monthlyAmount (>= 0) required" },
        { status: 400 }
      );
    }

    const savedId = upsertOperatingExpense({
      id,
      name: name.trim(),
      category: category ?? null,
      monthly_amount: monthlyAmount,
      started_at: startedAt ?? null,
      ended_at: endedAt ?? null,
      notes: notes ?? null,
    });
    return NextResponse.json({ success: true, id: savedId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteOperatingExpense(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 }
    );
  }
}
