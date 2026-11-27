"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";
import { useUser } from "@/lib/session";
import type { Batch, TxResponse } from "@/lib/types";
import { SoldModal, TransferModal } from "./BatchActions";
import { BatchTable } from "./BatchTable";
import { TxNotice } from "./TxNotice";
import { Button, Card, Notice, Spinner } from "./ui";

/** Dashboard for processor, distributor and retailer: what I hold now, and what I passed on. */
export function HolderDashboard() {
  const user = useUser();
  const all = useApi<{ batches: Batch[] }>("/batches");
  const [transfer, setTransfer] = useState<Batch | null>(null);
  const [sell, setSell] = useState<Batch | null>(null);
  const [result, setResult] = useState<{ r: TxResponse; action: string } | null>(null);

  const batches = all.data?.batches ?? [];
  const holding = batches.filter((b) => b.currentOwner?.id === user.id && b.stage === user.role);
  const history = batches.filter((b) => !holding.includes(b));
  const isRetailer = user.role === "retailer";

  const done = (action: string) => (r: TxResponse) => {
    setResult({ r, action });
    setTransfer(null);
    setSell(null);
    all.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{ROLE_LABEL[user.role]} dashboard</h1>
        <p className="text-sm text-muted">
          {isRetailer
            ? "Print QR labels for batches you hold, and mark them sold."
            : `Batches handed to you appear here. Pass them on to the next ${user.role === "processor" ? "distributor" : "retailer"}.`}
        </p>
      </div>
      {result && <TxNotice result={result.r} action={result.action} />}
      {all.error && <Notice kind="error">{all.error.message}</Notice>}

      <Card title={`In my custody${holding.length ? ` (${holding.length})` : ""}`}>
        {all.loading && !all.data ? (
          <Spinner />
        ) : (
          <BatchTable
            batches={holding}
            empty="No batches with you right now."
            actions={(b) =>
              isRetailer ? (
                <span className="inline-flex gap-2">
                  <Link href={`/dashboard/batches/${b.code}/label`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-brand-soft">
                    QR label
                  </Link>
                  <Button onClick={() => setSell(b)}>Mark sold</Button>
                </span>
              ) : (
                <Button
                  onClick={() => setTransfer(b)}
                  disabled={b.status !== "certified" || b.certificate.expired}
                  title={
                    b.status !== "certified"
                      ? "Certification was revoked"
                      : b.certificate.expired
                        ? "Certificate expired: a certifier must renew it"
                        : undefined
                  }
                >
                  Transfer →
                </Button>
              )
            }
          />
        )}
      </Card>

      <Card title="Passed on / sold">
        <BatchTable batches={history} empty="Nothing here yet." />
      </Card>

      <TransferModal batch={transfer} onClose={() => setTransfer(null)} onDone={done("Transfer")} />
      <SoldModal batch={sell} onClose={() => setSell(null)} onDone={done("Sale")} />
    </div>
  );
}
