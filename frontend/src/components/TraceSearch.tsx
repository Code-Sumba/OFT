"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "./ui";

/** "Enter a batch code" box for people without a QR scanner. */
export function TraceSearch() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c) router.push(`/trace/${encodeURIComponent(c)}`);
      }}
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="OT-2026-______"
        aria-label="Batch code"
        spellCheck={false}
        autoCapitalize="characters"
        className="code-tag !py-2.5 text-base uppercase tracking-[0.08em]"
      />
      <Button type="submit" className="px-6">
        Verify
      </Button>
    </form>
  );
}
