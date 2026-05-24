"use client";

import type { AutoPipelineItem, PipelineItemStatus } from "@/lib/auto-pipeline-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

type AutoPipelineJobView = {
  id: string;
  status: JobStatus;
  style: string | null;
  requestedCount: number;
  items: AutoPipelineItem[];
  costUsdSpent: number;
  currentStage: string | null;
  cancelRequested: boolean;
  error: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
};

type PipelineStyle = {
  id: string;
  label: string;
  detail: string;
  signal: string;
};

type ApiResult<T> = T & {
  error?: string;
};

const PRODUCT_STYLES: PipelineStyle[] = [
  {
    id: "bestseller",
    label: "Bestseller scout",
    detail: "Trend-led ideas from high-performing pattern angles.",
    signal: "Market first",
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    detail: "Tall patterns that must get book, hand, and shelf mockups.",
    signal: "Giftable",
  },
  {
    id: "folk",
    label: "Folk art",
    detail: "Heritage florals, samplers, ornaments, and cozy decor.",
    signal: "Evergreen",
  },
  {
    id: "funny",
    label: "Funny niche",
    detail: "Safe humor and giftable designs without risky themes.",
    signal: "Impulse buy",
  },
  {
    id: "all",
    label: "Mixed batch",
    detail: "A broad run for discovering which ideas survive production.",
    signal: "Explore",
  },
];

const STAGE_LABELS: Record<string, { label: string; detail: string }> = {
  ideas: { label: "Finding ideas", detail: "Research signals are becoming product concepts." },
  "1A": { label: "Generating art", detail: "The source artwork is being created and flattened." },
  "1B": { label: "Building chart", detail: "Python convert is creating the stitch chart and DMC palette." },
  "1C": { label: "Bundling PDF", detail: "Printable chart bundle is being assembled." },
  "2A": { label: "Creating mockups", detail: "Listing images are being rendered." },
  "2B": { label: "Rendering video", detail: "A short listing video is being prepared." },
  "3": { label: "Writing listing", detail: "SEO title, tags, description, and attributes are being generated." },
};

