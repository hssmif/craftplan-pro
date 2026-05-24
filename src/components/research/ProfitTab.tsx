"use client";

import { useEffect, useState, useMemo } from "react";

interface OrderItem {
  listing_id: number;
  title: string;
  quantity: number;
  unit_price: number;
  cogs_per_unit: number;
  is_digital: boolean;
}

interface OrderRow {
  receipt_id: number;
  date: string;
  buyer: string;
  status: string;
  items: OrderItem[];
  gross_revenue: number;
  shipping_charged: number;
  tax: number;
  discount: number;
  etsy_fees: { transaction: number; payment_processing: number; regulatory: number; total: number };
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

interface OperatingExpenseLine {
  id: string;
  name: string;
  category: string | null;
  amount: number;
}

interface SummaryData {
  success: boolean;
  days: number;
  totals: {
    orders: number;
    gross_revenue: number;
    etsy_fees: number;
    cogs: number;
    gross_profit: number;
    operating_expenses: number;
    etsy_ads: number;
    offsite_ads: number;
    ad_spend_total: number;
    net_profit: number;
    shipping_charged: number;
    avg_margin_pct: number;
    roas: number | null;
    tacos: number | null;
  };
  operating_expenses: { total: number; breakdown: OperatingExpenseLine[] };
  ads: {
    etsy_ads: number;
    offsite_ads: number;
    roas: number | null;
    tacos: number | null;
    break_even_roas: number | null;
  };
  orders: OrderRow[];
  per_listing: ListingAggregate[];
  currency: string;
}

interface OpExp {
  id: string;
  name: string;
  category: string | null;
  monthly_amount: number;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

function fmtMoney(v: number, ccy: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export default function ProfitTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"orders" | "listings">("listings");
  const [showExpenses, setShowExpenses] = useState(false);
  const [allExpenses, setAllExpenses] = useState<OpExp[]>([]);
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpCategory, setNewExpCategory] = useState("");

  const loadExpenses = async () => {
    try {
      const r = await fetch("/api/profit/expenses");
      const j = await r.json();
      if (r.ok) setAllExpenses(j.expenses ?? []);
    } catch { /* ignore */ }
  };

