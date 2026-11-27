import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { BAND_LABEL, STAGE_LABEL, STATUS_LABEL, bandFor, shortHash } from "@/lib/format";
import type { BatchStatus, Stage, TrustBand } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-on-brand shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-brand-strong",
    secondary: "border border-rule bg-surface hover:border-brand hover:text-brand-strong",
    danger: "bg-danger text-on-brand hover:opacity-90",
    ghost: "hover:bg-brand-soft",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border border-border bg-surface p-5", className)}>
      {(title || actions) && (
        <div className="-mx-5 -mt-5 mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          {title && <h2 className="text-[1.05rem] font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-rule bg-background/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "success" | "warn" | "error"; children: ReactNode }) {
  const styles = {
    info: "border-l-rule bg-background",
    success: "border-l-brand bg-brand-soft text-brand-strong",
    warn: "border-l-warn bg-warn-soft text-warn",
    error: "border-l-danger bg-danger-soft text-danger",
  }[kind];
  return <div className={cx("border-l-[3px] px-3 py-2.5 text-sm", styles)}>{children}</div>;
}

export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "gray"; children: ReactNode }) {
  const styles = {
    green: "border-brand/35 text-brand-strong",
    amber: "border-warn/40 text-warn",
    red: "border-danger/40 text-danger",
    gray: "border-rule text-muted",
  }[tone];
  // Tag like a printed label: hairline box with a square colour mark
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[0.72rem] font-medium whitespace-nowrap", styles)}>
      <span className="h-1.5 w-1.5 shrink-0 bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function StatusPill({ status, expired }: { status: BatchStatus; expired?: boolean }) {
  if (status === "certified" && expired) return <Pill tone="amber">Certificate expired</Pill>;
  const tone = status === "certified" ? "green" : status === "rejected" ? "red" : "amber";
  return <Pill tone={tone}>{STATUS_LABEL[status]}</Pill>;
}

export function StagePill({ stage }: { stage: Stage }) {
  return <Pill tone={stage === "sold" ? "gray" : "green"}>{STAGE_LABEL[stage]}</Pill>;
}

const BAND_TONE: Record<TrustBand, "green" | "amber" | "red"> = { verified: "green", caution: "amber", suspicious: "red" };

export function TrustPill({ score }: { score: number }) {
  const band = bandFor(score);
  return (
    <Pill tone={BAND_TONE[band]}>
      {score} · {BAND_LABEL[band]}
    </Pill>
  );
}

/** Trust score dial: 20 ticks, filled up to the score, like a scale on a weighing machine. */
export function TrustGauge({ score, band }: { score: number; band: TrustBand }) {
  const color = { verified: "var(--brand)", caution: "var(--warn)", suspicious: "var(--danger)" }[band];
  const ticks = 20;
  const lit = Math.round((score / 100) * ticks);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Trust score ${score} of 100`}>
        {Array.from({ length: ticks }, (_, i) => {
          const a = ((i / ticks) * 300 - 240) * (Math.PI / 180); // 300° sweep, gap at the bottom
          const [r1, r2] = [37, 47];
          return (
            <line
              key={i}
              x1={50 + r1 * Math.cos(a)}
              y1={50 + r1 * Math.sin(a)}
              x2={50 + r2 * Math.cos(a)}
              y2={50 + r2 * Math.sin(a)}
              stroke={i < lit ? color : "var(--border)"}
              strokeWidth={i < lit ? 3.4 : 2.4}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold leading-none tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="eyebrow mt-1">of 100</span>
      </div>
    </div>
  );
}

export function TxLinkView({ hash, url }: { hash: string | null; url: string | null }) {
  if (!hash) return <span className="text-muted">pending</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand underline decoration-rule underline-offset-2 hover:decoration-brand">
      {shortHash(hash)} ↗
    </a>
  ) : (
    <span className="font-mono text-xs">{shortHash(hash)}</span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-pulse bg-brand" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="ruled border border-dashed border-rule px-4 py-10 text-center text-sm text-muted">{children}</p>;
}
