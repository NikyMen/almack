"use client";

// Preferencias del dispositivo: calidad del fondo animado, autocobrador y
// atajos de teclado del cobro. Todo se guarda en el navegador (ver lib/ajustes).

import { Monitor, Zap, Keyboard, X } from "lucide-react";
import { useAjustes, CALIDADES, AJUSTES_DEFAULT, type FondoCalidad } from "@/lib/ajustes";
import { useNav } from "@/components/nav-context";
import { MEDIOS_PAGO_UI } from "@/lib/medios-pago";

const TECLAS = ["1", "2", "3", "4", "5"];

export function ConfigModal() {
  const { configAbierta, setConfigAbierta } = useNav();
  const [ajustes, setAjustes] = useAjustes();

  if (!configAbierta) return null;

  function asignarTecla(tecla: string, medio: string) {
    // Una tecla, un medio: si la tecla ya estaba tomada, se libera la anterior.
    const siguiente: Record<string, string> = {};
    for (const [t, m] of Object.entries(ajustes.teclasPago)) {
      if (m !== medio) siguiente[t] = m;
    }
    if (tecla) siguiente[tecla] = medio;
    setAjustes({ teclasPago: siguiente });
  }

  const teclaDe = (medio: string) =>
    Object.entries(ajustes.teclasPago).find(([, m]) => m === medio)?.[0] ?? "";

  return (
    <div className="overlay" onClick={() => setConfigAbierta(false)}>
      <div className="sheet p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Configuración</h2>
            <p className="text-sm text-slate-500">Preferencias de este dispositivo.</p>
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={() => setConfigAbierta(false)} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fondo animado */}
        <section className="mb-6">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Monitor className="h-4 w-4 text-slate-500" /> Fondo animado
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Bajalo si notás la app lenta o el celular caliente. En equipos potentes podés subirlo.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CALIDADES.map((c) => {
              const activo = ajustes.fondoCalidad === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setAjustes({ fondoCalidad: c.id as FondoCalidad })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    activo ? "border-lime bg-lime/10" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="block text-[11px] leading-tight text-slate-500">{c.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Autocobrador */}
        <section className="mb-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-lime"
              checked={ajustes.autocobrador}
              onChange={(e) => setAjustes({ autocobrador: e.target.checked })}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-slate-500" /> Autocobrador
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Con esto activo, apretar Enter en el buscador vacío teniendo productos en el carrito
                abre directamente el cobro.
              </span>
            </span>
          </label>
        </section>

        {/* Atajos de cobro */}
        <section>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="h-4 w-4 text-slate-500" /> Atajos del cobro
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Tecla que confirma cada medio de pago en la pantalla de cobro.
          </p>
          <div className="space-y-2">
            {MEDIOS_PAGO_UI.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <m.icon className="h-4 w-4 text-slate-500" /> {m.label}
                </span>
                <select
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={teclaDe(m.id)}
                  onChange={(e) => asignarTecla(e.target.value, m.id)}
                >
                  <option value="">Sin atajo</option>
                  {TECLAS.map((t) => (
                    <option key={t} value={t}>
                      Tecla {t}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            className="mt-3 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-navy"
            onClick={() => setAjustes({ teclasPago: AJUSTES_DEFAULT.teclasPago })}
          >
            Restaurar atajos por defecto
          </button>
        </section>
      </div>
    </div>
  );
}
