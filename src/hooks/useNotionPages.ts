"use client";

import { useState, useCallback, useRef } from "react";

// ── Notion Page type matching /api/notion/pages response ──

export interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  lastEdited: string;
}

// ── Hook: fetch & cache Notion pages for a given token ──

export function useNotionPages() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the last token we fetched for to avoid duplicate calls
  const lastTokenRef = useRef<string>("");

  const fetchPages = useCallback(async (token: string) => {
    if (!token.trim()) {
      setPages([]);
      setError(null);
      return;
    }

    // Skip if we already fetched for this exact token
    if (token === lastTokenRef.current && pages.length > 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Failed to fetch pages" }));
        throw new Error(data.error || `Failed to fetch pages (${resp.status})`);
      }

      const data = await resp.json();

      if (Array.isArray(data.pages)) {
        setPages(data.pages);
        lastTokenRef.current = token;
      } else {
        setPages([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch pages";
      setError(message);
      setPages([]);
    } finally {
      setIsLoading(false);
    }
  }, [pages.length]);

  return { pages, isLoading, error, fetchPages };
}
