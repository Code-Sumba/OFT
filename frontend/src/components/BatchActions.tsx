"use client";

import { useState } from "react";
import { ApiError, api, uploadFile, useApi } from "@/lib/api";
import { ROLE_LABEL, STAGE_LABEL, isoDateFromNow } from "@/lib/format";
import type { Batch, Party, Role, Stage, TxResponse } from "@/lib/types";
import { Modal } from "./Modal";
import { Button, Field, Input, Notice, Select } from "./ui";

const NEXT_STAGE: Partial<Record<Stage, Stage>> = { farmer: "processor", processor: "distributor", distributor: "retailer" };

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<TxResponse>, onDone: (r: TxResponse) => void) {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

/** Hand a batch to the next participant in the chain. */
export function TransferModal({ batch, onClose, onDone }: { batch: Batch | null; onClose: () => void; onDone: (r: TxResponse) => void }) {
  const next = batch ? NEXT_STAGE[batch.stage] : undefined;
  const recipients = useApi<{ users: Party[] }>(next ? `/users?role=${next}` : null);
  const { busy, error, run } = useAction();

  return (
    <Modal open={batch !== null} onClose={onClose} title={next ? `Transfer to ${ROLE_LABEL[next as Role]}` : "Transfer"}>
      {batch && next && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () => api<TxResponse>(`/batches/${batch.code}/transfer`, { method: "POST", json: { toUserId: f.get("toUserId"), location: f.get("location") } }),
              onDone,
            );
          }}
        >
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{batch.product}</span> ({batch.code}) moves to the{" "}
            <span className="font-medium text-foreground">{STAGE_LABEL[next].toLowerCase()}</span> stage. This is recorded on the blockchain and cannot be undone.
          </p>
          <Field label={`Receiving ${ROLE_LABEL[next as Role].toLowerCase()}`}>
            {recipients.loading ? (
              <p className="text-sm text-muted">Loading participants…</p>
            ) : recipients.data?.users.length ? (
              <Select name="toUserId" required>
                {recipients.data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.organisation ? ` – ${u.organisation}` : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <Notice kind="warn">No approved {ROLE_LABEL[next as Role].toLowerCase()} accounts yet.</Notice>
            )}
          </Field>
          <Field label="Hand-over location" hint="Town or facility where the goods change hands">
            <Input name="location" required minLength={2} maxLength={100} placeholder="e.g. MIDC Ambad, Nashik" />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !recipients.data?.users.length}>
              {busy ? "Recording on blockchain…" : "Confirm transfer"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Certifier decision: approve with expiry (optionally a new certificate file) or reject. */
export function CertifyModal({ batch, onClose, onDone }: { batch: Batch | null; onClose: () => void; onDone: (r: TxResponse) => void }) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const { busy, error, run } = useAction();

  return (
    <Modal open={batch !== null} onClose={onClose} title="Certification decision">
      {batch && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              if (decision === "reject") {
                return api<TxResponse>(`/batches/${batch.code}/certify`, { method: "POST", json: { approved: false } });
              }
              const file = f.get("file") as File | null;
              const certificateCid = file && file.size > 0 ? (await uploadFile(file)).cid : undefined;
              return api<TxResponse>(`/batches/${batch.code}/certify`, {
                method: "POST",
                json: { approved: true, expiry: f.get("expiry"), certificateCid },
              });
            }, onDone);
          }}
        >
          <div className="rounded-lg bg-brand-soft/50 p-3 text-sm">
            <p className="font-medium">
              {batch.product} · {batch.quantity} {batch.unit}
            </p>
            <p className="text-muted">
              {batch.origin} · farmer {batch.farmer?.name ?? "—"}
            </p>
            {batch.certificate.url ? (
              <a href={batch.certificate.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                Open farmer&apos;s certificate ↗
              </a>
            ) : (
              <p className="text-warn">The farmer did not upload a certificate. Attach one below to approve.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Decision">
            {(["approve", "reject"] as const).map((d) => (
              <label
                key={d}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                  decision === d ? (d === "approve" ? "border-brand bg-brand-soft text-brand-strong" : "border-danger bg-danger-soft text-danger") : "border-border"
                }`}
              >
                <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
                {d === "approve" ? "Approve as organic" : "Reject"}
              </label>
            ))}
          </div>

          {decision === "approve" && (
            <>
              <Field label="Certificate valid until">
                <Input name="expiry" type="date" required min={isoDateFromNow(1)} defaultValue={isoDateFromNow(365)} />
              </Field>
              <Field label="Certificate file" hint="Optional: replaces the farmer's upload. PDF, PNG, JPEG or WebP up to 5 MB.">
                <Input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
              </Field>
            </>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={decision === "reject" ? "danger" : "primary"} disabled={busy}>
              {busy ? "Recording on blockchain…" : decision === "approve" ? "Approve" : "Reject batch"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Retailer marks a batch as sold. */
export function SoldModal({ batch, onClose, onDone }: { batch: Batch | null; onClose: () => void; onDone: (r: TxResponse) => void }) {
  const { busy, error, run } = useAction();
  return (
    <Modal open={batch !== null} onClose={onClose} title="Mark as sold">
      {batch && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => api<TxResponse>(`/batches/${batch.code}/sold`, { method: "POST", json: { location: f.get("location") } }), onDone);
          }}
        >
          <p className="text-sm text-muted">
            Records the final step for <span className="font-medium text-foreground">{batch.product}</span> ({batch.code}).
          </p>
          <Field label="Store location">
            <Input name="location" required minLength={2} maxLength={100} placeholder="e.g. FC Road, Pune" />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording on blockchain…" : "Mark sold"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
