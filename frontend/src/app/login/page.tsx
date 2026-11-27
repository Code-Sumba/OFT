"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { Button, Field, Input, Notice } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { homeFor } from "@/lib/session";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/login", {
        method: "POST",
        json: { email: form.get("email"), password: form.get("password") },
      });
      router.replace(homeFor(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : "Login failed");
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Participants"
      title="Log in to your ledger"
      intro="Shoppers don't need an account: the QR code on the pack opens the record directly."
    >
          <h2 className="mb-6 text-xl font-medium">Log in</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            New participant?{" "}
            <Link href="/register" className="text-brand hover:underline">
              Create an account
            </Link>
          </p>
    </AuthFrame>
  );
}
