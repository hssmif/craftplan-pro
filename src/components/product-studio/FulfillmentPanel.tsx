"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/stores/studioStore";

// ── Component ──

export function FulfillmentPanel() {
  const project = useStudioStore((s) => s.project);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);
  const saveProject = useStudioStore((s) => s.saveProject);

  const selectedDesigns = project.designs.filter((d) => d.selected);
  const enabledProducts = project.productConfigs.filter((p) => p.enabled);

  // Printful is the source of truth
  const printfulDone = project.printfulProducts.filter((p) => p.status === "done");
  const printfulPushed = project.printfulProducts.filter((p) => p.pushed);

  // Etsy listings are secondary
  const readyToFinish = project.etsyListings.filter((l) => l.status === "ready-to-finish");
  const finishing = project.etsyListings.filter((l) => l.status === "finishing");
  const draftListings = project.etsyListings.filter((l) => l.status === "draft");
  const activeListings = project.etsyListings.filter((l) => l.status === "active");
  const etsyFinished = [...draftListings, ...activeListings];

  // Revenue estimates
  const estimatedRevenue = project.listings.reduce((sum, l) => sum + l.price, 0);
  const avgBaseCost =
    enabledProducts.length > 0
      ? enabledProducts.reduce((sum, p) => {
          const avgVariantCost =
            p.variants.length > 0
              ? p.variants.reduce((s, v) => s + v.baseCost, 0) / p.variants.length
              : 10;
          return sum + avgVariantCost;
        }, 0) / enabledProducts.length
      : 10;
  const estimatedProfit = estimatedRevenue - avgBaseCost * project.listings.length;

  // Mark step done when we have results
  useEffect(() => {
    if (project.printfulProducts.length > 0) {
      setStepStatus("fulfillment", "done");
    }
  }, [project.printfulProducts.length, setStepStatus]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Fulfillment Dashboard</h2>
          <p className="text-sm text-white/40 mt-1">
            Project summary and listing status
          </p>
        </div>
        <button
          onClick={() => saveProject()}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save Project
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Designs"
          value={selectedDesigns.length.toString()}
          sublabel={`of ${project.designs.length} total`}
          color="indigo"
        />
        <StatCard
          label="Printful"
          value={printfulDone.length.toString()}
          sublabel={`${printfulPushed.length} pushed to Etsy`}
          color="violet"
        />
        <StatCard
          label="Etsy Finished"
          value={etsyFinished.length.toString()}
          sublabel={
            readyToFinish.length > 0
              ? `${readyToFinish.length} pending`
              : activeListings.length > 0
              ? `${activeListings.length} active`
              : "none yet"
          }
          color="emerald"
        />
        <StatCard
          label="Est. Revenue"
          value={`$${estimatedRevenue.toFixed(0)}`}
          sublabel={`~$${estimatedProfit.toFixed(0)} profit`}
          color="amber"
        />
      </div>

      {/* Pipeline Summary */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Pipeline Summary</h3>

        <div className="space-y-3">
          <PipelineRow
            icon="💡"
            label="Inspiration"
            detail={project.inspiration.keyword || "No keyword"}
            status="done"
          />
          <PipelineRow
            icon="🎨"
            label="Design Generation"
            detail={`${project.designs.length} designs (${project.designMode} mode)`}
            status={project.designs.length > 0 ? "done" : "idle"}
          />
          <PipelineRow
            icon="✅"
            label="Selection"
            detail={`${selectedDesigns.length} selected`}
            status={selectedDesigns.length > 0 ? "done" : "idle"}
          />
          <PipelineRow
            icon="👕"
            label="Products"
            detail={enabledProducts.map((p) => p.productName).join(", ") || "None"}
            status={enabledProducts.length > 0 ? "done" : "idle"}
          />
          <PipelineRow
            icon="🏷️"
            label="Listings"
            detail={`${project.listings.length} listings with SEO metadata`}
            status={project.listings.length > 0 ? "done" : "idle"}
          />
          <PipelineRow
            icon="🖨️"
            label="Printful"
            detail={`${printfulDone.length} products created, ${printfulPushed.length} pushed`}
            status={printfulDone.length > 0 ? "done" : "idle"}
          />
          <PipelineRow
            icon="✏️"
            label="Etsy Finish"
            detail={
              etsyFinished.length > 0
                ? `${etsyFinished.length} finished (${activeListings.length} active, ${draftListings.length} drafts)`
                : readyToFinish.length > 0
                ? `${readyToFinish.length} ready to finish`
                : finishing.length > 0
                ? `${finishing.length} in progress`
                : "Not started"
            }
            status={etsyFinished.length > 0 ? "done" : readyToFinish.length > 0 ? "idle" : "idle"}
          />
        </div>

        {/* Batch Progress Overview */}
        {project.printfulProducts.length > 1 && (
          <div className="pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Batch Progress</span>
              <span className="text-xs text-white/50">
                {printfulDone.length}/{project.printfulProducts.length} complete
              </span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
              {/* Done portion */}
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(printfulDone.length / project.printfulProducts.length) * 100}%` }}
              />
              {/* Error portion */}
              {project.printfulProducts.filter((p) => p.status === "error").length > 0 && (
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{
                    width: `${
                      (project.printfulProducts.filter((p) => p.status === "error").length /
                        project.printfulProducts.length) *
                      100
                    }%`,
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-emerald-400/60 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {printfulDone.length} done
              </span>
              {project.printfulProducts.filter((p) => p.status === "error").length > 0 && (
                <span className="text-[10px] text-red-400/60 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {project.printfulProducts.filter((p) => p.status === "error").length} failed
                </span>
              )}
              {readyToFinish.length > 0 && (
                <span className="text-[10px] text-orange-400/60 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                  {readyToFinish.length} awaiting Etsy finish
                </span>
              )}
              {etsyFinished.length > 0 && (
                <span className="text-[10px] text-amber-400/60 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  {etsyFinished.length} Etsy listings
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Printful Products (source of truth) */}
      {project.printfulProducts.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Printful Products</h3>
          <div className="space-y-2">
            {project.printfulProducts.map((product) => {
              const design = project.designs.find((d) => d.id === product.designId);
              const meta = project.listings.find((l) => l.designId === product.designId);
              const etsyListing = project.etsyListings.find((l) => l.designId === product.designId);

              return (
                <div
                  key={product.designId}
                  className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2"
                >
                  {/* Thumbnail */}
                  <div className="w-8 h-8 rounded bg-white/[0.06] flex-shrink-0 overflow-hidden">
                    {(design?.thumbnailUrl || design?.dataUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={design.thumbnailUrl || design.dataUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>

                  {/* Title */}
                  <p className="text-xs text-white/60 flex-1 truncate">
                    {meta?.title || design?.phrase || "Product"}
                  </p>

                  {/* Printful status */}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      product.status === "done"
                        ? "bg-purple-500/20 text-purple-400"
                        : product.status === "error"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-white/10 text-white/40"
                    }`}
                  >
                    {product.status === "done" ? "Printful ✓" : product.status}
                  </span>

                  {/* Pushed badge */}
                  {product.pushed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      Pushed
                    </span>
                  )}

                  {/* Etsy status */}
                  {etsyListing && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        etsyListing.status === "active"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : etsyListing.status === "draft"
                          ? "bg-amber-500/20 text-amber-400"
                          : etsyListing.status === "ready-to-finish"
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-white/10 text-white/40"
                      }`}
                    >
                      Etsy: {etsyListing.status === "ready-to-finish" ? "ready" : etsyListing.status}
                    </span>
                  )}

                  {/* Price */}
                  {meta?.price && (
                    <span className="text-xs text-emerald-400/80 tabular-nums">
                      ${meta.price.toFixed(2)}
                    </span>
                  )}

                  {/* Etsy link */}
                  {etsyListing?.listingUrl && (
                    <a
                      href={etsyListing.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:text-indigo-300"
                    >
                      View →
                    </a>
                  )}

                  {/* Error indicator */}
                  {(product.error || product.pushError) && (
                    <span className="text-[10px] text-red-400" title={product.error || product.pushError}>
                      ⚠
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {project.printfulProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 bg-white/[0.02] border border-dashed border-white/[0.08] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">No products published yet</p>
            <p className="text-xs text-white/30 mt-1 max-w-sm">
              Push your designs to Printful, then finish them on Etsy to see the fulfillment dashboard.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: "indigo" | "violet" | "emerald" | "amber";
}) {
  const colorMap = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-400",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400",
  };

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-4 ${colorMap[color]}`}
    >
      <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-[10px] text-white/30 mt-0.5">{sublabel}</p>
    </div>
  );
}

// ── Pipeline Row ──

function PipelineRow({
  icon,
  label,
  detail,
  status,
}: {
  icon: string;
  label: string;
  detail: string;
  status: "done" | "idle";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70 font-medium">{label}</span>
          {status === "done" && (
            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <p className="text-[10px] text-white/30 truncate">{detail}</p>
      </div>
    </div>
  );
}
