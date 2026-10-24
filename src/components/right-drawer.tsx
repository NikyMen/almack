"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Overlay } from "@/components/overlay";

export function RightDrawer({ title, open, onClose, children, width = "max-w-md" }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const cerrar = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [open, onClose]);
  if (!open) return null;
  return <Overlay className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose}>
    <aside className={`flex h-full w-full ${width} flex-col overflow-hidden bg-white shadow-2xl`} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  </Overlay>;
}
