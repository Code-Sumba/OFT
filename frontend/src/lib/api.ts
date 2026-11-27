"use client";

import { useCallback, useEffect, useState } from "react";

/** Error from the backend, carrying its HTTP status and field details. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** "field: message" lines for validation errors, else the plain message. */
  get readable(): string {
    if (Array.isArray(this.details) && this.details.length) {
      return this.details.map((d: { field?: string; message?: string }) => `${d.field}: ${d.message}`).join("; ");
    }
    return this.message;
  }
}

/** Calls the backend through the same-origin /api rewrite (the auth cookie travels automatically). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      credentials: "same-origin",
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.details);
  }
  return body.data as T;
}

export async function uploadFile(file: File): Promise<{ cid: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  return api("/upload", { method: "POST", body: form });
}

/** Minimal data-loading hook: { data, error, loading, reload }. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const key = path === null ? null : `${path}#${tick}`;
  // Results remember which request they answer, so "loading" is derived instead of set in the effect.
  const [result, setResult] = useState<{ key: string; data: T | null; error: ApiError | null } | null>(null);

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((error: ApiError) => !cancelled && setResult({ key, data: null, error }));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = key !== null && result?.key !== key;
  // Keep showing the previous data while a reload is in flight (no flicker).
  return { data: result?.data ?? null, error: loading ? null : (result?.error ?? null), loading, reload };
}