  const addExpense = async () => {
    const amt = parseFloat(newExpAmount);
    if (!newExpName.trim() || isNaN(amt) || amt < 0) return;
    await fetch("/api/profit/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newExpName.trim(),
        monthlyAmount: amt,
        category: newExpCategory.trim() || null,
      }),
    });
    setNewExpName("");
    setNewExpAmount("");
    setNewExpCategory("");
    await loadExpenses();
    load(days);
  };

  const removeExpense = async (id: string) => {
    await fetch(`/api/profit/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadExpenses();
    load(days);
  };

  const load = async (rangeDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/profit/summary?days=${rangeDays}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Failed to load profit data");
        setData(null);
        return;
      }
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
  }, [days]);

  useEffect(() => {
    if (showExpenses) loadExpenses();
  }, [showExpenses]);

  const saveCogs = async (listingId: number) => {
    const cogs = parseFloat(editValue);
    if (isNaN(cogs) || cogs < 0) {
      setError("COGS must be a non-negative number");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/profit/cogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, cogs }),
      });
      if (!r.ok) {
        const j = await r.json();
        setError(j.error || "Failed to save");
        return;
      }
      setEditingId(null);
      setEditValue("");
      load(days);
    } finally {
      setSaving(false);
    }
  };

  const totals = data?.totals;
  const ccy = data?.currency || "USD";

  const profitColor = useMemo(() => {
    if (!totals) return "text-white/60";
    if (totals.net_profit > 0) return "text-emerald-400";
    if (totals.net_profit < 0) return "text-red-400";
    return "text-white/60";
  }, [totals]);

  return (
    <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-widest uppercase text-emerald-400/80 mb-1">
              PROFIT TRACKER
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-white leading-none">
              True profit · <span className="text-emerald-400 italic">no spreadsheet needed</span>
            </h1>
            <p className="text-sm text-white/40 mt-2">
              Pulls your Etsy receipts, applies all fees, subtracts your COGS — gives you real net profit per order and per listing.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.08] rounded-lg">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                  days === r.days
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400/40 hover:text-red-400"
            >
              dismiss
            </button>
          </div>
        )}

        {/* ── KPI cards ── */}
        {loading && !data ? (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : totals ? (
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Orders" value={String(totals.orders)} sub={`${days} days`} accent="indigo" />
            <KpiCard label="Gross Revenue" value={fmtMoney(totals.gross_revenue, ccy)} sub="before fees" accent="white" />
            <KpiCard
              label="Etsy Fees"
              value={fmtMoney(totals.etsy_fees, ccy)}
              sub={`${totals.gross_revenue > 0 ? ((totals.etsy_fees / totals.gross_revenue) * 100).toFixed(1) : 0}% of gross`}
              accent="amber"
            />
            <KpiCard
              label="Net Profit"
              value={fmtMoney(totals.net_profit, ccy)}
              sub={`${fmtPct(totals.avg_margin_pct)} margin`}
              accent={totals.net_profit >= 0 ? "emerald" : "red"}
              highlight
            />
          </div>
        ) : null}

        {/* ── Cost breakdown bar ── */}
        {totals && totals.gross_revenue > 0 && (
          <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Where the money went</span>
              <span className={`text-sm font-bold ${profitColor}`}>
                {fmtMoney(totals.net_profit, ccy)} net · {fmtPct(totals.avg_margin_pct)} margin
              </span>
            </div>
            <div className="flex h-8 rounded-md overflow-hidden border border-white/[0.05]">
              <div
                className="bg-emerald-500/30 border-r border-emerald-500/20 flex items-center justify-center text-[10px] font-semibold text-emerald-300"
                style={{ width: `${Math.max(0, (totals.net_profit / totals.gross_revenue) * 100)}%` }}
                title="Net profit"
              >
                {totals.net_profit > 0 && totals.net_profit / totals.gross_revenue > 0.05 ? "Profit" : ""}
              </div>
              <div
                className="bg-amber-500/30 border-r border-amber-500/20 flex items-center justify-center text-[10px] font-semibold text-amber-300"
                style={{ width: `${(totals.etsy_fees / totals.gross_revenue) * 100}%` }}
                title="Etsy fees"
              >
                {totals.etsy_fees / totals.gross_revenue > 0.05 ? "Etsy" : ""}
              </div>
              <div
                className="bg-rose-500/30 border-r border-rose-500/20 flex items-center justify-center text-[10px] font-semibold text-rose-300"
                style={{ width: `${(totals.cogs / totals.gross_revenue) * 100}%` }}
                title="COGS"
              >
                {totals.cogs / totals.gross_revenue > 0.05 ? "COGS" : ""}
              </div>
              <div
                className="bg-violet-500/30 border-r border-violet-500/20 flex items-center justify-center text-[10px] font-semibold text-violet-300"
                style={{ width: `${(totals.operating_expenses / totals.gross_revenue) * 100}%` }}
                title="Operating expenses"
              >
                {totals.operating_expenses / totals.gross_revenue > 0.05 ? "OpEx" : ""}
              </div>
              <div
                className="bg-pink-500/30 flex items-center justify-center text-[10px] font-semibold text-pink-300"
                style={{ width: `${(totals.ad_spend_total / totals.gross_revenue) * 100}%` }}
                title="Etsy Ads + Offsite Ads"
              >
                {totals.ad_spend_total / totals.gross_revenue > 0.05 ? "Ads" : ""}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-white/40 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/60" /> Net profit {fmtMoney(totals.net_profit, ccy)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/60" /> Etsy fees {fmtMoney(totals.etsy_fees, ccy)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500/60" /> COGS {fmtMoney(totals.cogs, ccy)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-violet-500/60" /> OpEx {fmtMoney(totals.operating_expenses, ccy)}</span>
              {totals.ad_spend_total > 0 && (
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-pink-500/60" /> Ads {fmtMoney(totals.ad_spend_total, ccy)}</span>
              )}
            </div>
          </div>
        )}

        {/* ── Etsy Ads ROAS / TACoS ── */}
        {data?.ads && (data.ads.etsy_ads > 0 || data.ads.offsite_ads > 0) && (
          <div className="rounded-xl border border-pink-500/20 bg-gradient-to-br from-pink-500/[0.04] via-rose-500/[0.03] to-transparent p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-pink-300">Etsy Ads · ROAS / TACoS</span>
                {data.ads.roas != null && data.ads.break_even_roas != null && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    data.ads.roas >= data.ads.break_even_roas
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}>
                    {data.ads.roas >= data.ads.break_even_roas ? "PROFITABLE" : "BURNING CASH"}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/30">last {days} days</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <AdMetricCard
                label="Etsy Ads spend"
                value={fmtMoney(data.ads.etsy_ads, ccy)}
                sub="user-controlled"
                color="pink"
              />
              <AdMetricCard
                label="Offsite Ads fee"
                value={fmtMoney(data.ads.offsite_ads, ccy)}
                sub="auto-applied 12-15%"
                color="rose"
              />
              <AdMetricCard
                label="ROAS"
                value={data.ads.roas != null ? `${data.ads.roas.toFixed(2)}×` : "—"}
                sub="revenue ÷ ad-spend"
                color={
                  data.ads.roas == null
                    ? "white"
                    : data.ads.break_even_roas != null && data.ads.roas >= data.ads.break_even_roas
                    ? "emerald"
                    : "red"
                }
              />
              <AdMetricCard
                label="TACoS"
                value={data.ads.tacos != null ? `${data.ads.tacos.toFixed(1)}%` : "—"}
                sub="ad-spend ÷ revenue"
                color={
                  data.ads.tacos == null ? "white"
                  : data.ads.tacos < 10 ? "emerald"
                  : data.ads.tacos < 25 ? "amber"
                  : "red"
                }
              />
            </div>
            {data.ads.break_even_roas != null && data.ads.roas != null && (
              <p className="text-[10px] text-white/40 mt-3 italic">
                Break-even ROAS for your shop is <span className="text-pink-300 font-semibold">{data.ads.break_even_roas.toFixed(2)}×</span>.
                You need ROAS above that to actually profit on ads after fees + COGS + OpEx.
                {data.ads.roas < data.ads.break_even_roas && " Consider pausing or tightening targeting."}
              </p>
            )}
          </div>
        )}

        {/* ── Operating expenses (collapsible) ── */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <button
            onClick={() => setShowExpenses((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300/80">Operating Expenses</span>
              {totals?.operating_expenses != null && (
                <span className="text-xs text-white/50">
                  {fmtMoney(totals.operating_expenses, ccy)} pro-rated for {days}d
                </span>
              )}
              {data?.operating_expenses?.breakdown && data.operating_expenses.breakdown.length > 0 && (
                <span className="text-[10px] text-white/30">
                  · {data.operating_expenses.breakdown.length} item{data.operating_expenses.breakdown.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <svg className={`w-4 h-4 text-white/30 transition-transform ${showExpenses ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showExpenses && (
            <div className="px-5 pb-5 space-y-3 border-t border-white/[0.05]">
              <p className="text-[11px] text-white/40 mt-3">
                Recurring monthly costs (software, ads baseline, virtual assistant, courses, etc.).
                Pro-rated into Net Profit by date range — e.g. a $30/mo item subtracts $30 from a 30-day window or ~$7 from a 7-day window.
              </p>

              {/* Existing expenses list */}
              {allExpenses.length > 0 ? (
                <div className="space-y-1.5">
                  {allExpenses.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white/80 truncate">{e.name}</span>
                          {e.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/40">{e.category}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-rose-300/80 tabular-nums">{fmtMoney(e.monthly_amount, ccy)}/mo</span>
                      <button
                        onClick={() => removeExpense(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V3a1 1 0 011-1h4a1 1 0 011 1v4" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30 italic">No operating expenses yet. Add your first below.</p>
              )}

              {/* Add new */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  value={newExpName}
                  onChange={(e) => setNewExpName(e.target.value)}
                  placeholder="Name (e.g. Photoshop, Canva Pro, VA)"
                  className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.10] rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40"
                />
                <input
                  value={newExpCategory}
                  onChange={(e) => setNewExpCategory(e.target.value)}
                  placeholder="Category"
                  className="w-32 px-3 py-2 bg-white/[0.04] border border-white/[0.10] rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40"
                />
                <div className="relative">
                  <span className="absolute left-3 top-2 text-white/40 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newExpAmount}
                    onChange={(e) => setNewExpAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addExpense()}
                    placeholder="0.00"
                    className="w-28 pl-6 pr-3 py-2 bg-white/[0.04] border border-white/[0.10] rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40 text-right tabular-nums"
                  />
                </div>
                <span className="text-[10px] text-white/40">/mo</span>
                <button
                  onClick={addExpense}
                  disabled={!newExpName.trim() || !newExpAmount}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-30 rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── View toggle ── */}
        <div className="flex items-center gap-1 border-b border-white/[0.06]">
          {(["listings", "orders"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
                view === v
                  ? "text-white border-emerald-400"
                  : "text-white/40 border-transparent hover:text-white/60"
              }`}
            >
              {v === "listings" ? `By Listing (${data?.per_listing.length ?? 0})` : `By Order (${data?.orders.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* ── Per-listing table (the heart of the tool) ── */}
        {view === "listings" && data?.per_listing.length === 0 && !loading && (
          <div className="p-8 text-center text-white/30 text-sm bg-white/[0.02] border border-white/[0.06] rounded-xl">
            No orders in the last {days} days. Connect your Etsy shop and check back after sales come in.
          </div>
        )}

        {view === "listings" && data && data.per_listing.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] border-b border-white/[0.06]">
                <tr className="text-[10px] uppercase tracking-wider text-white/40">
                  <th className="text-left px-4 py-3">Listing</th>
                  <th className="text-right px-2 py-3">Sold</th>
                  <th className="text-right px-2 py-3">Revenue</th>
                  <th className="text-right px-2 py-3">Etsy Fees</th>
                  <th className="text-right px-2 py-3">COGS / unit</th>
                  <th className="text-right px-2 py-3">Net</th>
                  <th className="text-right px-4 py-3">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.per_listing.map((l) => {
                  const isEditing = editingId === l.listing_id;
                  const cogsPerUnit = l.units_sold > 0 ? l.cogs_total / l.units_sold : 0;
                  return (
                    <tr key={l.listing_id} className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                      <td className="px-4 py-3 text-white/80">
                        <div className="text-xs font-medium line-clamp-1 max-w-md">{l.title}</div>
                        <a
                          href={`https://www.etsy.com/listing/${l.listing_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-white/30 hover:text-white/60"
                        >
                          #{l.listing_id} ↗
                        </a>
                      </td>
                      <td className="text-right px-2 py-3 text-white/70 tabular-nums">{l.units_sold}</td>
                      <td className="text-right px-2 py-3 text-white/70 tabular-nums">{fmtMoney(l.gross_revenue, ccy)}</td>
                      <td className="text-right px-2 py-3 text-amber-300/70 tabular-nums">{fmtMoney(l.etsy_fees, ccy)}</td>
                      <td className="text-right px-2 py-3 tabular-nums">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-white/40">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveCogs(l.listing_id)}
                              className="w-20 px-2 py-1 text-right bg-white/[0.06] border border-emerald-500/30 rounded text-white text-xs focus:outline-none focus:border-emerald-500/60"
                            />
                            <button
                              onClick={() => saveCogs(l.listing_id)}
                              disabled={saving}
                              className="px-2 py-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 rounded"
                            >
                              {saving ? "…" : "save"}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditValue(""); }}
                              className="px-1.5 py-1 text-[10px] text-white/30 hover:text-white/60"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(l.listing_id);
                              setEditValue(cogsPerUnit.toFixed(2));
                            }}
                            className={`text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10 px-2 py-1 rounded transition-colors ${
                              cogsPerUnit === 0 ? "italic text-white/30" : ""
                            }`}
                          >
                            {cogsPerUnit === 0 ? "+ add" : fmtMoney(cogsPerUnit, ccy)}
                          </button>
                        )}
                      </td>
                      <td className={`text-right px-2 py-3 tabular-nums font-semibold ${l.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmtMoney(l.net_profit, ccy)}
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums">
                        <span className={`text-xs font-semibold ${
                          l.margin_pct >= 30 ? "text-emerald-400" :
                          l.margin_pct >= 10 ? "text-amber-400" :
                          "text-red-400"
                        }`}>
                          {fmtPct(l.margin_pct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Per-order list ── */}
        {view === "orders" && data && data.orders.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] border-b border-white/[0.06]">
                <tr className="text-[10px] uppercase tracking-wider text-white/40">
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-2 py-3">Buyer</th>
                  <th className="text-right px-2 py-3">Gross</th>
                  <th className="text-right px-2 py-3">Etsy Fees</th>
                  <th className="text-right px-2 py-3">COGS</th>
                  <th className="text-right px-2 py-3">Net</th>
                  <th className="text-right px-4 py-3">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.receipt_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-white/80">#{o.receipt_id}</div>
                      <div className="text-[10px] text-white/30">{new Date(o.date).toLocaleDateString()}</div>
                    </td>
                    <td className="px-2 py-3 text-xs text-white/60 max-w-[200px] truncate">{o.buyer}</td>
                    <td className="text-right px-2 py-3 text-white/70 tabular-nums">{fmtMoney(o.gross_revenue, ccy)}</td>
                    <td className="text-right px-2 py-3 text-amber-300/70 tabular-nums">{fmtMoney(o.etsy_fees.total, ccy)}</td>
                    <td className="text-right px-2 py-3 text-rose-300/70 tabular-nums">{fmtMoney(o.cogs_total, ccy)}</td>
                    <td className={`text-right px-2 py-3 tabular-nums font-semibold ${o.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtMoney(o.net_profit, ccy)}
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums">
                      <span className={`text-xs font-semibold ${
                        o.margin_pct >= 30 ? "text-emerald-400" :
                        o.margin_pct >= 10 ? "text-amber-400" :
                        "text-red-400"
                      }`}>
                        {fmtPct(o.margin_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && data && (
          <div className="text-xs text-white/30 text-center">Refreshing…</div>
        )}
    </div>
  );
}

// ── Sub-components ──

function AdMetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "pink" | "rose" | "emerald" | "amber" | "red" | "white";
}) {
  const colors: Record<typeof color, string> = {
    pink: "text-pink-300",
    rose: "text-rose-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
    white: "text-white/70",
  };
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-white/35 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${colors[color]}`}>{value}</p>
      <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "indigo" | "amber" | "emerald" | "red" | "white";
  highlight?: boolean;
}) {
  const colors: Record<typeof accent, string> = {
    indigo: "text-indigo-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    red: "text-red-300",
    white: "text-white",
  };
  return (
    <div className={`p-4 bg-white/[0.02] border ${highlight ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.08]"} rounded-xl`}>
      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors[accent]}`}>{value}</p>
      <p className="text-[10px] text-white/30 mt-1">{sub}</p>
    </div>
  );
}
