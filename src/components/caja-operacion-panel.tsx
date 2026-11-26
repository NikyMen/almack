"use client";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { operarCaja } from "@/app/caja-actions";
import { ExtraccionCaja } from "@/components/extraccion-caja";
import { money } from "@/lib/format";
import type { cajaTurnos, cajaTraspasos, cajaExtracciones, cambiosPrecio } from "@/db/schema";
import type { resumenCaja, saldoUltimoCierre } from "@/lib/caja";

type Turno = typeof cajaTurnos.$inferSelect;
type Traspaso = typeof cajaTraspasos.$inferSelect;
type Props = {
  cajaId: number;
  turno: Turno | null;
  pendiente: Turno | null;
  aperturaPorMotivarId: number | null;
  cierrePorMotivarId: number | null;
  traspaso: Traspaso | null;
  anterior: Awaited<ReturnType<typeof saldoUltimoCierre>>;
  extracciones: (typeof cajaExtracciones.$inferSelect)[];
  resumen: Awaited<ReturnType<typeof resumenCaja>> | null;
  cambios: (typeof cambiosPrecio.$inferSelect)[];
  sucursal: string;
  usuario: string;
  esResponsable: boolean;
  esAdmin: boolean;
};
function MontoContado({ etiqueta }: { etiqueta: string }) {
  return <label className="label block">{etiqueta}
    <input name="monto" type="number" min="0" step="0.01" inputMode="decimal" required className="input mt-1" placeholder="0,00" />
  </label>;
}
export function CajaOperacionPanel({ cajaId, turno, pendiente, aperturaPorMotivarId, cierrePorMotivarId, traspaso, anterior, extracciones, resumen, cambios, sucursal, usuario, esResponsable, esAdmin }: Props) {
  const [modo, setModo] = useState<"ingreso" | "cerrar" | "traspaso" | "ingreso_cerrada" | "cancelar_traspaso" | null>(null);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<number | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  // Los detalles se pueden plegar para que la Caja no sea tan larga; la preferencia queda en este navegador.
  const [abierto, setAbierto] = useState(true);
  useEffect(() => { if (localStorage.getItem("almack:caja-detalles") === "ocultos") setAbierto(false); }, []);
  function alternarDetalles() {
    setAbierto(a => { localStorage.setItem("almack:caja-detalles", a ? "ocultos" : "visibles"); return !a; });
  }
  function ejecutar(datos: Parameters<typeof operarCaja>[0]) {
    setError("");
    iniciar(async () => {
      const r = await operarCaja({ ...datos, cajaId });
      if (!r.ok) { setError(r.error); return; }
      if ("contado" in r && r.contado !== undefined) setConfirmacion(r.contado);
      setModo(null);
      router.refresh();
    });
  }
  const ultimoDeclarado = !!pendiente && pendiente.responsableUsuario === usuario;
  // Solo se pliega con la caja operando: cerrada, en arqueo o en traspaso, el panel es lo único que hay para hacer.
  const plegable = !!turno && !turno.arqueoEn && !traspaso;
  const visible = abierto || !plegable;
  const hayAvisos = confirmacion !== null || aperturaPorMotivarId !== null || cierrePorMotivarId !== null || !!error;
  return <div className="mb-4 space-y-3">
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-navy px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-lime">{sucursal}</p>
          <h2 className="font-semibold">{turno ? "Caja abierta · turno #" + turno.id : pendiente ? "Cierre pendiente · turno #" + pendiente.id : "Caja cerrada"}</h2>
          {turno && <p className="text-sm text-slate-300">Responsable: {turno.responsable}{!visible && esAdmin && resumen ? ` · Efectivo esperado: ${money(resumen.esperado)}` : ""}</p>}
        </div>
        {plegable && <button type="button" onClick={alternarDetalles} aria-expanded={abierto} aria-controls="caja-detalles"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20">
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
          {abierto ? "Ocultar detalles" : "Ver detalles"}
        </button>}
      </div>
      {(visible || hayAvisos) && <div id="caja-detalles" className="space-y-4 p-4">
        {confirmacion !== null && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Enviaste un arqueo de {money(confirmacion)}. El registro quedó bloqueado para edición.</p>}
        {aperturaPorMotivarId !== null && <form className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3" action={fd => ejecutar({ operacion: "motivo_apertura", turnoId: aperturaPorMotivarId, motivo: String(fd.get("motivo") ?? "") })}>
          <p className="text-sm font-medium">La apertura ya fue enviada. Escribí el motivo requerido para completar su revisión.</p>
          <input name="motivo" required maxLength={500} className="input" placeholder="Motivo de la apertura" />
          <button disabled={ocupado} className="btn-primary">Guardar motivo</button>
        </form>}
        {cierrePorMotivarId !== null && <form className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3" action={fd => ejecutar({ operacion: "motivo_cierre", turnoId: cierrePorMotivarId, motivo: String(fd.get("motivo") ?? "") })}>
          <p className="text-sm font-medium">El cierre ya fue enviado. Escribí el motivo requerido para completar su revisión.</p>
          <input name="motivo" required maxLength={500} className="input" placeholder="Motivo del cierre" />
          <button disabled={ocupado} className="btn-primary">Guardar motivo</button>
        </form>}
        {visible && pendiente && <>
          {ultimoDeclarado && <p className="rounded-lg bg-slate-50 p-3 text-sm">Arqueo enviado: <strong>{money(pendiente.declaradoCierre ?? pendiente.efectivoContado ?? 0)}</strong>. Espera revisión del administrador; ya no podés modificarlo.</p>}
          {!ultimoDeclarado && !esAdmin && <p className="text-sm text-slate-600">Hay un cierre pendiente de revisión administrativa.</p>}
          {esAdmin && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El cierre del turno #{pendiente.id} espera revisión administrativa. <Link href="/admin#revisar-cierres" className="font-semibold underline">Revisarlo en el Panel</Link>.</p>}
        </>}
        {visible && !turno && <>
          <p className="text-sm text-slate-600">Quien recibe la caja debe contar el efectivo antes de abrir. El saldo esperado solo lo ve administración.</p>
          {esAdmin && anterior && <div className="rounded-lg bg-slate-50 p-3 text-sm">Saldo {anterior.provisional ? "provisional" : anterior.anulado ? "sin arqueo aprobado" : "registrado"} para la próxima apertura: <strong>{money(anterior.disponible)}</strong></div>}
          <form className="space-y-3" action={fd => ejecutar({ operacion: "abrir", monto: Number(fd.get("monto")) })}>
            <MontoContado etiqueta="Monto contado para abrir" />
            <button disabled={ocupado} className="btn-primary">Confirmar recepción y abrir</button>
          </form>
          {esAdmin && anterior && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <ExtraccionCaja turnoId={anterior.turnoId} disponible={anterior.disponible} />
            <button className="btn-ghost border border-slate-200" aria-expanded={modo === "ingreso_cerrada"} onClick={() => setModo(modo === "ingreso_cerrada" ? null : "ingreso_cerrada")}>Ingresar cambio</button>
          </div>}
          {esAdmin && anterior && modo === "ingreso_cerrada" && <form className="space-y-2" action={fd => ejecutar({ operacion: "ingreso_cerrada", turnoId: anterior.turnoId, monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? "") })}>
            <label className="label">Importe ingresado<input name="monto" type="number" min="0.01" step="0.01" required className="input" /></label>
            <label className="label">Motivo<input name="motivo" required maxLength={500} className="input" /></label>
            <button disabled={ocupado} className="btn-primary">Registrar ingreso</button>
          </form>}
        </>}
        {visible && turno && <>
          {esAdmin && turno.aperturaEstado === "pendiente" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La apertura de este turno espera revisión. <Link href="/admin#revisar-aperturas" className="font-semibold underline">Revisarla en el Panel</Link>.</p>}
          {esAdmin && resumen && <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">Fondo registrado<br /><strong>{money(turno.fondoInicial)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3">Ventas en efectivo<br /><strong>{money(resumen.efectivo)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3">Ingresos y retiros<br /><strong>{money(resumen.ingresos - resumen.retiros)}</strong></div>
            <div className="rounded-lg bg-lime/20 p-3">Efectivo esperado<br /><strong>{money(resumen.esperado)}</strong></div>
            {turno.diferenciaApertura !== null && <p className="sm:col-span-2">Diferencia de apertura: {money(turno.diferenciaApertura)} · Declarado: {money(turno.fondoContado ?? turno.fondoInicial)}</p>}
          </div>}
          {traspaso ? <>
            {traspaso.salienteUsuario === usuario && <p className="text-sm">Entregaste la caja. Declaraste {money(traspaso.contadoSalida)}. Esperá a que otra persona confirme la recepción.</p>}
            {traspaso.salienteUsuario !== usuario && <form className="space-y-3" action={fd => ejecutar({ operacion: "recibir_traspaso", turnoId: turno.id, monto: Number(fd.get("monto")) })}>
              <p className="text-sm">Hay un traspaso pendiente. Contá el efectivo antes de asumir la responsabilidad.</p><MontoContado etiqueta="Monto recibido" />
              <button disabled={ocupado} className="btn-primary">Confirmar recepción</button>
            </form>}
          </> : <>
            {!esResponsable && <p className="text-sm text-slate-600">La caja está asignada a {turno.responsable}. Solo esa persona puede operar, contar y cerrar o iniciar la entrega.</p>}
            {/* Todas las acciones del turno en una sola fila: las del responsable y las de administración. */}
            {!turno.arqueoEn && (esResponsable || esAdmin) && <div className="flex flex-wrap items-center gap-2">
              {esResponsable && <><button disabled={ocupado} className="btn-ghost border border-slate-200" aria-expanded={modo === "traspaso"} onClick={() => setModo(modo === "traspaso" ? null : "traspaso")}>Entregar caja</button><button disabled={ocupado} className="btn-primary" onClick={() => ejecutar({ operacion: "iniciar_arqueo", turnoId: turno.id })}>Contar y cerrar</button></>}
              {esAdmin && <ExtraccionCaja turnoId={turno.id} disponible={resumen?.esperado ?? 0} />}
              {esAdmin && <button className="btn-ghost border border-slate-200" aria-expanded={modo === "ingreso"} onClick={() => setModo(modo === "ingreso" ? null : "ingreso")}>Ingresar cambio</button>}
            </div>}
            {esResponsable && modo === "traspaso" && !turno.arqueoEn && <form className="space-y-3" action={fd => ejecutar({ operacion: "iniciar_traspaso", turnoId: turno.id, monto: Number(fd.get("monto")) })}>
              <p className="text-sm">Al enviar, se bloquean las operaciones hasta que otra persona cuente y reciba la caja.</p><MontoContado etiqueta="Monto entregado" /><button disabled={ocupado} className="btn-primary">Enviar entrega</button>
            </form>}
            {esAdmin && modo === "ingreso" && !turno.arqueoEn && <form className="space-y-2" action={fd => ejecutar({ operacion: "movimiento", turnoId: turno.id, tipo: "ingreso", monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? "") })}><label className="label">Importe<input name="monto" type="number" min="0.01" step="0.01" required className="input" /></label><label className="label">Motivo<input name="motivo" maxLength={500} required className="input" /></label><button disabled={ocupado} className="btn-primary">Registrar ingreso</button></form>}
            {esResponsable && turno.arqueoEn && <form className="space-y-3" action={fd => ejecutar({ operacion: "cerrar", turnoId: turno.id, monto: Number(fd.get("monto")) })}>
              <p className="text-sm">Las ventas están bloqueadas durante el arqueo. El importe esperado no se muestra.</p><MontoContado etiqueta="Monto contado para cerrar" />
              <div className="flex gap-2"><button disabled={ocupado} className="btn-primary">Enviar arqueo</button><button type="button" disabled={ocupado} className="btn-ghost" onClick={() => ejecutar({ operacion: "cancelar_arqueo", turnoId: turno.id })}>Cancelar arqueo</button></div>
            </form>}
            {!esResponsable && esAdmin && turno.arqueoEn && <p className="text-sm text-slate-600">{turno.responsable} está contando el efectivo para cerrar la caja.</p>}
          </>}
          {esAdmin && traspaso && <div className="rounded-lg bg-amber-50 p-3 text-sm"><p>Traspaso pendiente · Esperado: {money(traspaso.esperado)} · Declarado al entregar: {money(traspaso.contadoSalida)}</p><button className="btn-ghost mt-2" onClick={() => setModo("cancelar_traspaso")}>Cancelar traspaso</button>{modo === "cancelar_traspaso" && <form className="mt-2 flex gap-2" action={fd => ejecutar({ operacion: "cancelar_traspaso", turnoId: turno.id, motivo: String(fd.get("motivo") ?? "") })}><input className="input" name="motivo" required maxLength={500} placeholder="Motivo de la cancelación" /><button disabled={ocupado} className="btn-primary">Confirmar</button></form>}</div>}
          {esAdmin && resumen && resumen.movimientos.length > 0 && <details><summary className="cursor-pointer text-sm">Movimientos del turno</summary>{resumen.movimientos.map(m => <p key={m.id} className="border-b border-slate-100 py-2 text-sm">{m.motivo} · {m.responsable} · {m.tipo === "retiro" ? "−" : "+"}{money(m.monto)}</p>)}</details>}
        </>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>}
    </section>
    {visible && esAdmin && <Link href="/admin/caja/historial" className="card block px-4 py-3 text-sm font-medium text-navy">Historial de aperturas, traspasos y cierres ↗</Link>}
    {visible && esAdmin && extracciones.length > 0 && <details className="card px-4 py-3"><summary className="cursor-pointer text-sm">Últimas extracciones</summary>{extracciones.map(e => <p key={e.id} className="py-2 text-sm">{e.motivo} · {money(e.monto)} · {e.responsable}</p>)}</details>}
    {visible && esAdmin && cambios.length > 0 && <details className="card px-4 py-3"><summary className="cursor-pointer text-sm">Cambios de precio ({cambios.length})</summary>{cambios.map(c => <p key={c.id} className="py-2 text-sm">Venta #{c.ventaId} · {c.usuario} · {money(c.totalAnterior)} → {money(c.totalNuevo)}</p>)}</details>}
  </div>;
}
