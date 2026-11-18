"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { revisarAperturaDesdePanel } from "@/app/admin/(protected)/aperturas-actions";
import { money } from "@/lib/format";

export type AperturaPendientePanel = {
  id: number;
  sucursalId: number;
  sucursalNombre: string | null;
  responsable: string;
  aperturaUsuario: string;
  fondoInicial: number;
  fondoContado: number | null;
  fondoEsperado: number | null;
  diferenciaApertura: number | null;
  motivoApertura: string;
};

type Revision = { turnoId: number; accion: "rectificar" | "anular" } | null;
export function AperturasPendientesPanel({ aperturas, total }: { aperturas: AperturaPendientePanel[]; total: number }) {
  const [revision, setRevision] = useState<Revision>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  function ejecutar(apertura: AperturaPendientePanel, accion: "aprobar" | "rectificar" | "anular", fd?: FormData) {
    setError(""); setMensaje("");
    iniciar(async () => {
      const resultado = await revisarAperturaDesdePanel({
        sucursalId: apertura.sucursalId, turnoId: apertura.id, accion,
        motivo: String(fd?.get("motivo") ?? ""),
        monto: accion === "rectificar" ? Number(fd?.get("monto")) : undefined,
      });
      if (!resultado.ok) return setError(resultado.error);
      setRevision(null);
      setMensaje(accion === "rectificar" ? `Conteo del turno #${apertura.id} corregido. Revisalo nuevamente antes de aprobar.` : `Apertura del turno #${apertura.id} ${accion === "aprobar" ? "aprobada" : "anulada"}.`);
      router.refresh();
    });
  }
  const alternar = (turnoId: number, accion: "rectificar" | "anular") => setRevision(actual => actual?.turnoId === turnoId && actual.accion === accion ? null : { turnoId, accion });
  return <section id="revisar-aperturas" className="card mb-6 overflow-hidden scroll-mt-6" aria-labelledby="titulo-aperturas">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-navy px-5 py-4 text-white">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2"><ClipboardCheck className="h-5 w-5 text-lime" /></span><div><h2 id="titulo-aperturas" className="font-semibold">Revisión de aperturas de caja</h2><p className="text-sm text-slate-300">Control exclusivo de administración</p></div></div>
      <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{total} pendiente{total === 1 ? "" : "s"}</span>
    </div>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 text-sm md:grid-cols-3" aria-label="Cómo revisar una apertura">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">1 · Compará</span><p className="mt-1 text-slate-700">Revisá lo declarado por quien abrió la caja frente al saldo esperado. Si falta dinero, esperá su motivo.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">2 · Decidí</span><p className="mt-1 text-slate-700">Aprobá si el conteo es correcto. Si hubo un error de conteo, modificalo e indicá por qué; después revisalo otra vez.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-orange-700">3 · Anulá si corresponde</span><p className="mt-1 text-slate-700">Anulá una apertura registrada por error con un motivo. La revisión queda en el historial; el turno no se borra.</p></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</p>}
      {total === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No hay aperturas pendientes de revisión.</p> : <div className="space-y-3">
        {aperturas.map(a => {
          const faltaMotivo = (a.diferenciaApertura ?? 0) < 0 && !a.motivoApertura;
          const accionAbierta = revision?.turnoId === a.id ? revision.accion : null;
          return <article key={a.id} className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-navy">Turno #{a.id} · {a.sucursalNombre ?? "Sucursal"}</h3><span className="text-xs text-slate-500">Abrió {a.aperturaUsuario || a.responsable}</span></div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-slate-700"><p>Declarado: <strong>{money(a.fondoContado ?? a.fondoInicial)}</strong></p><p>Esperado: <strong>{a.fondoEsperado === null ? "sin registro anterior" : money(a.fondoEsperado)}</strong></p><p>Diferencia: <strong>{a.diferenciaApertura === null ? "sin referencia" : money(a.diferenciaApertura)}</strong></p></div>
            {a.motivoApertura && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Motivo del responsable: {a.motivoApertura}</p>}
            {faltaMotivo && <p className="mt-2 text-amber-800">Falta el motivo del responsable. Podés corregir o anular; para aprobar, primero debe registrarlo.</p>}
            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label={`Acciones para apertura del turno ${a.id}`}>
              <button type="button" className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap" disabled={ocupado || faltaMotivo} onClick={() => ejecutar(a, "aprobar")}><ShieldCheck className="h-4 w-4" /> Aprobar apertura</button>
              <button type="button" className="btn-ghost inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-slate-200" disabled={ocupado} aria-expanded={accionAbierta === "rectificar"} onClick={() => alternar(a.id, "rectificar")}><Pencil className="h-4 w-4" /> Modificar conteo</button>
              <button type="button" className="btn-ghost inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-rose-200 text-rose-700" disabled={ocupado} aria-expanded={accionAbierta === "anular"} onClick={() => alternar(a.id, "anular")}><XCircle className="h-4 w-4" /> Anular apertura</button>
            </div>
            {accionAbierta === "rectificar" && <form className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end" action={fd => ejecutar(a, "rectificar", fd)}><label className="label">Nuevo monto contado<input className="input mt-1" name="monto" type="number" min="0" step="0.01" required /></label><label className="label">Motivo de la corrección<input className="input mt-1" name="motivo" maxLength={500} required /></label><button className="btn-primary" disabled={ocupado}>Guardar corrección</button></form>}
            {accionAbierta === "anular" && <form className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-rose-50 p-4" action={fd => ejecutar(a, "anular", fd)}><label className="label min-w-52 flex-1">Motivo de la anulación<input className="input mt-1" name="motivo" maxLength={500} required /></label><button className="btn-ghost border border-rose-300 text-rose-700" disabled={ocupado}>Confirmar anulación</button></form>}
          </article>;
        })}
        {total > aperturas.length && <p className="text-xs text-slate-500">Se muestran las {aperturas.length} aperturas más antiguas. Al resolverlas aparecerán las siguientes.</p>}
      </div>}
    </div>
  </section>;
}
