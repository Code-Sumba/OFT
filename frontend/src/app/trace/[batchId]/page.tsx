import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Timeline } from "@/components/Timeline";
import { Card, Notice, Spinner, StagePill, StatusPill, TrustGauge, TxLinkView } from "@/components/ui";
import { BAND_LABEL, fmtDate } from "@/lib/format";
import type { TraceData } from "@/lib/types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export const metadata: Metadata = {
  title: "Verify batch",
  description: "Farm-to-shelf journey, organic certificate and trust score for this batch.",
};

type Result = { ok: true; data: TraceData } | { ok: false; status: number; error: string };

async function loadTrace(code: string): Promise<Result> {
  // Pass the visitor's address on (as the /api rewrite does), so the backend rate-limits
  // each shopper separately instead of every scan sharing this server's IP.
  const incoming = await headers();
  const forwarded = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
  try {
    const res = await fetch(`${API_URL}/api/trace/${encodeURIComponent(code)}`, {
      cache: "no-store",
      headers: forwarded ? { "x-forwarded-for": forwarded } : undefined,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) return { ok: false, status: res.status, error: body?.error ?? "Could not load this batch" };
    return { ok: true, data: body.data };
  } catch {
    return { ok: false, status: 503, error: "The verification service is unavailable. Please try again shortly." };
  }
}

export default function TracePage(props: PageProps<"/trace/[batchId]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Suspense fallback={<Spinner label="Checking the blockchain record…" />}>
          <TraceContent params={props.params} />
        </Suspense>
      </main>
    </>
  );
}

async function TraceContent({ params }: Pick<PageProps<"/trace/[batchId]">, "params">) {
  const { batchId } = await params;
  const code = decodeURIComponent(batchId).toUpperCase();
  const result = await loadTrace(code);

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl">{result.status === 404 ? "Batch not found" : "Unable to verify"}</h1>
        <Notice kind={result.status === 404 ? "warn" : "error"}>
          {result.status === 404 ? (
            <>
              No batch with code <span className="code-tag">{code}</span> exists. Check the code on the label, and be cautious if it came from a product claiming to be organic.
            </>
          ) : (
            result.error
          )}
        </Notice>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Search another code
        </Link>
      </div>
    );
  }

  const { batch, timeline, certificates, trust, verification } = result.data;
  const verified = verification.badge === "verified";
  const latestCert = certificates.filter((c) => c.approved).at(-1);

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <section className={`border-2 bg-surface ${verified ? "border-brand" : "border-warn"}`} aria-live="polite">
        <div
          className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-2 ${verified ? "border-brand/30 bg-brand-soft" : "border-warn/30 bg-warn-soft"}`}
        >
          <span className="eyebrow !text-foreground">Batch {batch.code}</span>
          <span className="eyebrow">{verification.chainChecked ? "Checked against the blockchain" : "Blockchain not reachable"}</span>
        </div>
        <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
          <TrustGauge score={trust.score} band={trust.band} />
          <div className="min-w-0 flex-1">
            <span className={`stamp ${verified ? "text-brand" : "text-warn"}`}>{verified ? "✓ Verified organic" : "⚠ Check before buying"}</span>
            <h1 className="mt-4 text-3xl leading-tight sm:text-4xl">{batch.product}</h1>
            <p className="mt-1 text-sm text-muted">
              {batch.quantity} {batch.unit} · grown in {batch.origin} · trust score {BAND_LABEL[trust.band].toLowerCase()}
            </p>
          </div>
        </div>
        {trust.rules.length > 0 && (
          <ul className="border-t border-dashed border-rule px-5 py-4">
            {trust.rules.map((r) => (
              <li key={r.rule} className="flex gap-4 py-1.5 text-sm">
                <span className="code-tag w-12 shrink-0 text-danger">−{r.impact}</span>
                <span>
                  <span className="font-semibold">{r.label}.</span> <span className="text-muted">{r.details}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Product">
          <dl className="space-y-2 text-sm">
            <Row label="Status">
              <StatusPill status={batch.status} expired={batch.certificate.expired} />
            </Row>
            <Row label="Stage">
              <StagePill stage={batch.stage} />
            </Row>
            <Row label="Harvested">{fmtDate(batch.harvestDate)}</Row>
            <Row label="Farmer">
              {batch.farmer ? `${batch.farmer.name}${batch.farmer.organisation ? `, ${batch.farmer.organisation}` : ""}` : "—"}
            </Row>
          </dl>
        </Card>

        <Card title="Organic certificate">
          <dl className="space-y-2 text-sm">
            <Row label="Certified by">{latestCert?.certifier?.name ?? "Not certified"}</Row>
            <Row label="Valid until">
              <span className={batch.certificate.expired ? "font-medium text-warn" : ""}>
                {fmtDate(batch.certificate.expiry)}
                {batch.certificate.expired && " (expired)"}
              </span>
            </Row>
            <Row label="Document">
              {batch.certificate.url ? (
                <a href={batch.certificate.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  View on IPFS ↗
                </a>
              ) : (
                "—"
              )}
            </Row>
          </dl>
        </Card>
      </div>

      <Card title="Journey">
        <Timeline events={timeline} />
      </Card>

      <Card title="Blockchain verification">
        <div className="space-y-2 text-sm">
          {!verification.chainChecked ? (
            <Notice kind="warn">The blockchain could not be reached just now, so the record was not re-checked. Reload to try again.</Notice>
          ) : verification.matchesChain ? (
            <Notice kind="success">This record matches the blockchain exactly.</Notice>
          ) : (
            <Notice kind="error">
              This record does not match the blockchain: {verification.differences.join("; ")}.
            </Notice>
          )}
          <Row label="Registration">
            <TxLinkView hash={batch.registerTx.hash} url={batch.registerTx.url} />
          </Row>
          <Row label="Smart contract">
            <a href={verification.contract.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand hover:underline">
              {verification.contract.address.slice(0, 10)}… ↗
            </a>
          </Row>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
