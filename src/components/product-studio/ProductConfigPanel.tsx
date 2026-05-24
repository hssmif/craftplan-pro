"use client";

import { useState, useEffect, useCallback } from "react";
import { useStudioStore } from "@/stores/studioStore";
import { POD_CATALOG, calculateRetailPrice } from "@/lib/printful-client";
import type { ProductConfig, ProductVariant } from "@/types/product-studio";
import { POD_TAXONOMY_IDS } from "@/types/product-studio";

// ── Category Tabs ──

const CATEGORIES = Object.entries(POD_CATALOG).map(([key, cat]) => ({
  id: key,
  label: cat.label,
  icon: cat.icon,
}));

// ── Component ──

export function ProductConfigPanel() {
  const project = useStudioStore((s) => s.project);
  const setProductConfigs = useStudioStore((s) => s.setProductConfigs);
  const toggleProductEnabled = useStudioStore((s) => s.toggleProductEnabled);
  const updateProductMarkup = useStudioStore((s) => s.updateProductMarkup);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);

  const [activeCategory, setActiveCategory] = useState("apparel");
  const [loadingVariants, setLoadingVariants] = useState<Record<number, boolean>>({});
  const [variantError, setVariantError] = useState<Record<number, string>>({});

  const selectedDesigns = project.designs.filter((d) => d.selected);

  // ── Initialize product configs from catalog ──
  useEffect(() => {
    if (project.productConfigs.length > 0) return; // Already initialized

    const configs: ProductConfig[] = [];
    for (const [category, catData] of Object.entries(POD_CATALOG)) {
      for (const item of catData.items) {
        configs.push({
          catalogProductId: item.productId,
          productName: item.name,
          category,
          icon: item.icon,
          enabled: item.productId === 71, // T-Shirt enabled by default
          markupPercent: 40,
          variants: [],
          retailPrice: 0,
          taxonomyId: POD_TAXONOMY_IDS[item.productId] || 482,
        });
      }
    }
    setProductConfigs(configs);
  }, [project.productConfigs.length, setProductConfigs]);

  // ── Update step status when products are enabled ──
  useEffect(() => {
    const hasEnabled = project.productConfigs.some((p) => p.enabled);
    if (hasEnabled) {
      setStepStatus("products", "done");
    } else {
      setStepStatus("products", "idle");
    }
  }, [project.productConfigs, setStepStatus]);

  // ── Load variants for a product ──
  const loadVariants = useCallback(
    async (productId: number, markupPercent: number) => {
      setLoadingVariants((prev) => ({ ...prev, [productId]: true }));
      setVariantError((prev) => ({ ...prev, [productId]: "" }));

      try {
        const resp = await fetch(`/api/printful/catalog?productId=${productId}`);
        if (!resp.ok) throw new Error("Failed to load variants");

        const data = await resp.json();
        const catalogVariants = data.variants || [];

        // Map to our ProductVariant type
        const variants: ProductVariant[] = catalogVariants.map(
          (v: { id: number; name: string; size: string; color: string; color_code: string; price: string; in_stock: boolean }) => ({
            variantId: v.id,
            size: v.size || v.name,
            color: v.color || "Default",
            colorCode: v.color_code || "#ffffff",
            baseCost: parseFloat(v.price) || 0,
            retailPrice: calculateRetailPrice(parseFloat(v.price) || 0, markupPercent),
            enabled: true,
          })
        );

        // Update the product config with loaded variants
        const updatedConfigs = project.productConfigs.map((p) =>
          p.catalogProductId === productId
            ? {
                ...p,
                variants,
                retailPrice: variants.length > 0 ? Math.max(...variants.map((v) => v.retailPrice)) : 0,
              }
            : p
        );
        setProductConfigs(updatedConfigs);
      } catch (err) {
        setVariantError((prev) => ({
          ...prev,
          [productId]: err instanceof Error ? err.message : "Failed to load",
        }));
      } finally {
        setLoadingVariants((prev) => ({ ...prev, [productId]: false }));
      }
    },
    [project.productConfigs, setProductConfigs]
  );

  // ── Auto-load variants for enabled products ──
  useEffect(() => {
    for (const config of project.productConfigs) {
      if (config.enabled && config.variants.length === 0 && !loadingVariants[config.catalogProductId]) {
        loadVariants(config.catalogProductId, config.markupPercent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.productConfigs.map((c) => `${c.catalogProductId}-${c.enabled}`).join(",")]);

  // ── Handle markup change ──
  const handleMarkupChange = useCallback(
    (productId: number, markup: number) => {
      updateProductMarkup(productId, markup);

      // Recalculate retail prices for variants
      const updatedConfigs = project.productConfigs.map((p) =>
        p.catalogProductId === productId
          ? {
              ...p,
              markupPercent: markup,
              variants: p.variants.map((v) => ({
                ...v,
                retailPrice: calculateRetailPrice(v.baseCost, markup),
              })),
              retailPrice: p.variants.length > 0
                ? Math.max(...p.variants.map((v) => calculateRetailPrice(v.baseCost, markup)))
                : 0,
            }
          : p
      );
      setProductConfigs(updatedConfigs);
    },
    [project.productConfigs, updateProductMarkup, setProductConfigs]
  );

  // ── Get products for active category ──
  const categoryProducts = project.productConfigs.filter(
    (p) => p.category === activeCategory
  );

  const enabledCount = project.productConfigs.filter((p) => p.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Product Configuration</h2>
          <p className="text-sm text-white/40 mt-1">
            {enabledCount} products enabled &middot; {selectedDesigns.length} designs selected
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => {
          const catProducts = project.productConfigs.filter((p) => p.category === cat.id);
          const catEnabled = catProducts.filter((p) => p.enabled).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border
                ${
                  activeCategory === cat.id
                    ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                    : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06]"
                }
              `}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {catEnabled > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  {catEnabled}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Product Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoryProducts.map((config) => (
          <ProductCard
            key={config.catalogProductId}
            config={config}
            isLoading={!!loadingVariants[config.catalogProductId]}
            error={variantError[config.catalogProductId]}
            onToggle={() => toggleProductEnabled(config.catalogProductId)}
            onMarkupChange={(markup) => handleMarkupChange(config.catalogProductId, markup)}
            onRetryLoad={() => loadVariants(config.catalogProductId, config.markupPercent)}
          />
        ))}
      </div>

      {/* Summary */}
      {enabledCount > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {selectedDesigns.length} designs &times; {enabledCount} products = {selectedDesigns.length * enabledCount} listings
              </p>
              <p className="text-xs text-white/40 mt-1">
                Each selected design will be listed on each enabled product type
              </p>
            </div>
            <div className="flex gap-2">
              {project.productConfigs
                .filter((p) => p.enabled)
                .map((p) => (
                  <span key={p.catalogProductId} className="text-lg" title={p.productName}>
                    {p.icon}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Card Component ──

function ProductCard({
  config,
  isLoading,
  error,
  onToggle,
  onMarkupChange,
  onRetryLoad,
}: {
  config: ProductConfig;
  isLoading: boolean;
  error?: string;
  onToggle: () => void;
  onMarkupChange: (markup: number) => void;
  onRetryLoad: () => void;
}) {
  const enabledVariants = config.variants.filter((v) => v.enabled).length;
  const totalVariants = config.variants.length;

  return (
    <div
      className={`
        rounded-xl border p-4 space-y-3 transition-all
        ${
          config.enabled
            ? "bg-indigo-500/5 border-indigo-500/20"
            : "bg-white/[0.02] border-white/[0.06]"
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <p className={`text-sm font-medium ${config.enabled ? "text-white" : "text-white/50"}`}>
              {config.productName}
            </p>
            {totalVariants > 0 && (
              <p className="text-[10px] text-white/30">
                {enabledVariants} of {totalVariants} variants
              </p>
            )}
          </div>
        </div>

        {/* Enable Toggle */}
        <button
          onClick={onToggle}
          className={`
            relative w-10 h-5 rounded-full transition-colors
            ${config.enabled ? "bg-indigo-500" : "bg-white/10"}
          `}
        >
          <div
            className={`
              absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm
              ${config.enabled ? "translate-x-5" : "translate-x-0.5"}
            `}
          />
        </button>
      </div>

      {/* Expanded content when enabled */}
      {config.enabled && (
        <>
          {/* Markup Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Markup</span>
              <span className="text-xs font-medium text-indigo-400">{config.markupPercent}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={config.markupPercent}
              onChange={(e) => onMarkupChange(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-white/10 accent-indigo-500"
            />
            <div className="flex items-center justify-between text-[10px] text-white/30">
              <span>20%</span>
              <span>80%</span>
            </div>
          </div>

          {/* Price Preview */}
          {config.retailPrice > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-white/40">Retail:</span>
              <span className="text-emerald-400 font-semibold">
                ${config.retailPrice.toFixed(2)}
              </span>
              {config.variants.length > 0 && (
                <>
                  <span className="text-white/20">|</span>
                  <span className="text-white/40">Base:</span>
                  <span className="text-white/60">
                    ${Math.min(...config.variants.map((v) => v.baseCost)).toFixed(2)} - ${Math.max(...config.variants.map((v) => v.baseCost)).toFixed(2)}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading variants...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-400">{error}</span>
              <button
                onClick={onRetryLoad}
                className="text-[10px] text-indigo-400 hover:text-indigo-300"
              >
                Retry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
