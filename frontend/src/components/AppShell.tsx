"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ROLE_LABEL } from "@/lib/format";
import { RequireSession, homeFor, logout, useUser } from "@/lib/session";
import type { Role } from "@/lib/types";
import { Logo } from "./SiteHeader";
import { Spinner } from "./ui";

/** Logged-in layout: header with the user's role, then the page. */
export function AppShell({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  return (
    <RequireSession
      roles={roles}
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4">
          <Spinner />
        </div>
      }
    >
      <ShellHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </RequireSession>
  );
}

function ShellHeader() {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const home = homeFor(user.role);

  return (
    <header className="no-print border-b border-rule bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 sm:gap-5">
          <Logo />
          <Link
            href={home}
            className={`border-b-2 px-1 py-1.5 text-sm font-medium ${pathname === home ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {user.role === "admin" ? "Admin panel" : "Dashboard"}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-right sm:block">
            <span className="block font-medium leading-tight">{user.name}</span>
            <span className="eyebrow block !text-[0.62rem]">
              {ROLE_LABEL[user.role]}
              {user.organisation ? ` · ${user.organisation}` : ""}
            </span>
          </span>
          <button onClick={() => logout(router)} className="rounded-md border border-rule px-3 py-1.5 font-medium hover:border-foreground">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
