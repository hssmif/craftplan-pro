"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCatalogStore, type CatalogItem } from "@/stores/catalogStore";

// ── Template type metadata (matches notion-builder TEMPLATE_TYPES) ──
const TYPE_META: Record<string, { icon: string; name: string; cover: string }> = {
  life_planner: { icon: "🌟", name: "All-in-One Life Planner", cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop" },
  student_planner: { icon: "🎓", name: "Student Planner", cover: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=200&fit=crop" },
  finance_tracker: { icon: "💰", name: "Finance Tracker", cover: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop" },
  adhd_planner: { icon: "🧠", name: "ADHD Planner", cover: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=400&h=200&fit=crop" },
  social_media: { icon: "📱", name: "Social Media Planner", cover: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=200&fit=crop" },
  habit_tracker: { icon: "✅", name: "Habit Tracker", cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&h=200&fit=crop" },
  business_hub: { icon: "💼", name: "Business Hub", cover: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=200&fit=crop" },
  debt_calculator: { icon: "📉", name: "Debt Calculator", cover: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&h=200&fit=crop" },
  // PDF Planner types
  daily_planner: { icon: "📅", name: "Daily Planner", cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&h=200&fit=crop" },
  weekly_planner: { icon: "📆", name: "Weekly Planner", cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop" },
  monthly_planner: { icon: "🗓️", name: "Monthly Planner", cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&h=200&fit=crop" },
  budget_planner: { icon: "💰", name: "Budget Planner", cover: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop" },
  fitness_planner: { icon: "💪", name: "Fitness Planner", cover: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=200&fit=crop" },
  self_care_planner: { icon: "🧘", name: "Self-Care Planner", cover: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400&h=200&fit=crop" },
  business_planner: { icon: "💼", name: "Business Planner", cover: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=200&fit=crop" },
  student_planner_pdf: { icon: "🎓", name: "Student Planner", cover: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=200&fit=crop" },
  // Excel Tracker types
  budget_tracker: { icon: "📊", name: "Budget Tracker", cover: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop" },
  habit_tracker_excel: { icon: "✅", name: "Habit Tracker", cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&h=200&fit=crop" },
  fitness_tracker: { icon: "🏋️", name: "Fitness Tracker", cover: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=200&fit=crop" },
  business_tracker: { icon: "📈", name: "Business Tracker", cover: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=200&fit=crop" },
  meal_planner: { icon: "🍽️", name: "Meal Planner", cover: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=200&fit=crop" },
  project_tracker: { icon: "📋", name: "Project Tracker", cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop" },
  life_os: {
    icon: "🧬",
    name: "LifeOS Ultra — All-in-One",
    cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop"
  },
  // Printable types
  quote_prints: { icon: "✨", name: "Quote Prints", cover: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=200&fit=crop" },
  habit_tracker_print: { icon: "📝", name: "Habit Tracker", cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&h=200&fit=crop" },
  gratitude_journal: { icon: "🙏", name: "Gratitude Journal", cover: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=200&fit=crop" },
  goal_worksheet: { icon: "🎯", name: "Goal Worksheet", cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop" },
  meal_planner_print: { icon: "🥗", name: "Meal Planner", cover: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=200&fit=crop" },
  budget_worksheet: { icon: "💵", name: "Budget Worksheet", cover: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop" },
};

const STATUS_CONFIG: Record<CatalogItem["status"], { label: string; dot: string; text: string; bg: string }> = {
  draft: { label: "Draft", dot: "bg-slate-400", text: "text-slate-300", bg: "bg-slate-500/15 border-slate-500/20" },
  mockups_needed: { label: "Mockups Needed", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20" },
  ready_to_list: { label: "Ready", dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/20" },
  listed: { label: "Listed", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/20" },
  archived: { label: "Archived", dot: "bg-gray-500", text: "text-gray-400", bg: "bg-gray-500/15 border-gray-500/20" },
};

const TIER_CONFIG: Record<string, { emoji: string; color: string; bg: string }> = {
  Diamond: { emoji: "💎", color: "text-cyan-400", bg: "bg-cyan-500/15 border-cyan-500/25" },
  Platinum: { emoji: "🥇", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/25" },
  Gold: { emoji: "🏆", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/25" },
  Silver: { emoji: "🪙", color: "text-slate-300", bg: "bg-slate-500/15 border-slate-500/25" },
  Bronze: { emoji: "🥉", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/25" },
};

type FilterStatus = "all" | CatalogItem["status"];
type SortBy = "newest" | "quality" | "revenue";
type FilterProductType = "all" | "notion" | "pdf" | "excel" | "printable";

const PRODUCT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  notion: { label: "Notion", icon: "📋", color: "indigo" },
  pdf: { label: "PDF", icon: "📄", color: "blue" },
  excel: { label: "Excel", icon: "📊", color: "emerald" },
  printable: { label: "Printable", icon: "🎨", color: "pink" },
};

export default function CatalogPage() {
  const { items, updateStatus, updateRevenue, removeItem } = useCatalogStore();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProductType, setFilterProductType] = useState<FilterProductType>("all");

  // Mark Listed modal state
  const [listingModalId, setListingModalId] = useState<string | null>(null);
  const [listingUrl, setListingUrl] = useState("");
  const [listingRevenue, setListingRevenue] = useState("");

  // Filtered + sorted items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter((item) => item.status === filterStatus);
    }

    // Filter by product type
    if (filterProductType !== "all") {
      result = result.filter((item) => item.productType === filterProductType);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.templateName.toLowerCase().includes(q) ||
          item.variantName.toLowerCase().includes(q) ||
          item.templateType.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case "quality":
        result.sort((a, b) => (b.qualityScore?.overall || 0) - (a.qualityScore?.overall || 0));
        break;
      case "revenue":
        result.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
        break;
      case "newest":
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return result;
  }, [items, filterStatus, filterProductType, sortBy, searchQuery]);

  // Stats
  const totalItems = items.length;
  const listedCount = items.filter((i) => i.status === "listed").length;
  const totalRevenue = items.reduce((sum, i) => sum + (i.revenue || 0), 0);
  const scoredItems = items.filter((i) => i.qualityScore?.overall);
  const avgScore = scoredItems.length > 0
    ? Math.round(scoredItems.reduce((sum, i) => sum + (i.qualityScore?.overall || 0), 0) / scoredItems.length)
    : 0;

  function handleMarkListed(id: string) {
    setListingModalId(id);
    const item = items.find((i) => i.id === id);
    setListingUrl(item?.etsyListingUrl || "");
    setListingRevenue(item?.revenue?.toString() || "");
  }

  function saveListedInfo() {
    if (!listingModalId) return;
    const rev = parseFloat(listingRevenue) || 0;
    updateRevenue(listingModalId, rev, listingUrl);
    setListingModalId(null);
    setListingUrl("");
    setListingRevenue("");
  }

  const statusTabs: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalItems },
    { key: "draft", label: "Draft", count: items.filter((i) => i.status === "draft").length },
    { key: "mockups_needed", label: "Mockups", count: items.filter((i) => i.status === "mockups_needed").length },
    { key: "ready_to_list", label: "Ready", count: items.filter((i) => i.status === "ready_to_list").length },
    { key: "listed", label: "Listed", count: listedCount },
    { key: "archived", label: "Archived", count: items.filter((i) => i.status === "archived").length },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">Product Catalog</h2>
        <p className="text-[var(--text-secondary)] mt-1 text-sm">Manage your digital products pipeline</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {/* Total */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-white/[0.08] p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.15em]">Total</p>
          <p className="text-3xl font-bold text-white mt-2 tracking-tight stat-number">{totalItems}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">templates</p>
        </div>
        {/* Listed */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-emerald-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <p className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-[0.15em]">Listed</p>
          <p className="text-3xl font-bold text-emerald-400 mt-2 tracking-tight stat-number">{listedCount}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">on Etsy</p>
        </div>
        {/* Revenue */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-amber-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <p className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-[0.15em]">Revenue</p>
          <p className="text-3xl font-bold text-amber-400 mt-2 tracking-tight stat-number">
            ${totalRevenue.toLocaleString()}
            <span className="text-sm font-normal text-amber-400/50">/mo</span>
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">monthly</p>
        </div>
        {/* Avg Score */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-violet-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <p className="text-[10px] text-violet-400/70 font-semibold uppercase tracking-[0.15em]">Avg Score</p>
          <p className="text-3xl font-bold text-violet-400 mt-2 tracking-tight stat-number">
            {avgScore}
            <span className="text-sm font-normal text-violet-400/50">/100</span>
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">quality</p>
        </div>
      </div>

      {/* Product Type Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "notion", "pdf", "excel", "printable"] as FilterProductType[]).map((type) => {
          const config = type !== "all" ? PRODUCT_TYPE_CONFIG[type] : null;
          const count = type === "all" ? items.length : items.filter(i => i.productType === type).length;
          return (
            <button
              key={type}
              onClick={() => setFilterProductType(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterProductType === type
                  ? "bg-white/[0.1] text-white border border-white/[0.15]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              {config ? <span>{config.icon}</span> : null}
              <span>{type === "all" ? "All Products" : config?.label}</span>
              {count > 0 && <span className="text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded-full">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        {/* Status tabs */}
        <div className="flex gap-1 bg-[var(--bg-elevated)] p-1 rounded-xl overflow-x-auto scrollbar-hide flex-nowrap border border-white/[0.06]">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                filterStatus === tab.key
                  ? "bg-white/[0.1] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  filterStatus === tab.key ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.06] text-[var(--text-muted)]"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="text-xs rounded-lg px-3 py-2 text-[var(--text-secondary)] focus:outline-none"
        >
          <option value="newest">Newest First</option>
          <option value="quality">Quality Score</option>
          <option value="revenue">Revenue</option>
        </select>

        {/* Search */}
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-lg text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-5 bg-[var(--bg-elevated)] rounded-2xl flex items-center justify-center border border-white/[0.06]">
            <svg className="w-10 h-10 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          {items.length === 0 ? (
            <>
              <p className="text-white font-semibold text-lg">No products yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-2 mb-6">Build your first product in the Digital Studio</p>
              <Link
                href="/notion-builder"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Build Template
              </Link>
            </>
          ) : (
            <>
              <p className="text-white font-semibold">No templates match your filters</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">Try adjusting the status filter or search query</p>
            </>
          )}
        </div>
      ) : (
        /* Template Cards Grid */
        <div className="grid grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const meta = TYPE_META[item.templateType] || { icon: "📋", name: item.templateType, cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=200&fit=crop" };
            const status = STATUS_CONFIG[item.status];
            const tier = item.qualityScore?.tier ? TIER_CONFIG[item.qualityScore.tier] || null : null;
            const isListing = listingModalId === item.id;

            return (
              <div key={item.id} className="bg-gradient-to-br from-[#0f0f1a]/80 to-[#161624] rounded-xl border border-white/[0.08] overflow-hidden group card-hover">
                {/* Cover Image */}
                <div className="h-36 relative overflow-hidden">
                  <img
                    src={meta.cover}
                    alt={item.templateName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="text-xl drop-shadow-lg">{meta.icon}</span>
                    <span className="text-white text-xs font-bold drop-shadow-lg tracking-tight">{meta.name}</span>
                  </div>
                  {/* Status badge */}
                  <span className={`absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border backdrop-blur-sm ${status.bg} ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  {/* Product type badge */}
                  {item.productType && item.productType !== "notion" && (
                    <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-sm ${
                      item.productType === "pdf" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                      item.productType === "excel" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                      "bg-pink-500/20 text-pink-300 border-pink-500/30"
                    }`}>
                      {PRODUCT_TYPE_CONFIG[item.productType]?.icon} {PRODUCT_TYPE_CONFIG[item.productType]?.label}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-white truncate">{item.templateName}</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                        <span className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--text-secondary)]">{item.variantName}</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Quality + Revenue row */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {tier && item.qualityScore && (
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tier.bg} ${tier.color}`}>
                        {tier.emoji} {item.qualityScore.tier} ({item.qualityScore.overall}%)
                      </span>
                    )}
                    {item.revenue !== undefined && item.revenue > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        ${item.revenue}/mo
                      </span>
                    )}
                    {item.lastPatched && (
                      <span className="text-[10px] text-violet-400 font-medium">Upgraded</span>
                    )}
                  </div>

                  {/* Notion link */}
                  {item.notionPageUrl && (
                    <a
                      href={item.notionPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mb-3 truncate transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in Notion
                    </a>
                  )}

                  {/* Mark Listed Inline Modal */}
                  {isListing ? (
                    <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-3 mb-3 space-y-2">
                      <p className="text-xs font-semibold text-emerald-400">Mark as Listed</p>
                      <input
                        type="text"
                        value={listingUrl}
                        onChange={(e) => setListingUrl(e.target.value)}
                        placeholder="Etsy listing URL"
                        className="w-full text-xs rounded-lg px-3 py-1.5"
                      />
                      <input
                        type="number"
                        value={listingRevenue}
                        onChange={(e) => setListingRevenue(e.target.value)}
                        placeholder="Monthly revenue ($)"
                        className="w-full text-xs rounded-lg px-3 py-1.5"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveListedInfo}
                          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-500 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setListingModalId(null)}
                          className="px-3 py-1.5 bg-white/[0.06] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-white/[0.1] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Action Buttons */}
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Link
                      href={`/notion-builder?upgrade=${item.notionPageId}`}
                      className="flex-1 py-1.5 bg-violet-500/15 text-violet-400 border border-violet-500/20 rounded-lg text-[11px] font-semibold text-center hover:bg-violet-500/25 transition-colors"
                    >
                      Upgrade
                    </Link>
                    <button
                      onClick={() => handleMarkListed(item.id)}
                      className="flex-1 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] font-semibold hover:bg-emerald-500/25 transition-colors"
                    >
                      Mark Listed
                    </button>
                    <button
                      onClick={() => updateStatus(item.id, item.status === "archived" ? "draft" : "archived")}
                      className="py-1.5 px-2.5 bg-white/[0.04] text-[var(--text-muted)] border border-white/[0.06] rounded-lg text-[11px] hover:bg-white/[0.08] hover:text-[var(--text-secondary)] transition-colors"
                      title={item.status === "archived" ? "Unarchive" : "Archive"}
                    >
                      {item.status === "archived" ? "📤" : "🗄️"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Remove this template from catalog?")) removeItem(item.id);
                      }}
                      className="py-1.5 px-2.5 bg-white/[0.04] text-[var(--text-muted)] border border-white/[0.06] rounded-lg text-[11px] hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/20 transition-colors"
                      title="Remove"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