const STATUS_COPY: Record<PipelineItemStatus, { label: string; tone: string; order: number }> = {
  queued: { label: "Queued", tone: "border-white/12 bg-white/[0.05] text-white/58", order: 0 },
  generating: { label: "Generating", tone: "border-sky-300/30 bg-sky-300/10 text-sky-100", order: 1 },
  converting: { label: "Charting", tone: "border-violet-300/30 bg-violet-300/10 text-violet-100", order: 2 },
  exporting: { label: "Bundling", tone: "border-amber-300/30 bg-amber-300/10 text-amber-100", order: 3 },
  mocking: { label: "Mockups", tone: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100", order: 4 },
  videoing: { label: "Video", tone: "border-blue-300/30 bg-blue-300/10 text-blue-100", order: 5 },
  writing: { label: "Copy", tone: "border-orange-300/30 bg-orange-300/10 text-orange-100", order: 6 },
  done: { label: "Package ready", tone: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100", order: 7 },
  publishing: { label: "Publishing", tone: "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100", order: 8 },
  failed: { label: "Needs fix", tone: "border-red-300/30 bg-red-300/10 text-red-100", order: 9 },
};

const READINESS_ITEMS = [
  { key: "hasImage", label: "Design" },
  { key: "patternFull", label: "Chart" },
  { key: "hasPdf", label: "PDF" },
  { key: "mockups", label: "Mockups" },
  { key: "hasVideo", label: "Video" },
  { key: "listingCopy", label: "Copy" },
] as const;

const AIDA_SENTINEL = "AIDA";

type PatternFull = NonNullable<AutoPipelineItem["patternFull"]>;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function money(value: number | undefined) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function timeAgo(value?: number | null) {
  if (!value) return "not started";
  const seconds = Math.max(1, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function stageInfo(stage: string | null | undefined, status: JobStatus | undefined) {
  if (status === "completed") return { label: "Completed", detail: "The batch finished and is ready for review." };
  if (status === "failed") return { label: "Failed", detail: "The run stopped. Open the failed item for the error." };
  if (status === "cancelled") return { label: "Cancelled", detail: "This run was stopped." };
  return STAGE_LABELS[stage ?? ""] ?? { label: "Standing by", detail: "Start a batch to create pattern products." };
}

function statusPercent(status: PipelineItemStatus) {
  const info = STATUS_COPY[status] ?? STATUS_COPY.queued;
  return Math.round((info.order / 8) * 100);
}

function safeImageSrc(src: string | undefined) {
  if (!src) return "";
  if (src.startsWith("data:image/")) return src;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("/")) return src;
  return "";
}

function normalizeGridValue(dmc: string | undefined | null): string {
  return typeof dmc === "string" ? dmc.trim() : "";
}

function isBackgroundCell(dmc: string | undefined | null, backgroundDmc?: string | null): boolean {
  const value = normalizeGridValue(dmc);
  const bg = normalizeGridValue(backgroundDmc);
  return !value || value === AIDA_SENTINEL || (!!bg && value === bg);
}

function hasFullChart(pattern: AutoPipelineItem["patternFull"] | undefined): pattern is PatternFull {
  return !!pattern && pattern.grid.length > 0 && pattern.colors.length > 0;
}

function itemReadiness(item: AutoPipelineItem | undefined) {
  if (!item) return 0;
  let count = 0;
  if (item.hasImage || safeImageSrc(item.imageUrl)) count += 1;
  if (item.patternFull || item.patternStats) count += 1;
  if (item.hasPdf || item.pdfBundleB64) count += 1;
  if ((item.mockups ?? []).some((mockup) => mockup.hasDataUrl || safeImageSrc(mockup.dataUrl))) count += 1;
  if (item.hasVideo || item.videoB64) count += 1;
  if (item.listingCopy?.title && (item.listingCopy.tags?.length ?? 0) > 0) count += 1;
  return Math.round((count / READINESS_ITEMS.length) * 100);
}

function hasMockups(item: AutoPipelineItem | undefined) {
  return !!item?.mockups?.some((mockup) => mockup.hasDataUrl || safeImageSrc(mockup.dataUrl));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: ApiResult<T>;
  try {
    data = text ? (JSON.parse(text) as ApiResult<T>) : ({} as ApiResult<T>);
  } catch {
    throw new Error(`Server returned invalid JSON from ${url}`);
  }
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    play: "M8 5v14l11-7L8 5z",
    pause: "M8 5h3v14H8V5zm5 0h3v14h-3V5z",
    refresh: "M20 11a8 8 0 10-2.34 5.66M20 11V5m0 6h-6",
    search: "M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z",
    package: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
    image: "M4 5h16v14H4V5zm3 11l4-4 3 3 2-2 3 3M8 9h.01",
    file: "M7 3h7l5 5v13H7V3zm7 0v6h5M10 13h6M10 17h6",
    check: "M20 6L9 17l-5-5",
    x: "M6 6l12 12M18 6L6 18",
    clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
    eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
    shield: "M12 3l7 3v5c0 4.5-2.9 8.4-7 10-4.1-1.6-7-5.5-7-10V6l7-3z",
    spark: "M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z",
  };

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name] || paths.spark} />
    </svg>
  );
}

function StatusPill({ status }: { status: PipelineItemStatus }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.queued;
  return (
    <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", copy.tone)}>
      {copy.label}
    </span>
  );
}

function ReadinessPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        ready
          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          : "border-white/10 bg-white/[0.04] text-white/38",
      )}
    >
      <Icon name={ready ? "check" : "clock"} className="h-3 w-3" />
      {label}
    </span>
  );
}

