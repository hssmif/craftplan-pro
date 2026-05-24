"use client";

import Link from "next/link";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-5 ${className}`}>
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-page-title)] tracking-[-0.01em] leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12px] text-[var(--text-muted)] mt-1">{subtitle}</p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-[12px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)] font-medium transition-colors inline-flex items-center gap-1 flex-shrink-0"
        >
          {action.label}
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}
