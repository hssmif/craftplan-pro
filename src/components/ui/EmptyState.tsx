"use client";

import Link from "next/link";

interface EmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  compact?: boolean;
}

export function EmptyState({ emoji, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`text-center ${compact ? "py-8" : "py-16"}`}>
      <div className={`mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center ${compact ? "w-14 h-14" : "w-20 h-20"}`}>
        <span className={compact ? "text-2xl" : "text-3xl"}>{emoji}</span>
      </div>
      <p className={`font-medium text-slate-700 ${compact ? "text-sm" : ""}`}>{title}</p>
      <p className={`text-slate-400 mt-1 max-w-sm mx-auto ${compact ? "text-xs" : "text-sm"}`}>{description}</p>
      {action && (
        <Link
          href={action.href}
          className={`inline-flex items-center gap-2 mt-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm ${
            compact ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {action.label}
        </Link>
      )}
    </div>
  );
}
