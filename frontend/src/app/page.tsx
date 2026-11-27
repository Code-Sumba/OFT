import { SiteHeader } from "@/components/SiteHeader";
import { TraceSearch } from "@/components/TraceSearch";

const ROUTE = [
  { who: "Farmer", what: "Registers the harvest and uploads the organic certificate." },
  { who: "Certifier", what: "Inspects, then approves or rejects, and sets an expiry date." },
  { who: "Processor", what: "Takes custody. The hand-over is written to the ledger." },
  { who: "Distributor", what: "Next in line. Stages can't be skipped." },
  { who: "Retailer", what: "Prints the QR label and records the sale." },
];

const CHECKS = [
  { id: "R1", label: "No organic certificate", effect: "−40" },
  { id: "R2", label: "Records differ from the blockchain", effect: "−30" },
  { id: "R3", label: "Certificate has expired", effect: "−25" },
  { id: "R4", label: "More than 3 hand-overs within an hour", effect: "up to −20" },
  { id: "R5", label: "Rejected by the certifier", effect: "−60" },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 overflow-x-clip">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-20">
          <div>
            <p className="eyebrow">Organic produce · recorded on Polygon</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.05] sm:text-6xl">
              Where was it grown,
              <br />
              and <em className="font-normal text-brand">who</em> says it&rsquo;s organic?
            </h1>
            <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
              Every batch carries its own record, from the field to the shelf. Scan the code on the pack, or type it below, to see the
              certificate, each hand-over, and whether anything has been changed since.
            </p>
            <div className="mt-8">
              <TraceSearch />
              <p className="mt-2 text-xs text-muted">The code is printed under the QR, for example <span className="code-tag">OT-2026-7KQ3MZ</span>.</p>
            </div>
          </div>

          {/* Sample label: what a shopper sees on the pack */}
          <figure className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-3 -z-10 rotate-2 border border-rule bg-accent-soft/50" aria-hidden />
            <div className="border border-foreground/80 bg-surface p-6 shadow-[6px_6px_0_var(--rule)]">
              <div className="flex items-start justify-between gap-4 border-b border-dashed border-rule pb-4">
                <div>
                  <p className="eyebrow">Batch</p>
                  <p className="code-tag mt-1 text-lg">OT-2026-7KQ3MZ</p>
                </div>
                <span className="stamp text-brand">✓ Organic</span>
              </div>
              <dl className="ruled mt-4 grid grid-cols-[auto_1fr] gap-x-6 text-sm leading-7">
                <dt className="text-muted">Product</dt>
                <dd className="font-medium">Basmati rice, 250 kg</dd>
                <dt className="text-muted">Grown at</dt>
                <dd>Dehradun, Uttarakhand</dd>
                <dt className="text-muted">Certified until</dt>
                <dd>30 Jun 2027</dd>
                <dt className="text-muted">Trust score</dt>
                <dd className="font-semibold text-brand">100 / 100</dd>
              </dl>
              <ol className="mt-5 flex items-center gap-1" aria-label="Journey">
                {["Farm", "Cert.", "Process", "Distrib.", "Shelf"].map((s, i) => (
                  <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="flex w-full items-center">
                      <span className={`h-px flex-1 ${i === 0 ? "bg-transparent" : "bg-brand"}`} />
                      <span className="h-2.5 w-2.5 rotate-45 bg-brand" />
                      <span className={`h-px flex-1 ${i === 4 ? "bg-transparent" : "bg-brand"}`} />
                    </span>
                    <span className="text-[0.65rem] text-muted">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <figcaption className="mt-4 text-center text-xs text-muted">Sample label, for illustration</figcaption>
          </figure>
        </section>

        {/* The route */}
        <section className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-3xl">Five hands, one record</h2>
              <p className="max-w-md text-sm text-muted">
                Each step is signed onto the blockchain in strict order. Nobody can skip a stage or rewrite one afterwards.
              </p>
            </div>
            <ol className="mt-10 grid gap-8 md:grid-cols-5 md:gap-0">
              {ROUTE.map((r, i) => (
                <li key={r.who} className="relative md:pr-6">
                  <div className="mb-4 flex items-center">
                    <span className="code-tag flex h-9 w-9 shrink-0 items-center justify-center border border-foreground bg-background text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {i < ROUTE.length - 1 && <span className="ml-3 hidden h-px flex-1 border-t border-dashed border-rule md:block" aria-hidden />}
                  </div>
                  <h3 className="text-lg font-medium">{r.who}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{r.what}</p>
                </li>
              ))}
            </ol>
            <p className="mt-10 border-t border-dashed border-rule pt-6 text-sm">
              <span className="font-semibold">Then the shopper.</span>{" "}
              <span className="text-muted">No app and no account: the QR opens the full journey in the browser.</span>
            </p>
          </div>
        </section>

        {/* What the record catches */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl">What lowers the trust score</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every time a batch is looked up, it is checked against the blockchain. Each problem found takes points off a score of 100.
              80 or more is <span className="font-medium text-brand">verified</span>, 50 to 79 is{" "}
              <span className="font-medium text-warn">caution</span>, and below 50 is{" "}
              <span className="font-medium text-danger">suspicious</span>.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                <th className="eyebrow py-2 pr-4 !text-foreground">Rule</th>
                <th className="eyebrow py-2 pr-4 !text-foreground">Check</th>
                <th className="eyebrow py-2 text-right !text-foreground">Points</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map((c) => (
                <tr key={c.id} className="border-b border-rule">
                  <td className="code-tag py-3 pr-4 text-muted">{c.id}</td>
                  <td className="py-3 pr-4">{c.label}</td>
                  <td className="code-tag py-3 text-right text-danger">{c.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted">
          <span>Final-year Computer Engineering project</span>
          <span className="code-tag">Testnet prototype · Polygon Amoy</span>
        </div>
      </footer>
    </>
  );
}
