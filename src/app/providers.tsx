"use client";

import { SettingsProvider } from "@/hooks/useSettings";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
