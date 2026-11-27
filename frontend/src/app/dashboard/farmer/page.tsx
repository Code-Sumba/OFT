"use client";

import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TransferModal } from "@/components/BatchActions";
import { BatchTable } from "@/components/BatchTable";
import { TxNotice } from "@/components/TxNotice";
import { Button, Card, Field, Input, Notice, Select, Spinner } from "@/components/ui";
import { ApiError, api, uploadFile, useApi } from "@/lib/api";
import { useUser } from "@/lib/session";
import type { Batch, TxResponse } from "@/lib/types";

const UNITS = ["kg", "quintal", "tonne", "litre", "dozen", "piece"];
const today = () => new Date().toISOString().slice(0, 10);

export default function FarmerPage() {
  return (
    <AppShell roles={["farmer"]}>
      <FarmerDashboard />
    </AppShell>
  );
}

function FarmerDashboard() {
  const user = useUser();
  const batches = useApi<{ batches: Batch[] }>("/batches");
  const [result, setResult] = useState<{ r: TxResponse; action: string } | null>(null);
  const [transfer, setTransfer] = useState<Batch | null>(null);

  const done = (action: string) => (r: TxResponse) => {
    setResult({ r, action });
    setTransfer(null);
    batches.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted">Register harvests, then hand certified batches to a processor.</p>
      </div>
      {result && <TxNotice result={result.r} action={result.action} />}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Register a harvest batch">
          <RegisterForm onDone={done("Registration")} />
        </Card>

        <Card title="My batches">
          {batches.loading && !batches.data ? (
            <Spinner />
          ) : batches.error ? (
            <Notice kind="error">{batches.error.message}</Notice>
          ) : (
            <BatchTable
              batches={batches.data?.batches ?? []}
              empty="No batches yet. Register your first harvest."
              actions={(b) =>
                b.stage === "farmer" && b.status === "certified" && b.certificate.expired ? (
                  <span className="text-xs text-warn">Certificate expired: ask the certifier to renew</span>
                ) : b.stage === "farmer" && b.status === "certified" && b.onChain ? (
                  <Button variant="secondary" onClick={() => setTransfer(b)}>
                    Transfer →
                  </Button>
                ) : b.status === "registered" ? (
                  <span className="text-xs text-muted">Waiting for certifier</span>
                ) : null
              }
            />
          )}
        </Card>
      </div>

      <TransferModal batch={transfer} onClose={() => setTransfer(null)} onDone={done("Transfer")} />
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: (r: TxResponse) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    setError(null);
    try {
      const file = f.get("file") as File | null;
      let certificateCid: string | undefined;
      if (file && file.size > 0) {
        setBusy("Uploading certificate to IPFS…");
        certificateCid = (await uploadFile(file)).cid;
      }
      setBusy("Recording on blockchain…");
      const r = await api<TxResponse>("/batches", {
        method: "POST",
        json: {
          product: f.get("product"),
          quantity: Number(f.get("quantity")),
          unit: f.get("unit"),
          origin: f.get("origin"),
          harvestDate: f.get("harvestDate"),
          certificateCid,
        },
      });
      formEl.reset();
      onDone(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : "Registration failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Product">
        <Input name="product" required minLength={2} maxLength={100} placeholder="e.g. Basmati Rice" />
      </Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Quantity">
          <Input name="quantity" type="number" required min="0.01" step="0.01" />
        </Field>
        <Field label="Unit">
          <Select name="unit" defaultValue="kg">
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Origin" hint="Village / district where it was grown">
        <Input name="origin" required minLength={2} maxLength={100} placeholder="e.g. Ozar, Nashik" />
      </Field>
      <Field label="Harvest date">
        <Input name="harvestDate" type="date" required max={today()} defaultValue={today()} />
      </Field>
      <Field label="Organic certificate" hint="PDF or image, up to 5 MB. Stored on IPFS; only its fingerprint goes on-chain.">
        <Input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" disabled={busy !== null} className="w-full">
        {busy ?? "Register batch"}
      </Button>
    </form>
  );
}
