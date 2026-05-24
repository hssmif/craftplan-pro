"use client";

import { FactoryDashboard } from "@/components/factory/FactoryDashboard";

export default function FactoryPage() {
  return (
    <div className="flex-1 flex min-h-screen bg-[var(--bg-primary)]">
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-y-auto p-6">
          <FactoryDashboard />
        </main>
      </div>
    </div>
  );
}
