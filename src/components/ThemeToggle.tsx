"use client";

import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();

  // Avoid hydration flash — render placeholder until mounted
  if (!mounted) {
    return (
      <div className="w-[70px] h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="relative h-8 w-[70px] rounded-full bg-[var(--bg-inset)] border border-[var(--border-default)] flex items-center hover:border-[var(--border-strong)] transition-colors group"
    >
      {/* Track icons */}
      <span className="absolute left-[9px] top-1/2 -translate-y-1/2 text-[11px] leading-none pointer-events-none">
        <svg
          className={`w-3.5 h-3.5 transition-opacity ${isDark ? "opacity-100 text-amber-400" : "opacity-30"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </span>
      <span className="absolute right-[9px] top-1/2 -translate-y-1/2 text-[11px] leading-none pointer-events-none">
        <svg
          className={`w-3.5 h-3.5 transition-opacity ${!isDark ? "opacity-100 text-amber-500" : "opacity-30"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
      </span>

      {/* Sliding thumb */}
      <span
        className={`absolute top-[3px] h-[24px] w-[30px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex items-center justify-center ${
          isDark ? "left-[3px]" : "left-[35px]"
        }`}
        style={{
          background: "linear-gradient(180deg, #F1641E, #D94F0F)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(241, 100, 30, 0.4)",
        }}
      >
        <span className="text-[10px] font-bold text-white tracking-wide">
          {isDark ? "DK" : "LT"}
        </span>
      </span>
    </button>
  );
}
