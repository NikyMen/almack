"use client";

// Tarjeta que viene hacia adelante sobre la pantalla, con el fondo borroso.
// La usan el detalle de cada sucursal y el de cada caja del mapa.

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Overlay } from "@/components/overlay";

export function TarjetaFlotante({ titulo, subtitulo, onCerrar, children, ancho = "max-w-3xl" }: {
  titulo: string; subtitulo?: string; onCerrar: () => void; children: ReactNode; ancho?: string;
}) {
  // Entra desde atrás: arranca chica y transparente y en el siguiente cuadro se acerca.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    const cerrar = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", cerrar); };
  }, [onCerrar]);
  // Los eventos de React atraviesan el portal: se cortan acá para que Escape o un
  // toque en la tarjeta no lleguen al mapa que está detrás.
  return <Overlay onClick={e => { e.stopPropagation(); onCerrar(); }} onPointerDown={e => e.stopPropagation()}
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onCerrar(); } }}
    className={`fixed inset-0 z-50 flex items-end justify-center p-0 outline-none transition-[background-color,backdrop-filter] duration-300 sm:items-center sm:p-6 ${visible ? "bg-slate-950/35 backdrop-blur-md" : "bg-slate-950/0 backdrop-blur-0"}`}>
    <section role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}
      style={{ maxHeight: "calc(var(--dialog-height, 100vh) - 1.5rem)" }}
      className={`flex w-full ${ancho} flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-300 ease-out motion-reduce:transition-none sm:rounded-3xl ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-[.92] opacity-0"}`}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          {subtitulo && <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{subtitulo}</p>}
          <h2 className="truncate text-lg font-bold text-navy">{titulo}</h2>
        </div>
        <button type="button" onClick={onCerrar} className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  </Overlay>;
}