function EmptyPatternPreview() {
  const cells = useMemo(
    () =>
      Array.from({ length: 192 }, (_, index) => {
        const x = index % 16;
        const y = Math.floor(index / 16);
        const border = x === 0 || y === 0 || x === 15 || y === 11;
        const floral = (x + y) % 7 === 0 || (x > 5 && x < 10 && y > 3 && y < 8);
        if (border) return "#d8c6ac";
        if (floral) return ["#28533d", "#bd9041", "#c66f61", "#8a9f71"][(x + y) % 4];
        return "#fbf4e8";
      }),
    [],
  );

  return (
    <div className="relative mx-auto flex aspect-[4/3] w-full max-w-[520px] items-center justify-center rounded-[22px] border border-[#d9c7aa]/30 bg-[#201914] p-6 shadow-[0_24px_80px_rgba(0,0,0,.34)]">
      <div className="absolute inset-0 rounded-[22px] opacity-25" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }} />
      <div className="relative w-[78%] rounded-[18px] border border-[#d9c7aa] bg-[#fbf4e8] p-3">
        <div className="grid gap-[1px] rounded-[12px] bg-[#d9c7aa] p-[1px]" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
          {cells.map((color, index) => (
            <span key={index} className="aspect-square" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConvertedChartPreview({ pattern }: { pattern: AutoPipelineItem["patternFull"] | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showSymbols, setShowSymbols] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [stats, setStats] = useState({ rendered: 0, missing: 0, skipped: 0 });

  useEffect(() => {
    if (!hasFullChart(pattern)) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = pattern.width || pattern.grid[0]?.length || 0;
    const height = pattern.height || pattern.grid.length || 0;
    if (!width || !height) return;

    const maxDim = Math.max(width, height);
    const cellSize = Math.max(7, Math.min(14, Math.floor(1350 / maxDim)));
    const rulerPad = Math.max(28, Math.round(cellSize * 2.8));
    const chartWidth = width * cellSize + rulerPad * 2;
    const chartHeight = height * cellSize + rulerPad * 2;

    canvas.width = chartWidth;
    canvas.height = chartHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, chartWidth, chartHeight);

    const colorMap = new Map(pattern.colors.map((color) => [color.dmc, color]));
    let rendered = 0;
    let missing = 0;
    let skipped = 0;

    for (let y = 0; y < height; y += 1) {
      const row = pattern.grid[y] ?? [];
      for (let x = 0; x < width; x += 1) {
        const dmc = normalizeGridValue(row[x]);
        if (isBackgroundCell(dmc, pattern.backgroundDmc)) {
          skipped += 1;
          continue;
        }
        const color = colorMap.get(dmc);
        if (!color) {
          missing += 1;
          continue;
        }

        const sx = rulerPad + x * cellSize;
        const sy = rulerPad + y * cellSize;
        ctx.fillStyle = color.hex || "#888888";
        ctx.fillRect(sx, sy, cellSize, cellSize);
        rendered += 1;

        if (showSymbols && color.symbol && cellSize >= 8) {
          const hex = (color.hex || "#888888").replace("#", "");
          const r = parseInt(hex.slice(0, 2), 16) || 0;
          const g = parseInt(hex.slice(2, 4), 16) || 0;
          const b = parseInt(hex.slice(4, 6), 16) || 0;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          ctx.fillStyle = luminance < 140 ? "#ffffff" : "#171717";
          ctx.font = `${Math.round(cellSize * 0.66)}px Menlo, Monaco, Consolas, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(color.symbol, sx + cellSize / 2, sy + cellSize / 2 + 0.5);
        }
      }
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= width; x += 1) {
        const px = rulerPad + x * cellSize + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, rulerPad);
        ctx.lineTo(px, rulerPad + height * cellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 1) {
        const py = rulerPad + y * cellSize + 0.5;
        ctx.beginPath();
        ctx.moveTo(rulerPad, py);
        ctx.lineTo(rulerPad + width * cellSize, py);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 1.4;
      for (let x = 0; x <= width; x += 10) {
        const px = rulerPad + x * cellSize + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, rulerPad);
        ctx.lineTo(px, rulerPad + height * cellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 10) {
        const py = rulerPad + y * cellSize + 0.5;
        ctx.beginPath();
        ctx.moveTo(rulerPad, py);
        ctx.lineTo(rulerPad + width * cellSize, py);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#111111";
    ctx.font = "12px Menlo, Monaco, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 10; x <= width; x += 10) {
      const px = rulerPad + x * cellSize;
      ctx.fillText(String(x), px, rulerPad / 2);
      ctx.fillText(String(x), px, rulerPad + height * cellSize + rulerPad / 2);
    }
    ctx.textAlign = "right";
    for (let y = 10; y <= height; y += 10) {
      const py = rulerPad + y * cellSize;
      ctx.fillText(String(y), rulerPad - 7, py);
    }
    ctx.textAlign = "left";
    for (let y = 10; y <= height; y += 10) {
      const py = rulerPad + y * cellSize;
      ctx.fillText(String(y), rulerPad + width * cellSize + 7, py);
    }

    setStats({ rendered, missing, skipped });
  }, [pattern, showGrid, showSymbols]);

  if (!pattern) {
    return (
      <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-5 text-[13px] leading-6 text-white/48">
        The chart has not been created yet. Wait until the item reaches the chart/PDF stages.
      </div>
    );
  }

  if (!hasFullChart(pattern)) {
    return (
      <div className="rounded-[16px] border border-amber-300/20 bg-amber-300/10 p-5 text-[13px] leading-6 text-amber-50/78">
        Chart stats are available, but the full grid is not loaded in this safe view. Click "Load full package assets" to inspect the converted chart.
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setShowSymbols((value) => !value)}
            className={classNames(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold",
              showSymbols ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.05] text-white/50",
            )}
          >
            Symbols {showSymbols ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((value) => !value)}
            className={classNames(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold",
              showGrid ? "border-sky-300/25 bg-sky-300/10 text-sky-100" : "border-white/10 bg-white/[0.05] text-white/50",
            )}
          >
            Grid {showGrid ? "on" : "off"}
          </button>
        </div>
        <p className="text-[11px] text-white/40">
          {stats.rendered.toLocaleString()} stitches / {stats.skipped.toLocaleString()} background
          {stats.missing > 0 ? ` / ${stats.missing} missing` : ""}
        </p>
      </div>
      <div className="max-h-[540px] overflow-auto rounded-[14px] border border-black/30 bg-white p-3">
        <canvas ref={canvasRef} className="block max-w-none rounded-[8px]" />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-white/40">
        This is the actual converted DMC chart grid from Python convert, not the marketing mockup.
      </p>
    </div>
  );
}

function JobMetrics({ job }: { job: AutoPipelineJobView | null }) {
  const metrics = useMemo(() => {
    const items = job?.items ?? [];
    const ready = items.filter((item) => item.status === "done").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const mockups = items.filter((item) => hasMockups(item)).length;
    const copy = items.filter((item) => item.listingCopy?.title).length;
    return { ready, failed, mockups, copy, total: items.length };
  }, [job]);

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {[
        { label: "Items", value: metrics.total || job?.requestedCount || 0, hint: "batch size" },
        { label: "Ready", value: metrics.ready, hint: "completed packages" },
        { label: "Mockups", value: metrics.mockups, hint: "review assets" },
        { label: "Cost", value: money(job?.costUsdSpent), hint: metrics.failed ? `${metrics.failed} failed` : "live spend" },
      ].map((metric) => (
        <div key={metric.label} className="rounded-[16px] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
          <p className="mt-1 text-[11px] text-white/38">{metric.hint}</p>
        </div>
      ))}
    </div>
  );
}

function QueueItemCard({
  item,
  selected,
  onInspect,
  onRetryCopy,
  retrying,
}: {
  item: AutoPipelineItem;
  selected: boolean;
  onInspect: () => void;
  onRetryCopy: () => void;
  retrying: boolean;
}) {
  const readiness = itemReadiness(item);
  const src = safeImageSrc(item.imageUrl || item.cleanImageUrl);

  return (
    <article
      className={classNames(
        "rounded-[18px] border p-4 transition",
        selected
          ? "border-orange-300/55 bg-orange-300/[0.08] shadow-[0_18px_60px_rgba(241,100,30,.13)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20",
      )}
    >
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onInspect}
          className="relative h-24 w-24 flex-none overflow-hidden rounded-[14px] border border-white/10 bg-[#17120f] text-left"
          aria-label={`Inspect ${item.title}`}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/28">
              <Icon name="image" className="h-7 w-7" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 text-white">{item.title}</h3>
              <p className="mt-1 text-[11px] text-white/38">Updated {timeAgo(item.completedAt || item.startedAt)}</p>
            </div>
            <StatusPill status={item.status} />
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={classNames(
                "h-full rounded-full",
                item.status === "failed" ? "bg-red-300" : "bg-gradient-to-r from-orange-400 via-amber-200 to-emerald-300",
              )}
              style={{ width: item.status === "failed" ? "100%" : percent(Math.max(readiness, statusPercent(item.status))) }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <ReadinessPill label="gen" ready={!!(item.hasImage || src)} />
            <ReadinessPill label="chart" ready={!!(item.patternFull || item.patternStats)} />
            <ReadinessPill label="pdf" ready={!!(item.hasPdf || item.pdfBundleB64)} />
            <ReadinessPill label="mocks" ready={hasMockups(item)} />
            <ReadinessPill label="video" ready={!!(item.hasVideo || item.videoB64)} />
            <ReadinessPill label="copy" ready={!!item.listingCopy?.title} />
          </div>

          {item.error && (
            <p className="mt-3 rounded-[12px] border border-red-300/20 bg-red-300/10 px-3 py-2 text-[12px] leading-5 text-red-100">
              {item.error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onInspect}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-white hover:border-white/24 hover:bg-white/[0.09]"
            >
              <Icon name="eye" className="h-3.5 w-3.5" />
              Inspect package
            </button>
            {!item.listingCopy?.title && (
              <button
                type="button"
                onClick={onRetryCopy}
                disabled={retrying}
                className="inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-2 text-[12px] font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {retrying ? "Writing..." : "Retry copy"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function MockupGrid({ item }: { item: AutoPipelineItem | undefined }) {
  const mockups = item?.mockups ?? [];
  if (!mockups.length) {
    return (
      <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-5 text-[13px] leading-6 text-white/48">
        Mockups are not loaded yet. Slim polling only shows whether mockups exist. Click inspect after they are ready to fetch the full item safely.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {mockups.map((mockup, index) => {
        const src = safeImageSrc(mockup.dataUrl);
        return (
          <div key={`${mockup.scene}-${index}`} className="overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.04]">
            <div className="aspect-[4/3] bg-[#17120f]">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={mockup.scene || "mockup"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-white/34">
                  {mockup.hasDataUrl ? "Open package to load this image" : "No image data"}
                </div>
              )}
            </div>
            <p className="truncate px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white/46">{mockup.scene || "Mockup"}</p>
          </div>
        );
      })}
    </div>
  );
}

function Inspector({
  job,
  selectedItem,
  fullItem,
  loadingFull,
  loadFull,
}: {
  job: AutoPipelineJobView | null;
  selectedItem: AutoPipelineItem | null;
  fullItem: AutoPipelineItem | null;
  loadingFull: boolean;
  loadFull: () => void;
}) {
  const item = fullItem || selectedItem;
  const readiness = itemReadiness(item ?? undefined);
  const sourceSrc = safeImageSrc(item?.imageUrl || item?.cleanImageUrl);

  if (!job) {
    return (
      <aside className="rounded-[24px] border border-white/10 bg-[#0d131b]/92 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Inspector</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">No active batch</h2>
        <p className="mt-3 text-[13px] leading-6 text-white/52">
          Start a new run from the left. This panel will show the selected pattern package, mockups, chart stats, and listing copy.
        </p>
        <div className="mt-6">
          <EmptyPatternPreview />
        </div>
      </aside>
    );
  }

  if (!item) {
    return (
      <aside className="rounded-[24px] border border-white/10 bg-[#0d131b]/92 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Inspector</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">Select an item</h2>
        <p className="mt-3 text-[13px] leading-6 text-white/52">
          Choose a product from the queue to inspect its assets. Heavy mockup data loads only for the item you open.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-[24px] border border-white/10 bg-[#0d131b]/92 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Package inspector</p>
          <h2 className="mt-3 line-clamp-3 text-2xl font-semibold leading-tight text-white">{item.title}</h2>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between text-[12px] text-white/52">
          <span>Readiness</span>
          <span>{readiness}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 via-amber-200 to-emerald-300" style={{ width: percent(readiness) }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ReadinessPill label="design" ready={!!(item.hasImage || sourceSrc)} />
          <ReadinessPill label="chart" ready={!!(item.patternFull || item.patternStats)} />
          <ReadinessPill label="pdf" ready={!!(item.hasPdf || item.pdfBundleB64)} />
          <ReadinessPill label="mockups" ready={hasMockups(item)} />
          <ReadinessPill label="video" ready={!!(item.hasVideo || item.videoB64)} />
          <ReadinessPill label="copy" ready={!!item.listingCopy?.title} />
        </div>
      </div>

      {!fullItem && (
        <button
          type="button"
          onClick={loadFull}
          disabled={loadingFull}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[13px] font-semibold text-[#111820] shadow-[0_16px_44px_rgba(255,255,255,.12)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name={loadingFull ? "refresh" : "package"} className="h-4 w-4" />
          {loadingFull ? "Loading package..." : "Load full package assets"}
        </button>
      )}

      {sourceSrc && (
        <div className="mt-5 overflow-hidden rounded-[18px] border border-white/10 bg-[#17120f]">
          <div className="aspect-[4/3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceSrc} alt="" className="h-full w-full object-contain" />
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/58">Converted chart</h3>
          <span className="text-[11px] text-white/34">
            {item.patternStats ? `${item.patternStats.width} x ${item.patternStats.height}` : item.patternFull ? `${item.patternFull.width} x ${item.patternFull.height}` : "pending"}
          </span>
        </div>
        <ConvertedChartPreview pattern={item.patternFull} />
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/58">Mockups</h3>
          <span className="text-[11px] text-white/34">{item.mockups?.length ?? 0} scenes</span>
        </div>
        <MockupGrid item={item} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/34">Grid</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {item.patternStats ? `${item.patternStats.width} x ${item.patternStats.height}` : item.patternFull ? `${item.patternFull.width} x ${item.patternFull.height}` : "pending"}
          </p>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/34">Colors</p>
          <p className="mt-2 text-lg font-semibold text-white">{item.patternStats?.colors ?? item.patternFull?.colors?.length ?? "pending"}</p>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/34">Stitches</p>
          <p className="mt-2 text-lg font-semibold text-white">{item.patternStats?.totalStitches ?? item.patternFull?.totalStitches ?? "pending"}</p>
        </div>
      </div>

      {item.listingCopy && (
        <div className="mt-6 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/58">Listing copy</h3>
          <p className="mt-3 text-[15px] font-semibold leading-5 text-white">{item.listingCopy.title}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(item.listingCopy.tags ?? []).slice(0, 13).map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/54">
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-4 max-h-40 overflow-auto pr-1 text-[12px] leading-6 text-white/48">
            {item.listingCopy.description}
          </p>
        </div>
      )}

      {item.error && (
        <div className="mt-6 rounded-[18px] border border-red-300/20 bg-red-300/10 p-4 text-[13px] leading-6 text-red-100">
          {item.error}
        </div>
      )}
    </aside>
  );
}

export default function StitchAtelierPage() {
  const [job, setJob] = useState<AutoPipelineJobView | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [fullItems, setFullItems] = useState<Record<string, AutoPipelineItem>>({});
  const [style, setStyle] = useState("bestseller");
  const [count, setCount] = useState(3);
  const [starting, setStarting] = useState(false);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingFullId, setLoadingFullId] = useState<string | null>(null);
  const [retryingCopyId, setRetryingCopyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const selectedItem = useMemo(() => {
    if (!job || !selectedItemId) return null;
    return job.items.find((item) => String(item.id) === selectedItemId) ?? null;
  }, [job, selectedItemId]);

  const fullItem = selectedItemId ? fullItems[selectedItemId] ?? null : null;
  const currentStage = stageInfo(job?.currentStage, job?.status);
  const running = job?.status === "queued" || job?.status === "running";
  const completed = job?.status === "completed";

  const completedCount = useMemo(() => job?.items.filter((item) => item.status === "done").length ?? 0, [job]);
  const progress = job?.items.length ? (completedCount / job.items.length) * 100 : 0;

  const mergeJob = useCallback((nextJob: AutoPipelineJobView | null) => {
    setJob(nextJob);
    if (nextJob?.items?.length) {
      setSelectedItemId((current) => current ?? String(nextJob.items[0].id));
    }
  }, []);

  const loadJob = useCallback(async (jobId: string, options?: { silent?: boolean }) => {
    try {
      const data = await fetchJson<{ job: AutoPipelineJobView }>(`/api/cross-stitch/pipeline/${jobId}`);
      mergeJob(data.job);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!options?.silent) setError(message);
    }
  }, [mergeJob]);

  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const data = await fetchJson<{ job: AutoPipelineJobView | null }>("/api/cross-stitch/pipeline/active");
      mergeJob(data.job);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingActive(false);
    }
  }, [mergeJob]);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!job?.id || !running) return undefined;
    pollRef.current = window.setInterval(() => {
      void loadJob(job.id, { silent: true });
    }, 3500);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.id, running, loadJob]);

  const startRun = useCallback(async () => {
    setStarting(true);
    setError(null);
    setSelectedItemId(null);
    setFullItems({});
    try {
      const data = await fetchJson<{ jobId: string; status: JobStatus; requestedCount: number; style: string | null; startedAt: number }>(
        "/api/cross-stitch/pipeline/start",
        {
          method: "POST",
          body: JSON.stringify({ count, style }),
        },
      );
      const startedJob: AutoPipelineJobView = {
        id: data.jobId,
        status: data.status,
        style: data.style,
        requestedCount: data.requestedCount,
        items: [],
        costUsdSpent: 0,
        currentStage: "ideas",
        cancelRequested: false,
        error: null,
        startedAt: data.startedAt,
        updatedAt: data.startedAt,
        completedAt: null,
      };
      mergeJob(startedJob);
      window.setTimeout(() => void loadJob(data.jobId, { silent: true }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [count, style, loadJob, mergeJob]);

  const cancelRun = useCallback(async () => {
    if (!job?.id) return;
    try {
      await fetchJson<{ cancelRequested: boolean }>(`/api/cross-stitch/pipeline/${job.id}`, { method: "DELETE" });
      await loadJob(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [job?.id, loadJob]);

  const clearJob = useCallback(async () => {
    if (!job?.id) return;
    try {
      await fetchJson<{ deleted: boolean }>(`/api/cross-stitch/pipeline/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ delete: true }),
      });
      setJob(null);
      setSelectedItemId(null);
      setFullItems({});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [job?.id]);

  const loadFullItem = useCallback(async (itemId?: string) => {
    const id = itemId ?? selectedItemId;
    if (!job?.id || !id) return;
    setLoadingFullId(id);
    try {
      const data = await fetchJson<{ item: AutoPipelineItem }>(`/api/cross-stitch/pipeline/${job.id}?item=${encodeURIComponent(id)}&full=true`);
      setFullItems((current) => ({ ...current, [id]: data.item }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFullId(null);
    }
  }, [job?.id, selectedItemId]);

  const retryCopy = useCallback(async (itemId: string) => {
    if (!job?.id) return;
    setRetryingCopyId(itemId);
    try {
      await fetchJson<{ ok: boolean }>(`/api/cross-stitch/pipeline/${job.id}/retry-copy`, {
        method: "POST",
        body: JSON.stringify({ itemId }),
      });
      await loadJob(job.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingCopyId(null);
    }
  }, [job?.id, loadJob]);

  const inspectItem = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    if (!fullItems[itemId]) {
      void loadFullItem(itemId);
    }
  }, [fullItems, loadFullItem]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#090d14] text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px), radial-gradient(circle at 10% 5%, rgba(88,166,255,.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(46,229,157,.11), transparent 28%), radial-gradient(circle at 35% 100%, rgba(241,100,30,.12), transparent 32%)",
          backgroundSize: "44px 44px, 44px 44px, auto, auto, auto",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/10 bg-[#0d131b]/88 p-5 shadow-[0_30px_120px_rgba(0,0,0,.38)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                New stitch system
              </div>
              <h1 className="mt-5 text-[40px] font-semibold leading-[0.98] tracking-tight text-white sm:text-[64px]">
                Pattern product workbench.
              </h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-7 text-white/54">
                A cleaner production surface for cross-stitch batches. It starts real pipeline jobs, tracks every product,
                and opens one full package at a time so the browser stays stable.
              </p>
            </div>

            <div className="min-w-[280px] rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">Current run</p>
                  <p className="mt-2 text-[15px] font-semibold text-white">{job ? job.id : "No job loaded"}</p>
                </div>
                <span
                  className={classNames(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                    running
                      ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
                      : completed
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-white/10 bg-white/[0.04] text-white/42",
                  )}
                >
                  {job?.status ?? "idle"}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 via-amber-200 to-emerald-300" style={{ width: percent(progress) }} />
              </div>
              <p className="mt-3 text-[12px] leading-5 text-white/48">
                {currentStage.label}: {currentStage.detail}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(560px,1fr)_440px]">
          <aside className="rounded-[24px] border border-white/10 bg-[#0d131b]/92 p-5">
            <div className="flex items-center gap-2 text-orange-100">
              <Icon name="search" className="h-4 w-4" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em]">Run control</p>
            </div>

            <div className="mt-5 space-y-3">
              {PRODUCT_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStyle(option.id)}
                  className={classNames(
                    "w-full rounded-[16px] border p-4 text-left transition",
                    style === option.id
                      ? "border-orange-300/50 bg-orange-300/10 shadow-[0_16px_48px_rgba(241,100,30,.12)]"
                      : "border-white/10 bg-white/[0.04] hover:border-white/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-white">{option.label}</p>
                      <p className="mt-1 text-[12px] leading-5 text-white/44">{option.detail}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/42">
                      {option.signal}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
              <label className="flex items-center justify-between gap-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                Batch size
                <span className="text-[14px] text-white">{count}</span>
              </label>
              <input
                type="range"
                min={1}
                max={8}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="mt-4 w-full accent-[#f1641e]"
              />
              <div className="mt-2 flex justify-between text-[11px] text-white/30">
                <span>1</span>
                <span>8</span>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={startRun}
                disabled={starting || running}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#f1641e] px-4 py-3 text-[13px] font-semibold text-white shadow-[0_18px_54px_rgba(241,100,30,.28)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Icon name={starting ? "refresh" : "play"} className="h-4 w-4" />
                {starting ? "Starting..." : running ? "Run in progress" : "Start production run"}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => job?.id && loadJob(job.id)}
                  disabled={!job?.id}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-3 py-2.5 text-[12px] font-semibold text-white/66 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={running ? cancelRun : clearJob}
                  disabled={!job?.id}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-3 py-2.5 text-[12px] font-semibold text-white/66 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name={running ? "pause" : "x"} className="h-3.5 w-3.5" />
                  {running ? "Cancel" : "Clear"}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[18px] border border-emerald-300/15 bg-emerald-300/[0.07] p-4">
              <div className="flex items-start gap-3">
                <Icon name="shield" className="mt-0.5 h-4 w-4 text-emerald-200" />
                <p className="text-[12px] leading-6 text-emerald-50/76">
                  This page does not auto-list to Etsy. It prepares and reviews packages first, keeping live publish separate.
                </p>
              </div>
            </div>
          </aside>

          <section className="rounded-[24px] border border-white/10 bg-[#0d131b]/92 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Production queue</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Live batch state</h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/48">
                  Progress stays slim while the job runs. Open one item to pull the full mockups and listing data from the server.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/48">
                {loadingActive ? "Loading latest job..." : `${currentStage.label} / ${money(job?.costUsdSpent)}`}
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-[16px] border border-red-300/20 bg-red-300/10 p-4 text-[13px] leading-6 text-red-100">
                {error}
              </div>
            )}

            <div className="mt-5">
              <JobMetrics job={job} />
            </div>

            <div className="mt-5 space-y-3">
              {!job && !loadingActive && (
                <div className="rounded-[22px] border border-dashed border-white/14 bg-white/[0.035] p-8">
                  <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-center">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-100/70">Ready when you are</p>
                      <h3 className="mt-3 text-2xl font-semibold text-white">Start with a small batch.</h3>
                      <p className="mt-3 max-w-xl text-[13px] leading-6 text-white/48">
                        Choose a product style on the left and start with 2 or 3 items. Once the run is stable, increase the batch size.
                      </p>
                    </div>
                    <EmptyPatternPreview />
                  </div>
                </div>
              )}

              {job?.items.length === 0 && (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-sky-300/20 bg-sky-300/10 text-sky-100">
                    <Icon name="refresh" className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">The run is warming up.</h3>
                  <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-white/48">
                    The server is fetching ideas first. Queue cards will appear here as soon as concepts are created.
                  </p>
                </div>
              )}

              {job?.items.map((item) => {
                const id = String(item.id);
                return (
                  <QueueItemCard
                    key={id}
                    item={item}
                    selected={selectedItemId === id}
                    onInspect={() => inspectItem(id)}
                    onRetryCopy={() => retryCopy(id)}
                    retrying={retryingCopyId === id}
                  />
                );
              })}
            </div>
          </section>

          <div className="xl:col-span-2 2xl:col-span-1">
            <Inspector
              job={job}
              selectedItem={selectedItem}
              fullItem={fullItem}
              loadingFull={!!selectedItemId && loadingFullId === selectedItemId}
              loadFull={() => void loadFullItem()}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
