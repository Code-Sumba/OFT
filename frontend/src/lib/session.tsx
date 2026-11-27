"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import type { Role, User } from "./types";

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : `/dashboard/${role}`);

const SessionContext = createContext<User | null>(null);

/** The logged-in user; only usable inside <RequireSession>. */
export function useUser(): User {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useUser must be used inside <RequireSession>");
  return user;
}

/**
 * Loads the current user and renders children only for allowed roles.
 * Not logged in → /login; wrong role → that user's own home.
 */
export function RequireSession({ roles, children, fallback }: { roles?: Role[]; children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Callers pass inline arrays; key the effect on the role names, not the array identity.
  const rolesKey = roles?.join(",") ?? "";

  useEffect(() => {
    const allowed = rolesKey ? (rolesKey.split(",") as Role[]) : null;
    let cancelled = false;
    api<{ user: User }>("/auth/me")
      .then(({ user }) => {
        if (cancelled) return;
        if (allowed && !allowed.includes(user.role)) router.replace(homeFor(user.role));
        else setUser(user);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) router.replace("/login");
        else setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [rolesKey, router]);

  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!user) return <>{fallback}</>;
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export async function logout(router: ReturnType<typeof useRouter>) {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  router.replace("/login");
}
