"use client";

import { Card } from "./Card";

interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  render: (row: T, index: number) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyMessage?: string;
  compact?: boolean;
}

const ALIGN_CLASSES = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function SortCaret({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  return (
    <span
      className={`inline-flex flex-col ml-1 ${active ? "text-[var(--text-secondary)]" : "text-[var(--text-faint)]"}`}
    >
      <svg
        className={`w-2 h-2 ${active && dir === "asc" ? "text-[var(--accent-primary)]" : ""}`}
        viewBox="0 0 8 5"
        fill="currentColor"
      >
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
      <svg
        className={`w-2 h-2 -mt-0.5 ${active && dir === "desc" ? "text-[var(--accent-primary)]" : ""}`}
        viewBox="0 0 8 5"
        fill="currentColor"
      >
        <path d="M4 5L0 0H8L4 5Z" />
      </svg>
    </span>
  );
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = "No data",
  compact = false,
}: DataTableProps<T>) {
  const cellPad = compact ? "px-4 py-2.5" : "px-4 py-3";
  const bodySize = compact ? "text-[12px]" : "text-[13px]";

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full ${bodySize}`}>
          <thead className="bg-[var(--bg-inset)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    ${cellPad} text-[10.5px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.1em]
                    ${ALIGN_CLASSES[col.align || "left"]}
                    ${col.sortable ? "cursor-pointer hover:text-[var(--text-secondary)] select-none" : ""}
                    ${col.width || ""}
                  `.trim()}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && (
                      <SortCaret
                        active={sortKey === col.key}
                        dir={sortKey === col.key ? sortDir : undefined}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-14 text-center text-[var(--text-muted)] text-[13px]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={keyExtractor(row)}
                  className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${cellPad} text-[var(--text-secondary)] ${ALIGN_CLASSES[col.align || "left"]} ${col.width || ""}`}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
