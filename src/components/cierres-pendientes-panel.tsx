"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { revisarCierreDesdePanel } from "@/app/admin/(protected)/cierres-actions";
import { money } from "@/lib/format";

export type CierrePendientePanel = {
  id: number;
  sucursalId: number;
  sucursalNombre: string | null;
  cerradoPor: string | null;
  declaradoCierre: number | null;
  efectivoContado: number | null;
  efectivoEsperado: number | null;
  diferencia: number | null;
  observaciones: string;
  aperturaEstado: string;
};

type Revision = { turnoId: number; accion: "rectificar" | "anular" } | null;
export function CierresPendientesPanel({ cierres, total }: { cierres: CierrePendientePanel[]; total: number }) {
  const [revision, setRevision] = useState<Revision>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  function ejecutar(cierre: CierrePendientePanel, accion: "aprobar" | "rectificar" | "anular", fd?: FormData) {
    setError(""); setMensaje("");
    iniciar(async () => {
      const resultado = await revisarCierreDesdePanel({
        sucursalId: cierre.sucursalId, turnoId: cierre.id, accion,
        motivo: String(fd?.get("motivo") ?? ""),
        monto: accion === "rectificar" ? Number(fd?.get("monto")) : undefined,
      });
      if (!resultado.ok) return setError(resultado.error);
      setRevision(null);
      setMensaje(accion === "rectificar" ? `Conteo del turno #${cierre.id} corregido. Revisalo nuevamente antes de aprobar.` : `Cierre del turno #${cierre.id} ${accion === "aprobar" ? "aprobado" : "anulado"}.`);
      router.refresh();
    });
  }
  const alternar = (turnoId: number, accion: "rectificar" | "anular") => setRevision(actual => actual?.turnoId === turnoId && actual.accion === accion ? null : { turnoId, accion });
  return <section id="revisar-cierres" className="card mb-6 overflow-hidden scroll-mt-6" aria-labelledby="titulo-cierres">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-navy px-5 py-4 text-white">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2"><ClipboardCheck className="h-5 w-5 text-lime" /></span><div><h2 id="titulo-cierres" className="font-semibold">Revisión de cierres de caja</h2><p className="text-sm text-slate-300">Control exclusivo de administración</p></div></div>
      <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{total} pendiente{total === 1 ? "" : "s"}</span>
    </div>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 text-sm md:grid-cols-3" aria-label="Cómo revisar un cierre">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">1 · Compará</span><p className="mt-1 text-slate-700">Revisá el arqueo enviado, el conteo vigente y el saldo esperado. Si hay un faltante, leé el motivo del responsable.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">2 · Resolvé</span><p className="mt-1 text-slate-700">Aprobá si el conteo es correcto. Si necesitás corregirlo, indicá el nuevo monto y un motivo; luego volvé a revisarlo.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">3 · Anulá si corresponde</span><p className="mt-1 text-slate-700">Anulá un cierre registrado por error con un motivo. El sistema conserva el historial y recalcula el fondo de la siguiente caja.</p></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</p>}
      {total === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No hay cierres pendientes de revisión.</p> : <div className="space-y-3">
        {cierres.map(c => {
          const faltaApertura = c.aperturaEstado === "pendiente";
          const faltaMotivo = (c.diferencia ?? 0) < 0 && !c.observaciones;
          const accionAbierta = revision?.turnoId === c.id ? revision.accion : null;
          return <article key={c.id} className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-navy">Turno #{c.id} · {c.sucursalNombre ?? "Sucursal"}</h3><span className="text-xs text-slate-500">Cerró {c.cerradoPor ?? "Sin registrar"}</span></div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-slate-700"><p>Enviado: <strong>{money(c.declaradoCierre ?? c.efectivoContado ?? 0)}</strong></p><p>Conteo vigente: <strong>{money(c.efectivoContado ?? 0)}</strong></p><p>Esperado: <strong>{money(c.efectivoEsperado ?? 0)}</strong></p><p>Diferencia: <strong>{money(c.diferencia ?? 0)}</strong></p></div>
            {c.observaciones && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Motivo del responsable: {c.observaciones}</p>}
            {faltaApertura && <p className="mt-2 text-amber-800">Primero revisá la <Link href="/admin#revisar-aperturas" className="font-semibold underline">apertura de este turno</Link>.</p>}
            {faltaMotivo && <p className="mt-2 text-amber-800">Falta el motivo del responsable. Para aprobar, primero debe registrarlo.</p>}
            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label={`Acciones para cierre del turno ${c.id}`}>
              <button type="button" className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap" disabled={ocupado || faltaApertura || faltaMotivo} onClick={() => ejecutar(c, "aprobar")}><ShieldCheck className="h-4 w-4" /> Aprobar cierre</button>
              <button type="button" className="btn-ghost inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-slate-200" disabled={ocupado} aria-expanded={accionAbierta === "rectificar"} onClick={() => alternar(c.id, "rectificar")}><Pencil className="h-4 w-4" /> Rectificar conteo</button>
              <button type="button" className="btn-ghost inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-rose-200 text-rose-700" disabled={ocupado} aria-expanded={accionAbierta === "anular"} onClick={() => alternar(c.id, "anular")}><XCircle className="h-4 w-4" /> Anular cierre</button>
            </div>
            {accionAbierta === "rectificar" && <form className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end" action={fd => ejecutar(c, "rectificar", fd)}><label className="label">Nuevo monto contado<input className="input mt-1" name="monto" type="number" min="0" step="0.01" required /></label><label className="label">Motivo de la corrección<input className="input mt-1" name="motivo" maxLength={500} required /></label><button className="btn-primary" disabled={ocupado}>Guardar corrección</button></form>}
            {accionAbierta === "anular" && <form className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-rose-50 p-4" action={fd => ejecutar(c, "anular", fd)}><label className="label min-w-52 flex-1">Motivo de la anulación<input className="input mt-1" name="motivo" maxLength={500} required /></label><button className="btn-ghost border border-rose-300 text-rose-700" disabled={ocupado}>Confirmar anulación</button></form>}
          </article>;
        })}
        {total > cierres.length && <p className="text-xs text-slate-500">Se muestra el siguiente cierre por sucursal, en orden. Al resolverlo aparecerán los posteriores.</p>}
      </div>}
    </div>
  </section>;
}
