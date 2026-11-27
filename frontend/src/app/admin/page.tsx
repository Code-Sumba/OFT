"use client";

import Link from "next/link";
import { useState } from "react";
import { ActivityChart, GasChart } from "@/components/AdminCharts";
import { AppShell } from "@/components/AppShell";
import { BatchTable } from "@/components/BatchTable";
import { Button, Card, Empty, Notice, Pill, Select, Spinner, TrustPill } from "@/components/ui";
import { ApiError, api, useApi } from "@/lib/api";
import { ROLE_LABEL, STAGE_LABEL, fmtDateTime } from "@/lib/format";
import type { Analytics, Batch, FraudAlert, GasReport, Stage, User } from "@/lib/types";

const TABS = ["Overview", "Users", "Fraud alerts", "Batches", "Gas analysis"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  return (
    <AppShell roles={["admin"]}>
      <Admin />
    </AppShell>
  );
}

function Admin() {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin panel</h1>
        <p className="text-sm text-muted">Approve participants, watch for suspicious batches and track platform activity.</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-rule" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Overview" && <Overview onGo={setTab} />}
      {tab === "Users" && <Users />}
      {tab === "Fraud alerts" && <Alerts />}
      {tab === "Batches" && <AllBatches />}
      {tab === "Gas analysis" && <Gas />}
    </div>
  );
}

