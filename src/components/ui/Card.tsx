"use client";

type CardPadding = "none" | "sm" | "md" | "lg";
type CardTone = "default" | "inset" | "accent" | "glass";

interface CardProps {
  children: React.ReactNode;
  padding?: CardPadding;
  tone?: CardTone;
  hover?: boolean;
  className?: string;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const TONE_CLASSES: Record<CardTone, string> = {
  default:
    "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
  inset:
    "bg-[var(--bg-inset)] border border-[var(--border-subtle)]",
  accent:
    "gradient-accent",
  glass:
    "glass-card",
};

export function Card({
  children,
  padding = "md",
  tone = "default",
  hover = false,
  className = "",
}: CardProps) {
  return (
    <div
      className={`
        rounded-[14px] relative
        ${TONE_CLASSES[tone]}
        ${hover ? "card-hover" : ""}
        ${PADDING_CLASSES[padding]}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}
