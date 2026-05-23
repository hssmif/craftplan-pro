"use client";

import { useState, useCallback, useRef } from "react";
import type { StudioProgressEvent } from "@/lib/studio-pipeline";

export interface UseSSEProgressReturn {
  events: StudioProgressEvent[];
  latestEvent: StudioProgressEvent | null;
  isRunning: boolean;
  error: string | null;
  startPublish: (body: Record<string, unknown>) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

export function useSSEProgress(): UseSSEProgressReturn {
  const [events, setEvents] = useState<StudioProgressEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<StudioProgressEvent | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startPublish = useCallback(async (body: Record<string, unknown>) => {
    setIsRunning(true);
    setError(null);
    setEvents([]);
    setLatestEvent(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const resp = await fetch("/api/studio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: "Publish failed" }));
        throw new Error(errorData.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event: StudioProgressEvent = JSON.parse(data);
            setLatestEvent(event);
            setEvents((prev) => [...prev, event]);

            // Check for terminal error
            if (event.type === "error") {
              setError(event.error || "Pipeline error");
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Cancelled");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
    setIsRunning(false);
    setError(null);
  }, []);

  return { events, latestEvent, isRunning, error, startPublish, abort, reset };
}
