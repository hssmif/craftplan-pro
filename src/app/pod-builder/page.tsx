"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Redirect: POD Builder → Product Studio ──
// POD Builder has been merged into the unified Product Studio pipeline.

export default function PodBuilderRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/product-studio");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <p className="text-sm text-white/60">Redirecting to Product Studio…</p>
        <p className="text-xs text-white/30">POD Builder has been merged into the unified Product Studio.</p>
      </div>
    </div>
  );
}
