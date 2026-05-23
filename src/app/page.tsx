"use client";

import Link from "next/link";
import { useCatalogStore, type CatalogItem } from "@/stores/catalogStore";
import { useSettings } from "@/hooks/useSettings";

type IconName =
  | "search"
  | "factory"
  | "template"
  | "listing"
  | "spark"
  | "chart"
  | "calendar"
  | "grid"
  | "check"
  | "arrow"
  | "doc"
  | "image";

type Accent = "orange" | "emerald" | "sky" | "rose" | "amber";

type ModuleCard = {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  icon: IconName;
  accent: Accent;
  stat: string;
};

type ProductLane = {
  title: string;
  description: string;
  href: string;
  signal: string;
};

const accentClasses: Record<Accent, { border: string; bg: string; text: string; shadow: string }> = {
  orange: {
    border: "border-orange-400/35",
    bg: "bg-orange-500/12",
    text: "text-orange-200",
    shadow: "shadow-[0_18px_60px_rgba(241,100,30,0.14)]",
  },
  emerald: {
    border: "border-emerald-400/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-200",
    shadow: "shadow-[0_18px_60px_rgba(16,185,129,0.10)]",
  },
  sky: {
    border: "border-sky-400/30",
    bg: "bg-sky-500/10",
    text: "text-sky-200",
    shadow: "shadow-[0_18px_60px_rgba(56,189,248,0.10)]",
  },
  rose: {
    border: "border-rose-400/30",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    shadow: "shadow-[0_18px_60px_rgba(251,113,133,0.10)]",
  },
  amber: {
    border: "border-amber-300/30",
    bg: "bg-amber-400/10",
    text: "text-amber-100",
    shadow: "shadow-[0_18px_60px_rgba(251,191,36,0.10)]",
  },
};

const modules: ModuleCard[] = [
  {
    title: "Research Command",
    eyebrow: "Market signal",
    description: "Find Etsy-safe demand, compare products, inspect tags, and move the strongest opportunities into a build queue.",
    href: "/research",
    icon: "search",
    accent: "emerald",
    stat: "Ideas, products, tags",
  },
  {
    title: "Product Factory",
    eyebrow: "Build engine",
    description: "Turn a niche or competitor brief into spreadsheets, planners, listing assets, videos, and delivery packages.",
    href: "/factory",
    icon: "factory",
    accent: "orange",
    stat: "Research to review",
  },
  {
    title: "Template Studios",
    eyebrow: "Format lab",
    description: "Work across Notion, spreadsheets, PDFs, printables, wall art, cross-stitch patterns, and other digital product lines.",
    href: "/digital-studio",
    icon: "grid",
    accent: "sky",
    stat: "Multi-format",
  },
  {
    title: "Listing Room",
    eyebrow: "Publish review",
    description: "Review assets, listing copy, tags, thumbnails, and Etsy readiness before anything is sent to your shop.",
    href: "/my-listings",
    icon: "listing",
    accent: "rose",
    stat: "Human approval",
  },
];

const productLanes: ProductLane[] = [
  {
    title: "Spreadsheet Systems",
    description: "Premium Excel and Google Sheets products with dashboards, automations, trackers, and marketplace-ready packaging.",
    href: "/factory",
    signal: "Factory priority",
  },
  {
    title: "Notion Workspaces",
    description: "Client portals, planning hubs, content systems, and imported Notion templates with structured polish passes.",
    href: "/notion-builder",
    signal: "Importer live",
  },
  {
    title: "Visual Product Lines",
    description: "Wall art, mockup packs, listing images, thumbnails, and product videos built for digital storefronts.",
    href: "/wall-art",
    signal: "Asset studios",
  },
  {
    title: "Pattern Products",
    description: "Cross-stitch research, pattern generation, mockups, listing kits, and package review in one workflow.",
    href: "/cross-stitch",
    signal: "Specialist studio",
  },
];

const workflow = [
  { title: "Research", body: "Validate demand and buyer intent before building.", href: "/research", icon: "search" as const },
  { title: "Design", body: "Generate the product system, assets, copy, and QA checks.", href: "/factory", icon: "spark" as const },
  { title: "Package", body: "Prepare files, previews, delivery notes, and listing media.", href: "/digital-studio", icon: "doc" as const },
  { title: "Ship", body: "Review, approve, and list only when the product is ready.", href: "/my-listings", icon: "check" as const },
];

function ProductIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    search: "M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z",
    factory: "M3 21h18M5 21V9l7-4 7 4v12M9 21v-6h6v6M9 10h.01M15 10h.01M12 10h.01",
    template: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm4 0v16M3 10h18M3 15h18",
    listing: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z",
    chart: "M4 19V5m0 14h16M8 16V9m4 7V7m4 9v-5",
    calendar: "M8 2v4m8-4v4M4 9h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z",
    grid: "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z",
    check: "M20 6L9 17l-5-5",
    arrow: "M5 12h14m-6-6l6 6-6 6",
    doc: "M7 3h7l5 5v13H7V3zm7 0v6h5M10 13h6M10 17h6",
    image: "M4 5h16v14H4V5zm3 11l4-4 3 3 2-2 3 3M8 9h.01",
  };

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

function formatStatusLabel(status: CatalogItem["status"]): string {
  return status.replace(/_/g, " ");
}

export default function CraftPlanHome() {
  const items = useCatalogStore((state) => state.items);
  const { settings } = useSettings();

  const totalBuilt = items.length;
  const readyCount = items.filter((item) => item.status === "ready_to_list").length;
  const listedCount = items.filter((item) => item.status === "listed").length;
  const draftCount = items.filter((item) => item.status === "draft" || item.status === "mockups_needed").length;
  const scoredItems = items.filter((item) => item.qualityScore?.overall);
  const avgQuality = scoredItems.length
    ? Math.round(scoredItems.reduce((sum, item) => sum + (item.qualityScore?.overall || 0), 0) / scoredItems.length)
    : 0;
  const recentItems = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  const productMix = [
    { label: "Spreadsheet", count: items.filter((item) => item.productType === "excel").length },
    { label: "Notion", count: items.filter((item) => item.productType === "notion").length },
    { label: "PDF", count: items.filter((item) => item.productType === "pdf").length },
    { label: "Printable", count: items.filter((item) => item.productType === "printable").length },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[var(--bg-base)]">
      <section className="relative border-b border-white/[0.07] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/40 to-transparent" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              CraftPlan Digital OS
            </div>
            <h1 className="max-w-4xl text-[44px] font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Research, build, package, and ship digital products from one command center.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/58 sm:text-lg">
              CraftPlan turns market signals into sellable product systems for creators, agencies, and digital builders:
              spreadsheets, Notion workspaces, PDF planners, wall art, pattern products, and listing assets.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/research"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(241,100,30,0.28)] transition hover:bg-orange-400"
              >
                Start with research
                <ProductIcon name="arrow" className="h-4 w-4" />
              </Link>
              <Link
                href="/factory"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:border-white/22 hover:bg-white/[0.07]"
              >
                Open Product Factory
                <ProductIcon name="factory" className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Products built", value: totalBuilt.toString() },
                { label: "Ready to list", value: readyCount.toString() },
                { label: "Live listings", value: listedCount.toString() },
                { label: "Avg QA score", value: avgQuality ? `${avgQuality}%` : "New" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <p className="text-2xl font-semibold text-white">{metric.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/38">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.10] bg-[#17130f]/92 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.35)]">
            <div className="rounded-[18px] border border-white/[0.08] bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Live workflow</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Build Pipeline</h2>
                </div>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                  {settings.notionToken ? "Integrations on" : "Setup needed"}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {workflow.map((step, index) => (
                  <Link
                    key={step.title}
                    href={step.href}
                    className="group grid grid-cols-[38px_minmax(0,1fr)_28px] items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 transition hover:border-orange-300/30 hover:bg-orange-300/[0.045]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-orange-200">
                      <ProductIcon name={step.icon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/28">
                          0{index + 1}
                        </span>
                        <h3 className="truncate text-sm font-semibold text-white">{step.title}</h3>
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-white/45">{step.body}</p>
                    </div>
                    <ProductIcon name="arrow" className="h-4 w-4 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-orange-200" />
                  </Link>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#f7efe4] p-4 text-[#19130f]">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f5c4b]">Next best move</p>
                <p className="mt-2 text-sm font-semibold">
                  Use Research to choose the product family first, then let Product Factory build the asset package.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-200/70">Workspace modules</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">One system, multiple product lines.</h2>
            </div>
            <Link href="/settings" className="text-sm font-semibold text-orange-200 hover:text-orange-100">
              Configure integrations
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            {modules.map((module) => {
              const accent = accentClasses[module.accent];
              return (
                <Link
                  key={module.title}
                  href={module.href}
                  className={`group rounded-2xl border ${accent.border} ${accent.bg} ${accent.shadow} p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.065]`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accent.border} bg-black/20 ${accent.text}`}>
                      <ProductIcon name={module.icon} />
                    </div>
                    <ProductIcon name="arrow" className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
                  </div>
                  <p className={`mt-5 text-[11px] font-bold uppercase tracking-[0.18em] ${accent.text}`}>{module.eyebrow}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{module.title}</h3>
                  <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/52">{module.description}</p>
                  <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/18 px-3 py-2 text-xs font-medium text-white/54">
                    {module.stat}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 pb-9 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Product lanes</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Built for creators who ship more than one format.</h2>
              </div>
              <Link href="/catalog" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-200 hover:text-orange-100">
                View catalog
                <ProductIcon name="arrow" className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {productLanes.map((lane) => (
                <Link
                  key={lane.title}
                  href={lane.href}
                  className="rounded-2xl border border-white/[0.08] bg-black/18 p-4 transition hover:border-white/[0.18] hover:bg-white/[0.045]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold text-white">{lane.title}</h3>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">
                      {lane.signal}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/50">{lane.description}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#f8f0e5] p-5 text-[#19130f]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#806a55]">Operations snapshot</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Keep the business loop visible.</h2>
            <div className="mt-5 space-y-3">
              {[
                { label: "Drafts needing polish", value: draftCount },
                { label: "Ready for review", value: readyCount },
                { label: "Listed products", value: listedCount },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-[#1b130e]/10 bg-white/55 px-4 py-3">
                  <span className="text-sm font-medium text-[#5e4d3e]">{item.label}</span>
                  <span className="text-xl font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-[#1b130e]/10 bg-[#1b130e] p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/80">Product mix</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {productMix.map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <p className="text-lg font-semibold">{item.count}</p>
                    <p className="text-[11px] text-white/45">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Launch checklist</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Production-ready means every asset has a job.</h2>
            <div className="mt-5 space-y-3">
              {[
                "Demand evidence saved from Research",
                "Product file generated and QA checked",
                "Mockups, thumbnails, and listing video prepared",
                "SEO title, tags, price, and delivery package reviewed",
              ].map((task) => (
                <div key={task} className="flex gap-3 rounded-xl border border-white/[0.08] bg-black/18 p-3">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/14 text-emerald-200">
                    <ProductIcon name="check" className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm leading-6 text-white/56">{task}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Recent output</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">What the studio has produced.</h2>
              </div>
              <Link href="/catalog" className="hidden text-sm font-semibold text-orange-200 hover:text-orange-100 sm:inline-flex">
                Open catalog
              </Link>
            </div>

            {recentItems.length ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08]">
                {recentItems.map((item) => (
                  <div key={item.id} className="grid gap-3 border-b border-white/[0.07] bg-black/16 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_130px_110px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{item.templateName}</p>
                      <p className="mt-1 text-xs text-white/38">
                        {item.productType.toUpperCase()} / {item.variantName || item.templateType || "Product"}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-white/44">
                      {formatStatusLabel(item.status)}
                    </span>
                    <span className="text-left text-sm font-semibold text-white/70 sm:text-right">
                      {item.qualityScore?.overall ? `${item.qualityScore.overall}% QA` : "Unscored"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/[0.12] bg-black/14 p-6">
                <ProductIcon name="template" className="h-8 w-8 text-orange-200/70" />
                <h3 className="mt-4 text-lg font-semibold text-white">No catalog items yet.</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/48">
                  Start in Research, choose a validated opportunity, then build the first product package in Product Factory.
                </p>
                <Link
                  href="/research"
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-400"
                >
                  Find an opportunity
                  <ProductIcon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
