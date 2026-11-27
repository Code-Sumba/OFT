"use client";

import { AppShell } from "@/components/AppShell";
import { HolderDashboard } from "@/components/HolderDashboard";

export default function RetailerPage() {
  return (
    <AppShell roles={["retailer"]}>
      <HolderDashboard />
    </AppShell>
  );
}
