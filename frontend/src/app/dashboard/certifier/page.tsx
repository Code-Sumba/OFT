"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CertifyModal } from "@/components/BatchActions";
import { BatchTable } from "@/components/BatchTable";
import { TxNotice } from "@/components/TxNotice";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { useApi } from "@/lib/api";
import type { Batch, TxResponse } from "@/lib/types";

export default function CertifierPage() {
  return (
    <AppShell roles={["certifier"]}>
      <CertifierDashboard />
    </AppShell>
  );
}

function CertifierDashboard() {
  const all = useApi<{ batches: Batch[] }>("/batches");
  const [selected, setSelected] = useState<Batch | null>(null);
  const [result, setResult] = useState<TxResponse | null>(null);

  const batches = all.data?.batches ?? [];
  const pending = batches.filter((b) => b.status === "registered" && b.onChain);
  const reviewed = batches.filter((b) => b.status !== "registered");

  const onDone = (r: TxResponse) => {
    setResult(r);
    setSelected(null);
    all.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certification</h1>
        <p className="text-sm text-muted">Review each batch&apos;s certificate, then approve it with an expiry date or reject it.</p>
      </div>
      {result && <TxNotice result={result} action="Certification decision" />}
      {all.error && <Notice kind="error">{all.error.message}</Notice>}

      <Card title={`Awaiting review${pending.length ? ` (${pending.length})` : ""}`}>
        {all.loading && !all.data ? (
          <Spinner />
        ) : (
          <BatchTable
            batches={pending}
            empty="Nothing waiting for review."
            actions={(b) => <Button onClick={() => setSelected(b)}>Review</Button>}
          />
        )}
      </Card>

      <Card title="Reviewed batches">
        <BatchTable
          batches={reviewed}
          empty="No decisions yet."
          actions={(b) =>
            b.stage !== "sold" ? (
              <Button variant="secondary" onClick={() => setSelected(b)}>
                {b.status === "certified" ? (b.certificate.expired ? "Renew" : "Revise") : "Re-review"}
              </Button>
            ) : null
          }
        />
      </Card>

      <CertifyModal batch={selected} onClose={() => setSelected(null)} onDone={onDone} />
    </div>
  );
}
