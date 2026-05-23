"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = pathname !== "/onboarding";

  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--bg-base)]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-[var(--bg-base)]">
          <div className="page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
