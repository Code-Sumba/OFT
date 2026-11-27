"use client";

import { AppShell } from "@/components/AppShell";
import { HolderDashboard } from "@/components/HolderDashboard";

export default function ProcessorPage() {
  return (
    <AppShell roles={["processor"]}>
      <HolderDashboard />
    </AppShell>
  );
}
