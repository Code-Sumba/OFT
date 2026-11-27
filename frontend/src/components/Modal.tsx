"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Accessible modal built on the native <dialog> element. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] border border-foreground/70 bg-surface p-0 text-foreground shadow-[8px_8px_0_rgb(0_0_0/0.12)] backdrop:bg-[#1f2a22]/45"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <button onClick={onClose} className="px-1.5 py-0.5 text-muted hover:text-foreground" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  );
}
