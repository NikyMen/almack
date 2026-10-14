"use client";
import { Overlay } from "@/components/overlay";

// Selector de medio de pago con atajos de teclado. En un mostrador con lector
// de códigos el mouse sobra: se escanea, se aprieta Enter y se cierra la venta
// con una tecla. Las teclas son configurables (ver ConfigModal).

import { useEffect, useState } from "react";
import { Loader2, X, Keyboard } from "lucide-react";
import { moneyPreciso } from "@/lib/format";
import { useAjustes } from "@/lib/ajustes";
import { useNav } from "@/components/nav-context";
import { MEDIOS_PAGO_UI, type MedioPago } from "@/lib/medios-pago";

export function SelectorPago({
  total,
  unidades,
  pendiente,
  error,
  onSelect,
  onClose,
  titulo = "¿Cómo paga?",
}: {
  total: number;
  unidades: number;
  pendiente: boolean;
  error?: string;
  onSelect: (medio: MedioPago, efectivoRecibido?: number) => void;
  onClose: () => void;
  titulo?: string;
}) {
  const [ajustes] = useAjustes();
  const { configAbierta, setConfigAbierta } = useNav();
  const [ingresandoEfectivo, setIngresandoEfectivo] = useState(false);
  const [recibido, setRecibido] = useState("");
  const montoRecibido = Number(recibido);
  const vuelto = Number.isFinite(montoRecibido) ? Math.round((montoRecibido - total) * 100) / 100 : 0;

  function elegir(medio: MedioPago) {
    if (medio === "efectivo") { setIngresandoEfectivo(true); return; }
    onSelect(medio);
  }

  const teclaDe = (medio: MedioPago) =>
    Object.entries(ajustes.teclasPago).find(([, m]) => m === medio)?.[0];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!pendiente) { if (ingresandoEfectivo) setIngresandoEfectivo(false); else onClose(); }
        return;
      }
      if (ingresandoEfectivo || configAbierta) return;
      if (pendiente || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const medio = ajustes.teclasPago[e.key];
      if (!medio) return;
      e.preventDefault();
      if (medio === "efectivo") setIngresandoEfectivo(true);
      else onSelect(medio as MedioPago);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ajustes.teclasPago, pendiente, onSelect, onClose, ingresandoEfectivo, configAbierta]);

  return (
    <Overlay className="overlay" onClick={() => !pendiente && onClose()}>
      <div className="sheet p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{ingresandoEfectivo ? "Cobro en efectivo" : titulo}</h3>
            <p className="text-sm text-slate-500">
              Total {moneyPreciso(total)} · {unidades} u.
            </p>
          </div>
          <button className="btn-ghost px-2 py-1.5" disabled={pendiente} onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!ingresandoEfectivo ? <div className="grid grid-cols-3 gap-2">
          {MEDIOS_PAGO_UI.map((m) => {
            const tecla = teclaDe(m.id);
            return (
              <button
                key={m.id}
                disabled={pendiente}
                onClick={() => elegir(m.id)}
                className="relative flex flex-col items-center gap-2 rounded-xl border border-slate-200 py-5 transition hover:border-lime hover:bg-lime/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tecla && <span className="kbd absolute right-1.5 top-1.5">{tecla}</span>}
                <m.icon className="h-6 w-6 text-navy" />
                <span className="text-sm font-medium">{m.label}</span>
              </button>
            );
          })}
        </div> : <form onSubmit={(e) => { e.preventDefault(); if (!pendiente && Number.isFinite(montoRecibido) && vuelto >= 0) onSelect("efectivo", montoRecibido); }} className="space-y-4">
          <label className="block text-sm font-medium">¿Con cuánto pagó el cliente?
            <input autoFocus className="input mt-2 text-lg tabular-nums" type="number" inputMode="decimal" min={total} step="0.01" required value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="Importe recibido" disabled={pendiente} />
          </label>
          {recibido && <div className={`rounded-xl p-4 ${vuelto < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
            <p className="text-xs">{vuelto < 0 ? "Falta" : "Vuelto para entregar"}</p>
            <p className="text-2xl font-bold tabular-nums">{moneyPreciso(Math.abs(vuelto))}</p>
          </div>}
          <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={pendiente} onClick={() => setIngresandoEfectivo(false)}>Volver</button><button type="submit" className="btn-primary flex-1 justify-center" disabled={pendiente || !recibido || vuelto < 0}>Confirmar cobro</button></div>
        </form>}

        {!ingresandoEfectivo && <button
          onClick={() => setConfigAbierta(true)}
          className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 underline underline-offset-2 hover:text-navy"
        >
          <Keyboard className="h-3.5 w-3.5" /> Editar atajos
        </button>}

        {pendiente && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Procesando cobro…
          </p>
        )}
        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </div>
    </Overlay>
  );
}
