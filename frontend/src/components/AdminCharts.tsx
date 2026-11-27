"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics, GasReport } from "@/lib/types";

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false };
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "var(--brand-soft)", opacity: 0.6 },
};

const ACTIVITY = [
  { key: "registered", label: "Registered", color: "var(--series-1)" },
  { key: "certified", label: "Certified / rejected", color: "var(--series-2)" },
  { key: "transferred", label: "Transferred", color: "var(--series-3)" },
  { key: "sold", label: "Sold", color: "var(--series-4)" },
] as const;

/** Stacked daily on-chain events (last 14 days), with a table view for accessibility. */
export function ActivityChart({ daily }: { daily: Analytics["daily"] }) {
  const [table, setTable] = useState(false);
  const data = daily.map((d) => ({ ...d, day: d.date.slice(5) }));
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setTable((t) => !t)} className="text-xs text-brand hover:underline">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Date</th>
                {ACTIVITY.map((a) => (
                  <th key={a.key} className="py-1 pr-3 text-right font-medium">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {daily.map((d) => (
                <tr key={d.date}>
                  <td className="py-1 pr-3">{d.date}</td>
                  {ACTIVITY.map((a) => (
                    <td key={a.key} className="py-1 pr-3 text-right tabular-nums">
                      {d[a.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="day" {...axis} axisLine={{ stroke: "var(--border)" }} />
              <YAxis allowDecimals={false} {...axis} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" iconSize={8} />
              {ACTIVITY.map((a, i) => (
                <Bar
                  key={a.key}
                  dataKey={a.key}
                  name={a.label}
                  stackId="a"
                  fill={a.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  radius={i === ACTIVITY.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const FN_LABEL: Record<string, string> = {
  registerBatch: "Register",
  certifyBatch: "Certify",
  transferBatch: "Transfer (1 hop)",
  markSold: "Mark sold",
};

/** Naive (everything on-chain) vs hybrid (CID on-chain, files on IPFS) gas per call. */
export function GasChart({ report }: { report: GasReport }) {
  const data = report.perCall.map((r) => ({ name: FN_LABEL[r.fn] ?? r.fn, naive: r.naive, hybrid: r.hybrid }));
  const fmt = (n: number) => n.toLocaleString("en-IN");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Gas saved per batch lifecycle" value={`${report.lifecycle.savingPct}%`} accent />
        <Stat label="Naive design (A)" value={`${fmt(report.lifecycle.naive)} gas`} sub={`≈ ${report.lifecycle.naivePol.toFixed(4)} POL at ${report.gasPriceGwei} gwei`} />
        <Stat label="Hybrid design (B)" value={`${fmt(report.lifecycle.hybrid)} gas`} sub={`≈ ${report.lifecycle.hybridPol.toFixed(4)} POL at ${report.gasPriceGwei} gwei`} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="name" {...axis} axisLine={{ stroke: "var(--border)" }} />
            <YAxis {...axis} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip {...tooltipStyle} formatter={(v) => `${fmt(Number(v))} gas`} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" iconSize={8} />
            <Bar dataKey="naive" name="Naive: all data on-chain" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="hybrid" name="Hybrid: CID on-chain + IPFS" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th className="py-1.5 font-medium">Function</th>
            <th className="py-1.5 text-right font-medium">Naive (A)</th>
            <th className="py-1.5 text-right font-medium">Hybrid (B)</th>
            <th className="py-1.5 text-right font-medium">Saving</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {report.perCall.map((r) => (
            <tr key={r.fn}>
              <td className="py-1.5">{FN_LABEL[r.fn] ?? r.fn}</td>
              <td className="py-1.5 text-right">{fmt(r.naive)}</td>
              <td className="py-1.5 text-right">{fmt(r.hybrid)}</td>
              <td className="py-1.5 text-right">{Math.round((1 - r.hybrid / r.naive) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        {report.note} Measured with Hardhat over {report.batches} batches · generated {new Date(report.generatedAt).toLocaleDateString("en-IN")}.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-brand/40 bg-brand-soft" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold ${accent ? "text-brand-strong" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