function Overview({ onGo }: { onGo: (t: Tab) => void }) {
  const { data, error, loading } = useApi<Analytics>("/admin/analytics");
  if (loading) return <Spinner />;
  if (error || !data) return <Notice kind="error">{error?.message ?? "Could not load analytics"}</Notice>;

  const pendingUsers = data.users.byStatus.pending ?? 0;
  const openAlerts = (data.openAlerts.high ?? 0) + (data.openAlerts.medium ?? 0);
  const stages: Stage[] = ["farmer", "processor", "distributor", "retailer", "sold"];
  const maxStage = Math.max(1, ...stages.map((s) => data.batches.byStage[s] ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Batches tracked" value={data.batches.total} />
        <Tile label="Average trust score" value={data.batches.averageTrustScore ?? "—"} />
        <Tile label="Open fraud alerts" value={openAlerts} tone={openAlerts ? "red" : undefined} action={openAlerts ? () => onGo("Fraud alerts") : undefined} />
        <Tile label="Users awaiting approval" value={pendingUsers} tone={pendingUsers ? "amber" : undefined} action={pendingUsers ? () => onGo("Users") : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="On-chain activity (last 14 days)" className="lg:col-span-2">
          <ActivityChart daily={data.daily} />
        </Card>
        <Card title="Batches by stage">
          <ul className="space-y-3">
            {stages.map((s) => {
              const n = data.batches.byStage[s] ?? 0;
              return (
                <li key={s} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{STAGE_LABEL[s]}</span>
                    <span className="tabular-nums text-muted">{n}</span>
                  </div>
                  <div className="h-2 bg-border/60">
                    <div className="h-2 bg-brand" style={{ width: `${(n / maxStage) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 border-t border-border pt-4 text-sm">
            <p className="mb-2 font-medium">Participants</p>
            <ul className="grid grid-cols-2 gap-1 text-muted">
              {(["farmer", "certifier", "processor", "distributor", "retailer", "admin"] as const).map((r) => (
                <li key={r}>
                  {ROLE_LABEL[r]}: <span className="tabular-nums text-foreground">{data.users.byRole[r] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, tone, action }: { label: string; value: number | string; tone?: "red" | "amber"; action?: () => void }) {
  const color = tone === "red" ? "text-danger" : tone === "amber" ? "text-warn" : "";
  return (
    <div className="border border-border border-t-2 border-t-foreground/70 bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-display text-4xl font-semibold tabular-nums ${color}`}>{value}</p>
      {action && (
        <button onClick={action} className="mt-1 text-xs text-brand hover:underline">
          Review →
        </button>
      )}
    </div>
  );
}

function Users() {
  const [status, setStatus] = useState("pending");
  const users = useApi<{ users: User[] }>(`/admin/users${status ? `?status=${status}` : ""}`);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setUserStatus(id: string, next: "approved" | "blocked") {
    setBusyId(id);
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", json: { status: next } });
      users.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Participants"
      actions={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Filter by status">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="blocked">Blocked</option>
          <option value="">All</option>
        </Select>
      }
    >
      {error && (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {users.loading && !users.data ? (
        <Spinner />
      ) : !users.data?.users.length ? (
        <Empty>No {status || ""} users.</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {users.data.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {u.name} <span className="font-normal text-muted">· {ROLE_LABEL[u.role]}</span>
                </p>
                <p className="text-xs text-muted">
                  {u.email}
                  {u.organisation ? ` · ${u.organisation}` : ""} · joined {fmtDateTime(u.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={u.status === "approved" ? "green" : u.status === "blocked" ? "red" : "amber"}>{u.status}</Pill>
                {u.role !== "admin" && u.status !== "approved" && (
                  <Button onClick={() => setUserStatus(u.id, "approved")} disabled={busyId === u.id}>
                    Approve
                  </Button>
                )}
                {u.role !== "admin" && u.status !== "blocked" && (
                  <Button variant="secondary" onClick={() => setUserStatus(u.id, "blocked")} disabled={busyId === u.id}>
                    Block
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Alerts() {
  const [resolved, setResolved] = useState("false");
  const alerts = useApi<{ alerts: FraudAlert[] }>(`/admin/fraud-alerts${resolved ? `?resolved=${resolved}` : ""}`);

  async function dismiss(id: number) {
    await api(`/admin/fraud-alerts/${id}`, { method: "PATCH" }).catch(() => undefined);
    alerts.reload();
  }

  return (
    <Card
      title="Fraud alerts"
      actions={
        <Select value={resolved} onChange={(e) => setResolved(e.target.value)} className="w-40" aria-label="Filter alerts">
          <option value="false">Open</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </Select>
      }
    >
      {alerts.loading && !alerts.data ? (
        <Spinner />
      ) : !alerts.data?.alerts.length ? (
        <Empty>{resolved === "false" ? "No open alerts. Every batch passes the fraud rules." : "No alerts."}</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.data.alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="max-w-2xl">
                <p className="flex flex-wrap items-center gap-2">
                  <Pill tone={a.severity === "high" ? "red" : "amber"}>
                    {a.severity === "high" ? "▲ High" : "● Medium"} · {a.rule}
                  </Pill>
                  <Link href={`/dashboard/batches/${a.batch_code}`} className="code-tag text-xs text-brand hover:underline">
                    {a.batch_code}
                  </Link>
                  <span className="font-medium">{a.product}</span>
                  <TrustPill score={a.trust_score} />
                </p>
                <p className="mt-1 text-muted">{a.details}</p>
                <p className="text-xs text-muted">{fmtDateTime(a.created_at)}</p>
              </div>
              {!a.resolved && (
                <Button variant="secondary" onClick={() => dismiss(a.id)} title="Dismiss after review; it reopens if the rule still triggers">
                  Dismiss
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AllBatches() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const batches = useApi<{ batches: Batch[] }>(`/batches${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  return (
    <Card
      title="All batches"
      actions={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code or product"
            className="w-52 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
            aria-label="Search batches"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      }
    >
      {batches.loading && !batches.data ? <Spinner /> : <BatchTable batches={batches.data?.batches ?? []} empty="No batches found." />}
    </Card>
  );
}

function Gas() {
  const { data, error, loading } = useApi<{ report: GasReport }>("/admin/gas-report");
  if (loading) return <Spinner />;
  if (error || !data) return <Notice kind="warn">{error?.message ?? "Gas report not available"}</Notice>;
  return (
    <Card title="Gas comparison: naive vs hybrid storage">
      <GasChart report={data.report} />
    </Card>
  );
}
