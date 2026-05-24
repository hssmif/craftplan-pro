"use client";

import { Card } from "./Card";

type AccentColor = "amber" | "emerald" | "violet" | "blue" | "rose";

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  sublabel?: string;
  icon?: React.ReactNode;
  accentColor?: AccentColor;
  trend?: { value: string; positive?: boolean };
  className?: string;
}

const ACCENT_MAP: Record<AccentColor, { icon: string; bar: string }> = {
  amber: { icon: "text-amber-400", bar: "from-amber-500/40" },
  emerald: { icon: "text-emerald-400", bar: "from-emerald-500/40" },
  violet: { icon: "text-violet-400", bar: "from-violet-500/40" },
  blue: { icon: "text-blue-400", bar: "from-blue-500/40" },
  rose: { icon: "text-rose-400", bar: "from-rose-500/40" },
};

export function StatCard({
  label,
  value,
  suffix,
  sublabel,
  icon,
  accentColor = "amber",
  trend,
  className = "",
}: StatCardProps) {
  const accent = ACCENT_MAP[accentColor];

  return (
    <Card padding="md" hover className={`relative overflow-hidden ${className}`}>
      {/* Soft accent glow top */}
      <div
        className={`absolute -top-16 -right-10 w-32 h-32 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${accent.bar} to-transparent pointer-events-none`}
      />

      <div className="relative">
        {/* Label row */}
        <div className="flex items-center gap-2">
          {icon && <span className={accent.icon}>{icon}</span>}
          <span className="section-label">{label}</span>
        </div>

        {/* Value */}
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-display text-[32px] leading-none text-[var(--text-page-title)] tracking-[-0.02em] stat-number">
            {value}
          </span>
          {suffix && (
            <span className="text-[13px] text-[var(--text-muted)]">{suffix}</span>
          )}
        </div>

        {/* Trend or Sublabel */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {sublabel && (
            <p className="text-[12px] text-[var(--text-secondary)] truncate">{sublabel}</p>
          )}
          {trend && (
            <span
              className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${
                trend.positive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                {trend.positive ? (
                  <path d="M10 3l5 7h-3v7H8v-7H5l5-7z" />
                ) : (
                  <path d="M10 17l-5-7h3V3h4v7h3l-5 7z" />
                )}
              </svg>
              {trend.value}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
