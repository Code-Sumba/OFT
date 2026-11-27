"use client";

import { AppShell } from "@/components/AppShell";
import { HolderDashboard } from "@/components/HolderDashboard";

export default function DistributorPage() {
  return (
    <AppShell roles={["distributor"]}>
      <HolderDashboard />
    </AppShell>
  );
}
