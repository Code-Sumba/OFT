"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

const ROLES = [
  ["farmer", "Farmer – I grow organic produce"],
  ["certifier", "Certifier – I inspect and certify"],
  ["processor", "Processor – I clean, pack or process"],
  ["distributor", "Distributor – I move goods in bulk"],
  ["retailer", "Retailer – I sell to consumers"],
] as const;

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/register", {
        method: "POST",
        json: {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          role: f.get("role"),
          organisation: f.get("organisation") || undefined,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Join the supply chain"
      title="One account per participant"
      intro="An admin checks each new account before it can record anything, so every entry on the ledger has a known owner."
    >
          {done ? (
            <div className="space-y-4">
              <h2 className="text-xl font-medium">Registration received</h2>
              <Notice kind="success">An admin will review and approve your account. You can log in once it is approved.</Notice>
              <Link href="/login" className="text-sm text-brand hover:underline">
                Go to login →
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-6 text-xl font-medium">Create an account</h2>
              <form onSubmit={onSubmit} className="space-y-4">
                <Field label="Full name">
                  <Input name="name" required minLength={2} maxLength={100} autoComplete="name" />
                </Field>
                <Field label="Organisation" hint="Farm, company or certification body (optional)">
                  <Input name="organisation" maxLength={150} autoComplete="organization" />
                </Field>
                <Field label="Role">
                  <Select name="role" required defaultValue="farmer">
                    {ROLES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" required autoComplete="email" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Password" hint="At least 8 characters">
                    <Input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
                  </Field>
                  <Field label="Confirm password">
                    <Input name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
                  </Field>
                </div>
                {error && <Notice kind="error">{error}</Notice>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Submitting…" : "Create account"}
                </Button>
              </form>
            </>
          )}
    </AuthFrame>
  );
}
