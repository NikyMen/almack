"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { operarCaja } from "@/app/caja-actions";
import { money } from "@/lib/format";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { ExtraccionCaja } from "@/components/extraccion-caja";
import type { cajaTurnos, cajaExtracciones, cambiosPrecio } from "@/db/schema";
import type { resumenCaja, saldoUltimoCierre } from "@/lib/caja";
type Turno = typeof cajaTurnos.$inferSelect;
function fecha(value: Date | null) {
  return value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(value) : "—";
}
export function CajaTurnoPanel({ turno, resumen, cambios, sucursal, anterior, extracciones, puedeVerVentas, esAdmin }: { anterior: Awaited<ReturnType<typeof saldoUltimoCierre>>; extracciones: (typeof cajaExtracciones.$inferSelect)[]; turno: Turno | null; resumen: Awaited<ReturnType<typeof resumenCaja>> | null; cambios: (typeof cambiosPrecio.$inferSelect)[]; sucursal: string; puedeVerVentas: boolean; esAdmin: boolean }) {
  const [modo, setModo] = useState<"movimiento" | "cerrar" | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  function enviar(fd: FormData, operacion: "abrir" | "movimiento" | "cerrar") {
    setError("");
    iniciar(async () => {
      const raw = String(fd.get("monto") ?? "").trim();
      if (!raw) { setError("Ingresá el importe."); return; }
      const r = await operarCaja({ operacion, turnoId: turno?.id, monto: raw ? Number(raw) : undefined, tipo: String(fd.get("tipo") ?? ""), motivo: String(fd.get("motivo") ?? "") });
      if (!r.ok) { setError(r.error); return; }
      setModo(null); router.refresh();
    });
  }
  return <div className="mb-4 space-y-2">
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2 text-white">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2"><p className="text-xs uppercase tracking-widest text-lime">{sucursal}</p>{turno && <p className="text-xs text-slate-400">Abrió {turno.responsable} · {fecha(turno.abiertoEn)}</p>}</div><h2 className="text-sm font-semibold">{turno ? `Caja abierta · turno #${turno.id}` : "Caja cerrada"}</h2></div>
        {turno && resumen && <div className="flex flex-wrap items-center gap-1.5"><button disabled={pendiente} className="btn-ghost border border-white/20 bg-white px-2 py-1 text-xs text-navy" onClick={() => {setModo("movimiento"); setError("");}}>Registrar ingreso</button><button disabled={pendiente} className="btn-primary px-2 py-1 text-xs" onClick={() => {setModo("cerrar"); setError("");}}>Contar y cerrar</button>{esAdmin && <ExtraccionCaja turnoId={turno.id} disponible={resumen.esperado} />}</div>}
      </div>
      <div className="p-2 sm:p-3">
        {!turno && esAdmin && anterior && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs uppercase tracking-wide text-slate-500">Saldo registrado · cierre #{anterior.turnoId}</p><p className="mt-1 text-2xl font-bold text-navy">{money(anterior.disponible)}</p><p className="mt-1 text-xs text-slate-500">Contado al cerrar: {money(anterior.contado)} · Extracciones posteriores: {money(anterior.extraido)}</p></div>}
        {!turno ? <form action={fd => enviar(fd, "abrir")} className="flex flex-wrap items-end gap-4">
          <div className="min-w-48 flex-1"><label className="label" htmlFor="fondo">Efectivo contado para abrir</label><input id="fondo" name="monto" type="number" min="0" step="0.01" required className="input" placeholder="0,00" /><p className="mt-2 text-sm text-slate-500">Contá el dinero del cajón y cargá el importe que encontraste.</p></div>
          <button disabled={pendiente} className="btn-primary">{pendiente ? "Abriendo…" : "Abrir caja"}</button>
        </form> : resumen && <>
          {esAdmin && <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[ ["Fondo inicial", turno.fondoInicial], ["Ventas en efectivo", resumen.efectivo], ["Ingresos / retiros", resumen.ingresos - resumen.retiros] ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="text-base font-bold tabular-nums text-navy">{money(Number(value))}</p></div>)}
            {puedeVerVentas ? <Link href="/admin/ventas/historial" target="_blank" rel="noopener noreferrer" aria-label={`Efectivo esperado ${money(resumen.esperado)}. Abrir ventas históricas en otra ventana`} className="group rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-lime/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"><p className="text-xs text-slate-500 group-hover:text-navy">Efectivo esperado <span aria-hidden="true">↗</span></p><p className="text-base font-bold tabular-nums text-navy">{money(resumen.esperado)}</p></Link> : <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">Efectivo esperado</p><p className="text-base font-bold tabular-nums text-navy">{money(resumen.esperado)}</p></div>}
          </div>}
          {esAdmin && <div className="mt-2 flex flex-wrap items-center gap-2">{resumen.cobros.filter(c => c.medio !== "efectivo").map(c => <span className="badge bg-slate-100 text-slate-600" key={c.medio}>{ETIQUETA_MEDIO[c.medio as MedioPago] ?? c.medio}: {money(c.total)}</span>)}<span className="text-xs text-slate-500">QR y tarjeta no suman efectivo al cajón.</span></div>}
          {modo && <form key={modo} action={fd => enviar(fd, modo)} className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">{modo === "cerrar" ? "Arqueo del efectivo" : "Movimiento de efectivo"}</h3>
            {modo === "movimiento" && <div><label className="label" htmlFor="tipo">Tipo</label><select id="tipo" name="tipo" className="input"><option value="ingreso">Ingreso</option></select></div>}
            <div><label className="label" htmlFor="monto">{modo === "cerrar" ? "Efectivo contado en el cajón" : "Importe"}</label><input id="monto" name="monto" required type="number" min={modo === "cerrar" ? "0" : "0.01"} step="0.01" className="input" /></div>
            {modo === "cerrar" && <p className="text-sm text-slate-500">Ingresá el total contado sin consultar el saldo esperado. La diferencia quedará registrada para administración.</p>}
            <div><label className="label" htmlFor="motivo">{modo === "cerrar" ? "Observaciones (opcional)" : "Motivo"}</label><textarea id="motivo" name="motivo" className="input" maxLength={modo === "cerrar" ? 2000 : 500} required={modo === "movimiento"} /></div>
            <div className="flex gap-2"><button disabled={pendiente} className="btn-primary">{pendiente ? "Guardando…" : modo === "cerrar" ? "Confirmar cierre" : "Guardar movimiento"}</button><button type="button" disabled={pendiente} className="btn-ghost" onClick={() => setModo(null)}>Cancelar</button></div>
          </form>}
          {esAdmin && resumen.movimientos.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Movimientos del turno ({resumen.movimientos.length})</summary><div className="mt-2 divide-y divide-slate-100">{resumen.movimientos.map(m => <div key={m.id} className="flex justify-between gap-3 py-3 text-sm"><div><p>{m.motivo}</p><p className="text-xs text-slate-500">{m.responsable} · {fecha(m.fecha)}</p></div><span className="shrink-0 font-semibold">{m.tipo === "retiro" ? "−" : "+"}{money(m.monto)}</span></div>)}</div></details>}
        </>}
        {!turno && esAdmin && <div className="mt-3"><ExtraccionCaja turnoId={anterior?.turnoId ?? null} disponible={anterior?.disponible ?? 0} /></div>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
      </div>
    </section>
    <div className="grid items-start gap-2 sm:grid-cols-2">
    {esAdmin && extracciones.length > 0 && <details className="card px-4 py-2 sm:col-span-2"><summary className="cursor-pointer font-medium">Últimas extracciones</summary><div className="mt-3 divide-y divide-slate-100">{extracciones.map(e => <div key={e.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{e.motivo}</p><p className="text-xs text-slate-500">{e.responsable} · {fecha(e.fecha)} · Caja {e.estadoCaja} · Turno #{e.turnoId}</p>{e.saldoRestante !== null && <p className="text-xs text-slate-500">Quedó en caja: {money(e.saldoRestante)}</p>}</div><span className="shrink-0 font-semibold">−{money(e.monto)}</span></div>)}</div></details>}
    {esAdmin && <Link href="/admin/caja/historial" className="card px-4 py-3 font-medium text-navy hover:bg-slate-50">Historial de aperturas y cierres ↗</Link>}
    <details className="card px-4 py-2"><summary className="cursor-pointer font-medium">Cambios de precio ({cambios.length})</summary><div className="mt-3 space-y-3">{cambios.length === 0 && <p className="text-sm text-slate-500">Todavía no hay cambios de precio en esta sucursal.</p>}{cambios.map(c => { const d = JSON.parse(c.detalle) as { destino: string; producto?: string; anterior?: number; nuevo?: number; promocion?: string; productos?: { nombre: string; cantidad: number }[] }; return <div className="rounded-xl border border-slate-200 p-3 text-sm" key={c.id}><strong>Venta #{c.ventaId} · {fecha(c.fecha)}</strong><p className="text-slate-500">{c.usuario} · {ETIQUETA_MEDIO[c.medioPago as MedioPago] ?? c.medioPago}</p><p className="mt-1">{d.destino === "stock" ? `Se actualizó el precio en stock de ${d.producto}: ${money(d.anterior ?? 0)} → ${money(d.nuevo ?? 0)}` : `Promoción ${d.promocion}${d.producto ? ` · ${d.producto}: ${money(d.anterior ?? 0)} → ${money(d.nuevo ?? 0)}` : ` · ${d.productos?.map(p => `${p.nombre} (${p.cantidad})`).join(", ")}`}`}</p><p className="text-xs text-slate-500">Total: {money(c.totalAnterior)} → {money(c.totalNuevo)}</p></div>; })}</div></details>
    </div>
  </div>;
}


