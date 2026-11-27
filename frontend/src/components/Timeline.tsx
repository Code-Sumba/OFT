import { ROLE_LABEL, STAGE_LABEL, fmtDateTime } from "@/lib/format";
import type { BatchEvent, Party } from "@/lib/types";
import { TxLinkView } from "./ui";

const who = (p: Party | null) => (p ? `${p.name}${p.organisation ? `, ${p.organisation}` : ""}` : "Unknown participant");

function describe(e: BatchEvent): { title: string; body: string; tone: "green" | "red" | "gray" } {
  switch (e.type) {
    case "registered":
      return { title: "Harvest registered", body: `by ${who(e.to)} (${ROLE_LABEL.farmer})`, tone: "green" };
    case "certified":
      return { title: "Certified organic", body: `by ${who(e.from)}`, tone: "green" };
    case "rejected":
      return { title: "Certification rejected", body: `by ${who(e.from)}`, tone: "red" };
    case "transferred":
      return {
        title: `Handed over · ${e.stage ? STAGE_LABEL[e.stage] : ""}`,
        body: `${who(e.from)} → ${who(e.to)}${e.location ? ` · ${e.location}` : ""}`,
        tone: "green",
      };
    case "sold":
      return { title: "Sold to consumer", body: `by ${who(e.from)}${e.location ? ` · ${e.location}` : ""}`, tone: "gray" };
  }
}

/** Vertical journey of a batch; each step links to its blockchain transaction. */
export function Timeline({ events }: { events: BatchEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">No recorded events yet.</p>;
  return (
    <ol>
      {events.map((e, i) => {
        const d = describe(e);
        const mark = { green: "bg-brand", red: "bg-danger", gray: "bg-muted" }[d.tone];
        const last = i === events.length - 1;
        return (
          <li key={`${e.tx.hash}-${i}`} className="grid grid-cols-[1.25rem_1fr] gap-x-4 sm:grid-cols-[9.75rem_1.25rem_1fr]">
            <p className="code-tag hidden whitespace-nowrap pt-0.5 text-right text-[0.7rem] leading-5 text-muted sm:block">{fmtDateTime(e.time)}</p>
            <div className="flex flex-col items-center" aria-hidden>
              <span className={`mt-1.5 h-2.5 w-2.5 rotate-45 ${mark}`} />
              {!last && <span className="w-px flex-1 bg-rule" />}
            </div>
            <div className={last ? "" : "pb-6"}>
              <p className="text-sm font-semibold">{d.title}</p>
              <p className="text-sm text-muted">{d.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                <span className="code-tag sm:hidden">{fmtDateTime(e.time)}</span>
                <TxLinkView hash={e.tx.hash} url={e.tx.url} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
