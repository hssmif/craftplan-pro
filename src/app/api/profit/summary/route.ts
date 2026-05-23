// ══════════════════════════════════════════════════════════════
// Profit Tracker — Summary
// GET /api/profit/summary?days=30
//
// Pulls Etsy receipts for the date range, joins user-entered COGS,
// computes Etsy's standard fees, returns:
//   - Per-order P&L (gross → fees → COGS → net)
//   - Per-listing aggregates (units sold, revenue, profit, margin)
//   - Totals
//
// Etsy fees applied (2026 rates):
//   - Transaction fee: 6.5% of (item price + shipping price)
//   - Payment processing: 3% + $0.25 per order (US default)
//   - Listing fee: $0.20 per listing (charged when listed; we ignore here)
//   - Regulatory operating fee: 0.25% (varies by country; we apply 0.25%)
//
// Currency: assumes shop currency (we report in raw amount/divisor units).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAllReceipts, getAdSpend, type EtsyReceipt } from "@/lib/etsy-client";
import { getAllListingCogs, listOperatingExpenses, type OperatingExpense } from "@/lib/db";

export const maxDuration = 60;

// Helper: convert Etsy money object → real number
const money = (m: { amount: number; divisor: number } | undefined): number =>
  m && m.divisor ? m.amount / m.divisor : 0;

// Helper: pro-rate active operating expenses for the date range.
// Each expense contributes (days_active_in_window / 30) × monthly_amount.
function computePeriodOperatingExpenses(
  expenses: OperatingExpense[],
  startUnix: number,
  endUnix: number,
): { total: number; breakdown: Array<{ id: string; name: string; category: string | null; amount: number }> } {
  const startMs = startUnix * 1000;
  const endMs = endUnix * 1000;
  const dayMs = 86400 * 1000;
  const breakdown: Array<{ id: string; name: string; category: string | null; amount: number }> = [];
  let total = 0;

  for (const e of expenses) {
    const expStart = e.started_at ? Date.parse(e.started_at) : startMs;
    const expEnd = e.ended_at ? Date.parse(e.ended_at) : endMs;
    const overlapStart = Math.max(startMs, expStart);
    const overlapEnd = Math.min(endMs, expEnd);
    if (overlapEnd <= overlapStart) continue;
    const daysActive = (overlapEnd - overlapStart) / dayMs;
    const amount = (daysActive / 30) * (e.monthly_amount || 0);
    if (amount > 0) {
      breakdown.push({ id: e.id, name: e.name, category: e.category, amount });
      total += amount;
    }
  }
  return { total, breakdown };
}

// Etsy fee model (2026 standard rates)
const TRANSACTION_FEE_RATE = 0.065;
const PAYMENT_RATE = 0.03;
const PAYMENT_FLAT = 0.25;
const REGULATORY_RATE = 0.0025;

interface OrderRow {
  receipt_id: number;
  date: string;
  buyer: string;
  status: string;
  items: Array<{
    listing_id: number;
    title: string;
    quantity: number;
    unit_price: number;
    cogs_per_unit: number;
    is_digital: boolean;
  }>;
  gross_revenue: number;
  shipping_charged: number;
  tax: number;
  discount: number;
  // Computed
  etsy_fees: {
    transaction: number;
    payment_processing: number;
    regulatory: number;
    total: number;
  };
  cogs_total: number;
  net_profit: number;
  margin_pct: number;
}

interface ListingAggregate {
  listing_id: number;
  title: string;
  units_sold: number;
  gross_revenue: number;
  etsy_fees: number;
  cogs_total: number;
  net_profit: number;
  margin_pct: number;
}

function computeOrder(r: EtsyReceipt, cogsMap: Record<number, number>): OrderRow {
  const grossRevenue = money(r.subtotal); // item subtotal (before shipping/tax)
  const shippingCharged = money(r.total_shipping_cost);
  const tax = money(r.total_tax_cost);
  const discount = money(r.discount_amt);

  // Transaction fee applies to (item price + shipping)
  const feeBase = grossRevenue + shippingCharged - discount;
  const transactionFee = feeBase * TRANSACTION_FEE_RATE;

  // Payment processing on the full grandtotal
  const grandTotal = money(r.grandtotal);
  const paymentProcessing = grandTotal * PAYMENT_RATE + PAYMENT_FLAT;

  // Regulatory operating fee on item subtotal + shipping
  const regulatory = feeBase * REGULATORY_RATE;

  const totalFees = transactionFee + paymentProcessing + regulatory;

  // COGS — sum across line items
  let cogsTotal = 0;
  const items = (r.transactions ?? []).map((t) => {
    const cogs = cogsMap[t.listing_id] ?? 0;
    cogsTotal += cogs * t.quantity;
    return {
      listing_id: t.listing_id,
      title: t.title,
      quantity: t.quantity,
      unit_price: money(t.price),
      cogs_per_unit: cogs,
      is_digital: t.is_digital,
    };
  });

  const netProfit = grossRevenue - totalFees - cogsTotal;
  const marginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return {
    receipt_id: r.receipt_id,
    date: new Date(r.created_timestamp * 1000).toISOString(),
    buyer: r.name,
    status: r.is_shipped ? "shipped" : r.is_paid ? "paid" : r.status,
    items,
    gross_revenue: grossRevenue,
    shipping_charged: shippingCharged,
    tax,
    discount,
    etsy_fees: {
      transaction: transactionFee,
      payment_processing: paymentProcessing,
      regulatory,
      total: totalFees,
    },
    cogs_total: cogsTotal,
    net_profit: netProfit,
    margin_pct: marginPct,
  };
}

