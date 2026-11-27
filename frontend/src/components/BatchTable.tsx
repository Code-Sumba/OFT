import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDate } from "@/lib/format";
import type { Batch } from "@/lib/types";
import { Empty, StagePill, StatusPill, TrustPill } from "./ui";

/** Responsive batch list: table on wide screens, cards on phones. */
export function BatchTable({ batches, actions, empty }: { batches: Batch[]; actions?: (b: Batch) => ReactNode; empty: ReactNode }) {
  if (batches.length === 0) return <Empty>{empty}</Empty>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="eyebrow border-b-2 border-foreground/70">
            <tr>
              <th className="py-2 pr-3 font-medium">Batch</th>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Harvest</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Stage</th>
              <th className="py-2 pr-3 font-medium">Trust</th>
              {actions && <th className="py-2 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/70">
            {batches.map((b) => (
              <tr key={b.code} className="align-middle transition-colors hover:bg-background/70">
                <td className="py-3 pr-3">
                  <Link href={`/dashboard/batches/${b.code}`} className="code-tag whitespace-nowrap text-xs text-brand hover:underline">
                    {b.code}
                  </Link>
                  {!b.onChain && <span className="ml-2 text-xs text-warn">(confirming…)</span>}
                </td>
                <td className="py-3 pr-3">
                  <span className="font-medium">{b.product}</span>
                  <span className="block text-xs text-muted">
                    {b.quantity} {b.unit} · {b.origin}
                  </span>
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">{fmtDate(b.harvestDate)}</td>
                <td className="py-3 pr-3">
                  <StatusPill status={b.status} expired={b.certificate.expired} />
                </td>
                <td className="py-3 pr-3">
                  <StagePill stage={b.stage} />
                </td>
                <td className="py-3 pr-3">
                  <TrustPill score={b.trustScore} />
                </td>
                {actions && <td className="py-3 text-right whitespace-nowrap">{actions(b)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {batches.map((b) => (
          <li key={b.code} className="border border-rule p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{b.product}</p>
                <Link href={`/dashboard/batches/${b.code}`} className="code-tag text-xs text-brand">
                  {b.code}
                </Link>
              </div>
              <TrustPill score={b.trustScore} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill status={b.status} expired={b.certificate.expired} />
              <StagePill stage={b.stage} />
            </div>
            {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(b)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
