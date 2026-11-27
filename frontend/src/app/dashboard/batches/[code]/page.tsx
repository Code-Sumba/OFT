"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Timeline } from "@/components/Timeline";
import { Card, Notice, Spinner, StagePill, StatusPill, TrustPill, TxLinkView } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { homeFor, useUser } from "@/lib/session";
import type { BatchDetail } from "@/lib/types";

export default function BatchDetailPage() {
  return (
    <AppShell>
      <Detail />
    </AppShell>
  );
}

function Detail() {
  const { code } = useParams<{ code: string }>();
  const user = useUser();
  const { data, error, loading } = useApi<BatchDetail>(`/batches/${encodeURIComponent(code)}`);

  if (loading) return <Spinner />;
  if (error || !data) return <Notice kind="error">{error?.message ?? "Batch not found"}</Notice>;
  const { batch, events, certificates } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={homeFor(user.role)} className="text-sm text-brand hover:underline">
            ← Back
          </Link>
          <h1 className="mt-1 text-3xl">{batch.product}</h1>
          <p className="code-tag text-sm text-muted">{batch.code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trace/${batch.code}`} target="_blank" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-brand-soft">
            Public trace page ↗
          </Link>
          {(user.role === "admin" || (user.role === "retailer" && batch.currentOwner?.id === user.id)) && (
            <Link href={`/dashboard/batches/${batch.code}/label`} className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong">
              Print QR label
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Item label="Status">
              <StatusPill status={batch.status} expired={batch.certificate.expired} />
            </Item>
            <Item label="Stage">
              <StagePill stage={batch.stage} />
            </Item>
            <Item label="Trust score">
              <TrustPill score={batch.trustScore} />
            </Item>
            <Item label="Quantity">
              {batch.quantity} {batch.unit}
            </Item>
            <Item label="Origin">{batch.origin}</Item>
            <Item label="Harvested">{fmtDate(batch.harvestDate)}</Item>
            <Item label="Farmer">{batch.farmer?.name ?? "—"}</Item>
            <Item label="Current holder">{batch.currentOwner?.name ?? "—"}</Item>
            <Item label="Certificate">
              {batch.certificate.url ? (
                <a href={batch.certificate.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  IPFS ↗
                </a>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Valid until">{fmtDate(batch.certificate.expiry)}</Item>
            <Item label="Registered tx">
              <TxLinkView hash={batch.registerTx.hash} url={batch.registerTx.url} />
            </Item>
          </dl>
        </Card>

        <Card title="Journey" className="lg:col-span-2">
          <Timeline events={events} />
        </Card>
      </div>

      {certificates.length > 0 && (
        <Card title="Certification history">
          <ul className="divide-y divide-border text-sm">
            {certificates.map((c) => (
              <li key={c.tx.hash} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className={c.approved ? "font-medium text-brand-strong" : "font-medium text-danger"}>{c.approved ? "Approved" : "Rejected"}</span>
                  {" by "}
                  {c.certifier?.name ?? "—"} · {fmtDateTime(c.at)}
                  {c.approved && c.expiry && <span className="text-muted"> · valid until {fmtDate(c.expiry)}</span>}
                </span>
                <TxLinkView hash={c.tx.hash} url={c.tx.url} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