export async function GET(req: NextRequest) {
  try {
    const days = Math.max(
      1,
      Math.min(365, parseInt(req.nextUrl.searchParams.get("days") || "30", 10))
    );

    const minCreated = Math.floor(Date.now() / 1000) - days * 86400;

    const periodEndUnix = Math.floor(Date.now() / 1000);

    // Pull receipts + ad-spend in parallel — both touch Etsy API
    const [receipts, adSpend] = await Promise.all([
      getAllReceipts({ minCreated, maxPages: 10 }),
      getAdSpend({ minCreated, maxCreated: periodEndUnix }).catch((err) => {
        console.warn("[profit/summary] ad spend pull failed:", err instanceof Error ? err.message : err);
        return { etsy_ads: 0, offsite_ads: 0, entries: [] };
      }),
    ]);

    const cogsMap = getAllListingCogs();

    // ── Operating expenses pro-rated for the date range ──
    const expenses = listOperatingExpenses();
    const operatingExpensesPeriod = computePeriodOperatingExpenses(
      expenses,
      minCreated,
      periodEndUnix
    );

    const orders = receipts.map((r) => computeOrder(r, cogsMap));

    // Totals
    const totals = orders.reduce(
      (acc, o) => {
        acc.orders += 1;
        acc.gross_revenue += o.gross_revenue;
        acc.etsy_fees += o.etsy_fees.total;
        acc.cogs += o.cogs_total;
        acc.gross_profit += o.net_profit; // before operating expenses
        acc.shipping_charged += o.shipping_charged;
        return acc;
      },
      {
        orders: 0,
        gross_revenue: 0,
        etsy_fees: 0,
        cogs: 0,
        gross_profit: 0,
        shipping_charged: 0,
      }
    );
    // Subtract operating expenses AND Etsy Ads + offsite ads to get true net
    const adSpendTotal = adSpend.etsy_ads + adSpend.offsite_ads;
    const netProfit = totals.gross_profit - operatingExpensesPeriod.total - adSpendTotal;
    const avgMargin =
      totals.gross_revenue > 0 ? (netProfit / totals.gross_revenue) * 100 : 0;

    // ROAS = revenue ÷ ad-spend (only meaningful when ads were running)
    // TACoS = ad-spend ÷ revenue × 100 (Total Advertising Cost of Sales)
    const roas = adSpend.etsy_ads > 0 ? totals.gross_revenue / adSpend.etsy_ads : null;
    const tacos = totals.gross_revenue > 0 ? (adSpend.etsy_ads / totals.gross_revenue) * 100 : null;

    // Per-listing aggregates
    const listingMap = new Map<number, ListingAggregate>();
    for (const o of orders) {
      for (const it of o.items) {
        const existing = listingMap.get(it.listing_id);
        const itemRevenue = it.unit_price * it.quantity;
        const itemCogs = it.cogs_per_unit * it.quantity;
        const itemFeeShare = (itemRevenue / Math.max(o.gross_revenue, 0.01)) * o.etsy_fees.total;
        const itemProfit = itemRevenue - itemFeeShare - itemCogs;

        if (existing) {
          existing.units_sold += it.quantity;
          existing.gross_revenue += itemRevenue;
          existing.etsy_fees += itemFeeShare;
          existing.cogs_total += itemCogs;
          existing.net_profit += itemProfit;
        } else {
          listingMap.set(it.listing_id, {
            listing_id: it.listing_id,
            title: it.title,
            units_sold: it.quantity,
            gross_revenue: itemRevenue,
            etsy_fees: itemFeeShare,
            cogs_total: itemCogs,
            net_profit: itemProfit,
            margin_pct: 0,
          });
        }
      }
    }
    const perListing = Array.from(listingMap.values())
      .map((l) => ({
        ...l,
        margin_pct: l.gross_revenue > 0 ? (l.net_profit / l.gross_revenue) * 100 : 0,
      }))
      .sort((a, b) => b.net_profit - a.net_profit);

    return NextResponse.json({
      success: true,
      days,
      totals: {
        ...totals,
        operating_expenses: operatingExpensesPeriod.total,
        etsy_ads: adSpend.etsy_ads,
        offsite_ads: adSpend.offsite_ads,
        ad_spend_total: adSpendTotal,
        net_profit: netProfit,
        avg_margin_pct: avgMargin,
        roas,
        tacos,
      },
      operating_expenses: operatingExpensesPeriod,
      ads: {
        etsy_ads: adSpend.etsy_ads,
        offsite_ads: adSpend.offsite_ads,
        roas,
        tacos,
        // Break-even ROAS = 1 / margin (after non-ad costs).
        // Sellers need their ROAS above this to actually profit on ads.
        break_even_roas:
          totals.gross_revenue > 0
            ? totals.gross_revenue /
              Math.max(
                totals.gross_revenue - totals.etsy_fees - totals.cogs - operatingExpensesPeriod.total,
                0.01
              )
            : null,
      },
      orders: orders.sort((a, b) => b.date.localeCompare(a.date)),
      per_listing: perListing,
      currency: receipts[0]?.total_price?.currency_code ?? "USD",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[profit/summary] failed:", msg);
    return NextResponse.json(
      { error: `Profit summary failed: ${msg}` },
      { status: 500 }
    );
  }
}
