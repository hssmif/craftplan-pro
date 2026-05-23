"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSettings } from "@/hooks/useSettings";
import { ThemeToggle } from "@/components/ThemeToggle";

// Map route prefix → breadcrumb label
const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/catalog": "Catalog",
  "/research": "Research",
  "/opportunities": "Opportunities",
  "/etsy-imports": "Etsy Imports",
  "/agents": "Agent Command",
  "/factory": "Product Factory",
  "/design-sensei": "Design Sensei",
  "/pod-builder": "POD Builder",
  "/notion-builder": "Notion Import",
  "/wall-art": "Wall Art Studio",
  "/cross-stitch": "Cross Stitch Studio",
  "/stitch-atelier": "Stitch Atelier",
  "/digital-studio": "Digital Studio",
  "/product-studio": "Product Studio",
  "/mockups": "Mockup Lab",
  "/pdf-builder": "PDF Planners",
  "/excel-builder": "Excel Trackers",
  "/printable-builder": "Printables",
  "/planners": "Planner Hub",
  "/settings": "Settings",
};

function getLabel(pathname: string): string {
  if (pathname === "/") return routeLabels["/"];
  // Find deepest match
  const keys = Object.keys(routeLabels)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length);
  return keys[0] ? routeLabels[keys[0]] : "Studio";
}

export function Topbar() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const label = getLabel(pathname);
  const isConnected = !!settings.notionToken;

  return (
    <header className="sticky top-0 z-30 h-14 flex-shrink-0 bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
      <div className="h-full flex items-center justify-between px-6 gap-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <nav className="flex items-center gap-2 text-[13px] min-w-0">
            <Link
              href="/"
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex-shrink-0"
            >
              Studio
            </Link>
            <span className="text-[var(--text-faint)] flex-shrink-0">/</span>
            <span className="text-[var(--text-primary)] font-medium truncate">{label}</span>
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-emerald-400 status-pulse" : "bg-red-400"
              }`}
            />
            <span className="text-[11.5px] text-[var(--text-secondary)] tracking-wide font-medium">
              {isConnected ? "All systems" : "Notion off"}
            </span>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Docs */}
          <Link
            href="/settings"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>Tips</span>
          </Link>

          {/* User chip */}
          <button
            type="button"
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #F1641E, #D94F0F 60%, #A61A0B)",
                color: "#ffffff",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.20)",
              }}
            >
              H
            </div>
            <svg
              className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
