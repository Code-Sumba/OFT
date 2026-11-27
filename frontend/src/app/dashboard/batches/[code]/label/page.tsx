"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Notice, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { BatchDetail } from "@/lib/types";

/** Printable shelf label: QR to the public trace page plus product name and batch code. */
export default function LabelPage() {
  return (
    <AppShell roles={["retailer", "admin"]}>
      <Label />
    </AppShell>
  );
}

function Label() {
  const { code } = useParams<{ code: string }>();
  const { data, error, loading } = useApi<BatchDetail>(`/batches/${encodeURIComponent(code)}`);

  if (loading) return <Spinner />;
  if (error || !data) return <Notice kind="error">{error?.message ?? "Batch not found"}</Notice>;
  const { batch } = data;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/batches/${batch.code}`} className="text-sm text-brand hover:underline">
          ← Batch details
        </Link>
        <div className="flex gap-2">
          <a href={`/api/batches/${batch.code}/qr?format=svg`} download={`${batch.code}.svg`} className="rounded-md border border-rule px-4 py-2 text-sm font-medium hover:border-foreground">
            Download SVG
          </a>
          <Button onClick={() => window.print()}>Print label</Button>
        </div>
      </div>

      <div className="mx-auto w-72 border-2 border-black bg-white p-5 text-center text-black">
        <p className="eyebrow !text-[#1f4430]">Scan to verify organic</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the API as PNG, not a static asset */}
        <img src={`/api/batches/${batch.code}/qr`} alt={`QR code for batch ${batch.code}`} width={220} height={220} className="mx-auto my-3" />
        <p className="font-display text-xl font-semibold leading-tight">{batch.product}</p>
        <p className="code-tag mt-1 inline-block border border-black px-2 py-0.5 text-sm">{batch.code}</p>
        <p className="mt-1 text-xs text-gray-600">
          {batch.origin} · harvested {fmtDate(batch.harvestDate)}
        </p>
      </div>
    </div>
  );
}
