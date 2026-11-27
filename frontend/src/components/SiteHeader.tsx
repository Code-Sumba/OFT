import Link from "next/link";

/** Seal-style mark: a sprouting leaf inside a double ring, like a certification stamp. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 text-brand" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="16" cy="16" r="14.5" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11.5" strokeWidth="0.75" strokeDasharray="1.4 1.6" />
      <path d="M16 23v-8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 16c0-3.6 2.4-6 6-6 0 3.6-2.4 6-6 6Z" fill="currentColor" stroke="none" />
      <path d="M16 18.5c0-2.8-1.9-4.7-4.7-4.7 0 2.8 1.9 4.7 4.7 4.7Z" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Organic Trace home">
      <Mark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.15rem] font-semibold tracking-tight">Organic Trace</span>
        <span className="eyebrow mt-0.5 hidden !text-[0.58rem] sm:block">Farm · Ledger · Shelf</span>
      </span>
    </Link>
  );
}

/** Header for public pages (landing, login, trace). */
export function SiteHeader() {
  return (
    <header className="no-print border-b border-rule bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/login" className="whitespace-nowrap px-2 py-2 font-medium text-muted hover:text-foreground sm:px-3">
            Log in
          </Link>
          <Link
            href="/register"
            className="whitespace-nowrap rounded-md border border-foreground px-3 py-1.5 font-semibold hover:bg-foreground hover:text-background"
          >
            Join the chain
          </Link>
        </nav>
      </div>
    </header>
  );
}
