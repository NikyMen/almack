"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { operarCaja } from "@/app/caja-actions";
import { money } from "@/lib/format";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { ExtraccionCaja } from "@/components/extraccion-caja";
import type { cajaTurnos, cajaExtracciones } from "@/db/schema";
import type { resumenCaja, saldoUltimoCierre } from "@/lib/caja";
type Turno = typeof cajaTurnos.$inferSelect;
function fecha(value: Date | null) {
  return value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(value) : "—";
}
export function CajaTurnoPanel({ turno, resumen, historial, sucursal, anterior, extracciones }: { anterior: Awaited<ReturnType<typeof saldoUltimoCierre>>; extracciones: (typeof cajaExtracciones.$inferSelect)[]; turno: Turno | null; resumen: Awaited<ReturnType<typeof resumenCaja>> | null; historial: Turno[]; sucursal: string }) {
  const [usarAnterior, setUsarAnterior] = useState(Boolean(anterior));
  const [modo, setModo] = useState<"movimiento" | "cerrar" | null>(null);
  const [error, setError] = useState("");
  const [contado, setContado] = useState("");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  function enviar(fd: FormData, operacion: "abrir" | "movimiento" | "cerrar") {
    setError("");
    iniciar(async () => {
      const raw = String(fd.get("monto") ?? "").trim();
      if (!raw && !(operacion === "abrir" && usarAnterior)) { setError("Ingresá el importe."); return; }
      const r = await operarCaja({ operacion, usarSaldoAnterior: operacion === "abrir" && usarAnterior, turnoId: turno?.id, monto: Number(raw), tipo: String(fd.get("tipo") ?? ""), motivo: String(fd.get("motivo") ?? "") });
      if (!r.ok) { setError(r.error); return; }
      setModo(null); setContado(""); router.refresh();
    });
  }
  return <div className="mb-4 space-y-2">
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-4 py-2 text-white">
        <div><p className="text-xs uppercase tracking-widest text-lime">{sucursal}</p><h2 className="text-base font-semibold">{turno ? `Caja abierta · turno #${turno.id}` : "Caja cerrada"}</h2></div>
        {turno && <p className="text-sm text-white/70">Abrió {turno.responsable} · {fecha(turno.abiertoEn)}</p>}
      </div>
      <div className="p-3 sm:p-4">
        {!turno && anterior && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs uppercase tracking-wide text-slate-500">Saldo del último cierre · #{anterior.turnoId}</p><p className="mt-1 text-2xl font-bold text-navy">{money(anterior.disponible)}</p><p className="mt-1 text-xs text-slate-500">Contado: {money(anterior.contado)} · Extracciones posteriores: {money(anterior.extraido)}</p><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={usarAnterior} onChange={e => setUsarAnterior(e.target.checked)} />Iniciar con este saldo</label></div>}
        {!turno ? <form action={fd => enviar(fd, "abrir")} className="flex flex-wrap items-end gap-4">
          <div className="flex-1"><label className="label" htmlFor="fondo">Fondo inicial en efectivo</label><input id="fondo" disabled={usarAnterior} name="monto" type="number" min="0" step="0.01" required className="input" placeholder={usarAnterior && anterior ? money(anterior.disponible) : "0,00"} /><p className="mt-2 text-sm text-slate-500">Contá el dinero del cajón antes de comenzar a vender.</p></div>
          <button disabled={pendiente} className="btn-primary">{pendiente ? "Abriendo…" : "Abrir caja"}</button>
        </form> : resumen && <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[ ["Fondo inicial", turno.fondoInicial], ["Ventas en efectivo", resumen.efectivo], ["Ingresos / retiros", resumen.ingresos - resumen.retiros], ["Efectivo esperado", resumen.esperado] ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold tabular-nums text-navy">{money(Number(value))}</p></div>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">{resumen.cobros.filter(c => c.medio !== "efectivo").map(c => <span className="badge bg-slate-100 text-slate-600" key={c.medio}>{ETIQUETA_MEDIO[c.medio as MedioPago] ?? c.medio}: {money(c.total)}</span>)}<span className="text-xs text-slate-500">QR y tarjeta no suman efectivo al cajón.</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><button disabled={pendiente} className="btn-ghost border border-slate-200" onClick={() => {setModo("movimiento"); setError("");}}>Registrar ingreso</button><button disabled={pendiente} className="btn-primary" onClick={() => {setModo("cerrar"); setError("");}}>Arquear y cerrar</button><ExtraccionCaja turnoId={turno.id} disponible={resumen.esperado} /></div>
          {modo && <form key={modo} action={fd => enviar(fd, modo)} className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">{modo === "cerrar" ? "Arqueo del efectivo" : "Movimiento de efectivo"}</h3>
            {modo === "movimiento" && <div><label className="label" htmlFor="tipo">Tipo</label><select id="tipo" name="tipo" className="input"><option value="ingreso">Ingreso</option></select></div>}
            <div><label className="label" htmlFor="monto">{modo === "cerrar" ? "Efectivo contado en el cajón" : "Importe"}</label><input id="monto" name="monto" required type="number" min={modo === "cerrar" ? "0" : "0.01"} step="0.01" className="input" onChange={e => setContado(e.target.value)} /></div>
            {modo === "cerrar" && contado !== "" && <p className="text-sm font-medium">Diferencia: {money(Number(contado) - resumen.esperado)} · {Number(contado) > resumen.esperado ? "sobrante" : Number(contado) < resumen.esperado ? "faltante" : "caja cuadrada"}</p>}
            <div><label className="label" htmlFor="motivo">{modo === "cerrar" ? "Observaciones (obligatorias si hay diferencia)" : "Motivo"}</label><textarea id="motivo" name="motivo" className="input" maxLength={modo === "cerrar" ? 2000 : 500} required={modo === "movimiento" || (contado !== "" && Math.round(Number(contado)*100) !== Math.round(resumen.esperado*100))} /></div>
            <div className="flex gap-2"><button disabled={pendiente} className="btn-primary">{pendiente ? "Guardando…" : modo === "cerrar" ? "Confirmar cierre" : "Guardar movimiento"}</button><button type="button" disabled={pendiente} className="btn-ghost" onClick={() => setModo(null)}>Cancelar</button></div>
          </form>}
          {resumen.movimientos.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Movimientos del turno ({resumen.movimientos.length})</summary><div className="mt-2 divide-y divide-slate-100">{resumen.movimientos.map(m => <div key={m.id} className="flex justify-between gap-3 py-3 text-sm"><div><p>{m.motivo}</p><p className="text-xs text-slate-500">{m.responsable} · {fecha(m.fecha)}</p></div><span className="shrink-0 font-semibold">{m.tipo === "retiro" ? "−" : "+"}{money(m.monto)}</span></div>)}</div></details>}
        </>}
        {!turno && <div className="mt-3"><ExtraccionCaja turnoId={anterior?.turnoId ?? null} disponible={anterior?.disponible ?? 0} /></div>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
      </div>
    </section>
    <div className="grid items-start gap-2 sm:grid-cols-2">
    {extracciones.length > 0 && <details className="card px-4 py-2"><summary className="cursor-pointer font-medium">Últimas extracciones</summary><div className="mt-3 divide-y divide-slate-100">{extracciones.map(e => <div key={e.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{e.motivo}</p><p className="text-xs text-slate-500">{e.responsable} · {fecha(e.fecha)} · Caja {e.estadoCaja} · Turno #{e.turnoId}</p></div><span className="shrink-0 font-semibold">−{money(e.monto)}</span></div>)}</div></details>}
    {historial.length > 0 && <details className="card px-4 py-2"><summary className="cursor-pointer font-medium">Últimos cierres de esta sucursal</summary><div className="mt-3 space-y-3">{historial.map(t => <div className="rounded-xl border border-slate-200 p-4 text-sm" key={t.id}><div className="flex flex-wrap justify-between gap-2"><strong>Turno #{t.id} · {fecha(t.cerradoEn)}</strong><span className={t.diferencia ? "text-rose-600" : "text-emerald-600"}>Diferencia: {money(t.diferencia ?? 0)}</span></div><p className="mt-2">Esperado {money(t.efectivoEsperado ?? 0)} · Contado {money(t.efectivoContado ?? 0)}</p><p className="mt-1 text-slate-500">Abrió {t.responsable} · Cerró {t.cerradoPor}</p>{t.resumen && <p className="mt-2 text-slate-500">{(JSON.parse(t.resumen) as {medio:string;total:number}[]).map(c => `${ETIQUETA_MEDIO[c.medio as MedioPago] ?? c.medio}: ${money(c.total)}`).join(" · ")}</p>}{t.observaciones && <p className="mt-2">{t.observaciones}</p>}</div>)}</div></details>}
    </div>
  </div>;
}


