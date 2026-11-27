import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";

/** Login / sign-up layout: the form beside a short note on who uses the platform. */
export function AuthFrame({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-12 md:grid-cols-[1fr_1.1fr] md:items-start md:py-20">
        <div className="md:pt-6">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-4xl leading-tight">{title}</h1>
          <div className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{intro}</div>
          <ul className="mt-8 hidden max-w-sm border-t border-rule text-sm md:block">
            {[
              ["Farmers", "register harvests"],
              ["Certifiers", "approve or reject"],
              ["Processors, distributors, retailers", "record hand-overs"],
              ["Admins", "approve accounts and review alerts"],
            ].map(([who, what]) => (
              <li key={who} className="flex justify-between gap-4 border-b border-rule py-2.5">
                <span className="font-medium">{who}</span>
                <span className="text-right text-muted">{what}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-foreground/70 bg-surface p-6 shadow-[6px_6px_0_var(--rule)] sm:p-8">{children}</div>
      </main>
    </>
  );
}
