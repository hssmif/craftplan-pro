"use client";

import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: React.ReactNode;
  eyebrow?: string;
  variant?: "default" | "display";
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  eyebrow,
  variant = "default",
}: PageHeaderProps) {
  return (
    <div className="mb-8 pt-2">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] mb-3">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--text-faint)]">/</span>}
              {item.href ? (
                <Link
                  href={item.href}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-[var(--text-secondary)]">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Eyebrow label */}
      {eyebrow && (
        <p className="section-label mb-2" style={{ color: "var(--accent-primary)" }}>
          {eyebrow}
        </p>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          {variant === "display" ? (
            <h1 className="font-display text-[44px] leading-[1.05] text-[var(--text-page-title)] tracking-[-0.02em]">
              {title}
            </h1>
          ) : (
            <h1 className="text-[26px] leading-tight font-semibold text-[var(--text-page-title)] tracking-[-0.02em] heading">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[14px] text-[var(--text-secondary)] mt-2 max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>
        )}
      </div>

      {/* Hairline divider */}
      <div className="mt-6 h-px bg-gradient-to-r from-transparent via-[var(--border-default)] to-transparent" />
    </div>
  );
}
