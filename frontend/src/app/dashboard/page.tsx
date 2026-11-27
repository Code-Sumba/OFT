"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { homeFor } from "@/lib/session";
import type { User } from "@/lib/types";

/** /dashboard sends each user to their role's page. */
export default function DashboardIndex() {
  const router = useRouter();
  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(({ user }) => router.replace(homeFor(user.role)))
      .catch(() => router.replace("/login"));
  }, [router]);
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <Spinner />
    </div>
  );
}
