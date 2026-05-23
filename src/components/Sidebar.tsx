"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "@/hooks/useSettings";
import { useCatalogStore } from "@/stores/catalogStore";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  hasBadge?: boolean;
  hint?: string; // e.g. "Live", "Bulk", "AI"
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
      },
      {
        href: "/catalog",
        label: "Catalog",
        icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
        hasBadge: true,
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        icon: "M13 10V3L4 14h7v7l9-11h-7z",
      },
      {
        href: "/research",
        label: "Research",
        icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
      },
      {
        href: "/etsy-imports",
        label: "Etsy Imports",
        icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
      },
      {
        href: "/strategist",
        label: "Strategist",
        icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
        hint: "Live",
      },
      {
        href: "/agents",
        label: "Agent Command",
        icon: "M7 7h.01M17 7h.01M7 17h.01M17 17h.01M7 7h10M7 17h10M7 7v10M17 7v10M9 9l6 6M15 9l-6 6",
        hint: "Ops",
      },
    ],
  },
  {
    label: "Create",
    items: [
      {
        href: "/factory",
        label: "Product Factory",
        icon: "M3 21h18M5 21V9l7-4 7 4v12M9 21v-6h6v6M10 9h.01M14 9h.01",
        hint: "Bulk",
      },
      {
        href: "/design-sensei",
        label: "Design Sensei",
        icon: "M12 2l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 2z",
        hint: "AI",
      },
      {
        href: "/pod-builder",
        label: "POD Builder",
        icon: "M6 2l1 2h10l1-2m-12 0v4h12V2M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6M9 10h6M9 14h6M9 18h3",
      },
      {
        href: "/notion-builder",
        label: "Notion Import",
        icon: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 7v10M16 7l0 10M8 7l8 10",
      },
    ],
  },
  {
    label: "Studios",
    items: [
      {
        href: "/wall-art",
        label: "Wall Art",
        icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
      },
      {
        href: "/cross-stitch",
        label: "Cross Stitch",
        icon: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z",
      },
      {
        href: "/stitch-atelier",
        label: "Stitch Atelier",
        icon: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z",
      },
      {
        href: "/my-listings",
        label: "My Listings",
        icon: "M4 6h16M4 12h16M4 18h16",
      },
      {
        href: "/digital-studio",
        label: "Digital Studio",
        icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
      },
      {
        href: "/product-studio",
        label: "Product Studio",
        icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
      },
      {
        href: "/mockups",
        label: "Mockup Lab",
        icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
      },
    ],
  },
  {
    label: "Printables",
    items: [
      {
        href: "/pdf-builder",
        label: "PDF Planners",
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
      },
      {
        href: "/excel-builder",
        label: "Excel Trackers",
        icon: "M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18M17 3v18",
      },
      {
        href: "/printable-builder",
        label: "Printables",
        icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
      },
      {
        href: "/planners",
        label: "Planner Hub",
        icon: "M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
      },
    ],
  },
];

// Hint pill colors
const HINT_COLORS: Record<string, string> = {
  Live: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  Bulk: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  AI:   "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  Ops:  "bg-sky-500/12 text-sky-300 border border-sky-500/25",
};

export function Sidebar() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const catalogItems = useCatalogStore((s) => s.items);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isConnected = !!settings.notionToken;
  const draftCount = catalogItems.filter((i) => i.status === "draft" || i.status === "mockups_needed").length;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <>
      {/* ── Logo ── */}
      <div className="px-5 py-5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[15px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #F1641E, #D94F0F 60%, #A61A0B)",
              boxShadow: "0 2px 12px rgba(241,100,30,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            C
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white tracking-tight leading-tight">CraftPlan</h1>
            <p className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">Digital Studio</p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
        {navSections.map((section, si) => (
          <div key={section.label} className={si > 0 ? "mt-5" : ""}>
            <p className="px-5 mb-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.15em]">
              {section.label}
            </p>
            {section.items.map((item) => {
              const active = isActive(item.href);
              const badge = item.hasBadge && draftCount > 0 ? draftCount : 0;
              const hintColor = item.hint ? (HINT_COLORS[item.hint] ?? "bg-white/10 text-white/60 border-white/10") : "";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 mx-2 px-3 py-[7px] rounded-lg text-[13px]
                    transition-all duration-150 group relative
                    ${active
                      ? "text-white bg-white/[0.08] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:bg-indigo-400 before:rounded-full"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]"
                    }
                  `}
                >
                  <svg
                    className={`w-[16px] h-[16px] flex-shrink-0 transition-colors duration-150 ${
                      active ? "text-indigo-400" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.6}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="font-medium flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                  {item.hint && (
                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${hintColor}`}>
                      {item.hint}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Bottom Section ── */}
      <div className="border-t border-white/[0.06] p-4 pb-5 space-y-3">
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150
            ${pathname === "/settings"
              ? "text-white bg-white/[0.08]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]"
            }
          `}
        >
          <svg className="w-[16px] h-[16px] text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium">Settings</span>
        </Link>

        {/* Connection Status */}
        <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isConnected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] status-pulse" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]"
              }`} />
              <span className="text-[11px] text-[var(--text-secondary)] font-medium truncate">
                Notion
              </span>
            </div>
            <span className={`text-[10px] tracking-wide uppercase font-semibold flex-shrink-0 ${
              isConnected ? "text-emerald-400" : "text-red-400"
            }`}>
              {isConnected ? "Live" : "Off"}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-[var(--text-muted)]/60 px-3 tracking-[0.08em] uppercase font-medium">CraftPlan Digital v1.0</p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2.5 bg-[var(--bg-elevated)] text-white rounded-xl border border-white/[0.08] shadow-lg"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[var(--bg-surface)] text-[var(--text-primary)] flex flex-col z-50 border-r border-white/[0.06]">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-white"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] bg-[var(--bg-surface)] text-[var(--text-primary)] flex-col flex-shrink-0 border-r border-white/[0.06]">
        {sidebarContent}
      </aside>
    </>
  );
}
