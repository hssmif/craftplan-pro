"use client";

interface FilterTab {
  key: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  tabs: FilterTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}

export function FilterBar({
  tabs,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  actions,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      {/* Tab container */}
      <div className="flex gap-0.5 bg-[var(--bg-inset)] p-1 rounded-xl border border-[var(--border-subtle)]">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              aria-selected={isActive}
              className={`
                px-3.5 py-[7px] rounded-lg text-[12.5px] font-medium transition-all whitespace-nowrap inline-flex items-center gap-2
                ${isActive
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-default)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent"
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none font-semibold ${
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      {onSearchChange !== undefined && (
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchValue || ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 h-9 rounded-lg text-[12.5px]"
          />
        </div>
      )}

      {/* Actions slot */}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
