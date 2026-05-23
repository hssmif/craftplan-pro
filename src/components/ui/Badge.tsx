"use client";

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "muted";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  size?: BadgeSize;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, { bg: string; dot: string }> = {
  default: {
    bg: "bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    dot: "bg-[var(--text-secondary)]",
  },
  accent: {
    bg: "bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)]",
    dot: "bg-[var(--accent-primary)]",
  },
  success: {
    bg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  warning: {
    bg: "bg-amber-500/10 text-amber-400 border border-amber-500/25",
    dot: "bg-amber-400",
  },
  danger: {
    bg: "bg-red-500/10 text-red-400 border border-red-500/25",
    dot: "bg-red-400",
  },
  info: {
    bg: "bg-blue-500/10 text-blue-400 border border-blue-500/25",
    dot: "bg-blue-400",
  },
  purple: {
    bg: "bg-purple-500/10 text-purple-300 border border-purple-500/25",
    dot: "bg-purple-400",
  },
  muted: {
    bg: "bg-[var(--bg-inset)] text-[var(--text-muted)] border border-[var(--border-subtle)]",
    dot: "bg-[var(--text-muted)]",
  },
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10.5px] tracking-wide",
  md: "px-2.5 py-0.5 text-[11.5px] tracking-wide",
};

export function Badge({
  children,
  variant = "default",
  dot = false,
  size = "sm",
  className = "",
}: BadgeProps) {
  const v = VARIANT_CLASSES[variant];
  return (
    <span
      className={`rounded-full font-semibold inline-flex items-center gap-1.5 leading-none ${v.bg} ${SIZE_CLASSES[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  );
}
