"use client";
import { useState, useTransition } from "react";
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
  turno: Turno | null;
  pendiente: Turno | null;
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
const denominaciones = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.1, 0.01];
function detalle(fd: FormData) {
  return Object.fromEntries(denominaciones.map(n => [String(n), Number(fd.get("d_" + n) || 0)]));
}
function Conteo() {
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const total = Math.round(denominaciones.reduce((s, n) => s + n * (cantidades[n] || 0), 0) * 100) / 100;
  return <div>
    <p className="label">Contá billetes y monedas</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {denominaciones.map(n => <label key={n} className="rounded-lg border border-slate-200 p-2 text-sm">
        <span className="font-medium">{money(n)}</span>
        <input name={"d_" + n} type="number" min="0" max="100000" step="1" inputMode="numeric" value={cantidades[n] ?? ""} onChange={e => setCantidades(v => ({ ...v, [n]: Number(e.target.value) || 0 }))} className="input mt-1" placeholder="0" />
      </label>)}
    </div>
    <p className="mt-3 text-sm font-semibold">Total declarado: {money(total)}</p>
  </div>;
}
export function CajaOperacionPanel({ turno, pendiente, traspaso, anterior, extracciones, resumen, cambios, sucursal, usuario, esResponsable, esAdmin }: Props) {
  const [modo, setModo] = useState<"ingreso" | "cerrar" | "traspaso" | "rectificar" | "ingreso_cerrada" | "cancelar_traspaso" | null>(null);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<number | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  function ejecutar(datos: Parameters<typeof operarCaja>[0]) {
    setError("");
    iniciar(async () => {
      const r = await operarCaja(datos);
      if (!r.ok) { setError(r.error); return; }
      if ("contado" in r && r.contado !== undefined) setConfirmacion(r.contado);
      setModo(null);
      router.refresh();
    });
  }
  const ultimoDeclarado = !!pendiente && pendiente.responsableUsuario === usuario;
  return <div className="mb-4 space-y-3">
    <section className="card overflow-hidden">
      <div className="bg-navy px-4 py-3 text-white">
        <p className="text-xs uppercase tracking-widest text-lime">{sucursal}</p>
        <h2 className="font-semibold">{turno ? "Caja abierta · turno #" + turno.id : pendiente ? "Cierre pendiente · turno #" + pendiente.id : "Caja cerrada"}</h2>
        {turno && <p className="text-sm text-slate-300">Responsable: {turno.responsable}</p>}
      </div>
      <div className="space-y-4 p-4">
        {confirmacion !== null && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Enviaste un arqueo de {money(confirmacion)}. El registro quedó bloqueado para edición.</p>}
        {pendiente && <>
          {ultimoDeclarado && <p className="rounded-lg bg-slate-50 p-3 text-sm">Arqueo enviado: <strong>{money(pendiente.declaradoCierre ?? pendiente.efectivoContado ?? 0)}</strong>. Espera revisión del administrador; ya no podés modificarlo.</p>}
          {!ultimoDeclarado && !esAdmin && <p className="text-sm text-slate-600">El cierre espera revisión del administrador. La caja no puede reabrirse todavía.</p>}
          {esAdmin && <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
            <h3 className="font-semibold">Revisar cierre</h3>
            <p>Enviado por {pendiente.cerradoPor}: {money(pendiente.declaradoCierre ?? pendiente.efectivoContado ?? 0)}</p>
            <p>Contado vigente: {money(pendiente.efectivoContado ?? 0)} · Esperado: {money(pendiente.efectivoEsperado ?? 0)} · Diferencia: {money(pendiente.diferencia ?? 0)}</p>
            {pendiente.observaciones && <p>Observaciones: {pendiente.observaciones}</p>}
            <div className="flex flex-wrap gap-2"><button disabled={ocupado} className="btn-primary" onClick={() => ejecutar({ operacion: "aprobar", turnoId: pendiente.id })}>Aprobar cierre</button><button disabled={ocupado} className="btn-ghost" onClick={() => setModo("rectificar")}>Rectificar conteo</button></div>
            {modo === "rectificar" && <form className="space-y-2" action={fd => ejecutar({ operacion: "rectificar", turnoId: pendiente.id, monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? "") })}>
              <label className="label">Nuevo total contado<input name="monto" type="number" min="0" step="0.01" required className="input" /></label>
              <label className="label">Motivo de la rectificación<input name="motivo" required maxLength={500} className="input" /></label>
              <button disabled={ocupado} className="btn-primary">Guardar rectificación</button>
            </form>}
          </div>}
        </>}
        {!turno && !pendiente && <>
          <p className="text-sm text-slate-600">Quien recibe la caja debe contar el efectivo antes de abrir. El saldo esperado solo lo ve administración.</p>
          {esAdmin && anterior && <div className="rounded-lg bg-slate-50 p-3 text-sm">Saldo registrado para la próxima apertura: <strong>{money(anterior.disponible)}</strong></div>}
          <form className="space-y-3" action={fd => ejecutar({ operacion: "abrir", detalle: detalle(fd), motivo: String(fd.get("motivo") ?? "") })}>
            <Conteo />
            <label className="label">Observaciones de recepción (opcional)<input name="motivo" maxLength={500} className="input" /></label>
            <button disabled={ocupado} className="btn-primary">Confirmar recepción y abrir</button>
          </form>
          {esAdmin && anterior && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <ExtraccionCaja turnoId={anterior.turnoId} disponible={anterior.disponible} />
            <button className="btn-ghost" onClick={() => setModo(modo === "ingreso_cerrada" ? null : "ingreso_cerrada")}>Ingresar cambio</button>
          </div>}
          {esAdmin && anterior && modo === "ingreso_cerrada" && <form className="space-y-2" action={fd => ejecutar({ operacion: "ingreso_cerrada", turnoId: anterior.turnoId, monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? "") })}>
            <label className="label">Importe ingresado<input name="monto" type="number" min="0.01" step="0.01" required className="input" /></label>
            <label className="label">Motivo<input name="motivo" required maxLength={500} className="input" /></label>
            <button disabled={ocupado} className="btn-primary">Registrar ingreso</button>
          </form>}
        </>}
        {turno && <>
          {esAdmin && resumen && <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">Fondo registrado<br /><strong>{money(turno.fondoInicial)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3">Ventas en efectivo<br /><strong>{money(resumen.efectivo)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3">Ingresos y retiros<br /><strong>{money(resumen.ingresos - resumen.retiros)}</strong></div>
            <div className="rounded-lg bg-lime/20 p-3">Efectivo esperado<br /><strong>{money(resumen.esperado)}</strong></div>
            {turno.diferenciaApertura !== null && <p className="sm:col-span-2">Diferencia de apertura: {money(turno.diferenciaApertura)} · Declarado: {money(turno.fondoContado ?? turno.fondoInicial)}</p>}
          </div>}
          {traspaso ? <>
            {traspaso.salienteUsuario === usuario && <p className="text-sm">Entregaste la caja. Declaraste {money(traspaso.contadoSalida)}. Esperá a que otra persona confirme la recepción.</p>}
            {traspaso.salienteUsuario !== usuario && <form className="space-y-3" action={fd => ejecutar({ operacion: "recibir_traspaso", turnoId: turno.id, detalle: detalle(fd) })}>
              <p className="text-sm">Hay un traspaso pendiente. Contá el efectivo antes de asumir la responsabilidad.</p><Conteo />
              <button disabled={ocupado} className="btn-primary">Confirmar recepción</button>
            </form>}
          </> : esResponsable ? <>
            <div className="flex flex-wrap gap-2">
              {!turno.arqueoEn && <><button disabled={ocupado} className="btn-ghost" onClick={() => setModo("traspaso")}>Entregar caja</button><button disabled={ocupado} className="btn-primary" onClick={() => ejecutar({ operacion: "iniciar_arqueo", turnoId: turno.id })}>Contar y cerrar</button></>}
              {esAdmin && !turno.arqueoEn && <ExtraccionCaja turnoId={turno.id} disponible={resumen?.esperado ?? 0} />}
            </div>
            {modo === "traspaso" && !turno.arqueoEn && <form className="space-y-3" action={fd => ejecutar({ operacion: "iniciar_traspaso", turnoId: turno.id, detalle: detalle(fd) })}>
              <p className="text-sm">Al enviar, se bloquean las operaciones hasta que otra persona cuente y reciba la caja.</p><Conteo /><button disabled={ocupado} className="btn-primary">Enviar entrega</button>
            </form>}
            {turno.arqueoEn && <form className="space-y-3" action={fd => ejecutar({ operacion: "cerrar", turnoId: turno.id, detalle: detalle(fd), motivo: String(fd.get("motivo") ?? "") })}>
              <p className="text-sm">Las ventas están bloqueadas durante el arqueo. El importe esperado no se muestra.</p><Conteo />
              <label className="label">Observaciones (opcional)<textarea name="motivo" maxLength={2000} className="input" /></label>
              <div className="flex gap-2"><button disabled={ocupado} className="btn-primary">Enviar arqueo</button><button type="button" disabled={ocupado} className="btn-ghost" onClick={() => ejecutar({ operacion: "cancelar_arqueo", turnoId: turno.id })}>Cancelar arqueo</button></div>
            </form>}
          </> : <p className="text-sm text-slate-600">La caja está asignada a {turno.responsable}. Solo esa persona puede operar o iniciar la entrega.</p>}
          {esAdmin && resumen && !traspaso && !turno.arqueoEn && !esResponsable && <ExtraccionCaja turnoId={turno.id} disponible={resumen.esperado} />}
          {esAdmin && !traspaso && !turno.arqueoEn && <div><button className="btn-ghost" onClick={() => setModo(modo === "ingreso" ? null : "ingreso")}>Ingresar cambio</button>{modo === "ingreso" && <form className="mt-2 space-y-2" action={fd => ejecutar({ operacion: "movimiento", turnoId: turno.id, tipo: "ingreso", monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? "") })}><label className="label">Importe<input name="monto" type="number" min="0.01" step="0.01" required className="input" /></label><label className="label">Motivo<input name="motivo" maxLength={500} required className="input" /></label><button disabled={ocupado} className="btn-primary">Registrar ingreso</button></form>}</div>}
          {esAdmin && traspaso && <div className="rounded-lg bg-amber-50 p-3 text-sm"><p>Traspaso pendiente · Esperado: {money(traspaso.esperado)} · Declarado al entregar: {money(traspaso.contadoSalida)}</p><button className="btn-ghost mt-2" onClick={() => setModo("cancelar_traspaso")}>Cancelar traspaso</button>{modo === "cancelar_traspaso" && <form className="mt-2 flex gap-2" action={fd => ejecutar({ operacion: "cancelar_traspaso", turnoId: turno.id, motivo: String(fd.get("motivo") ?? "") })}><input className="input" name="motivo" required maxLength={500} placeholder="Motivo de la cancelación" /><button disabled={ocupado} className="btn-primary">Confirmar</button></form>}</div>}
          {esAdmin && resumen && resumen.movimientos.length > 0 && <details><summary className="cursor-pointer text-sm">Movimientos del turno</summary>{resumen.movimientos.map(m => <p key={m.id} className="border-b border-slate-100 py-2 text-sm">{m.motivo} · {m.responsable} · {m.tipo === "retiro" ? "−" : "+"}{money(m.monto)}</p>)}</details>}
        </>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>
    </section>
    {esAdmin && <Link href="/admin/caja/historial" className="card block px-4 py-3 text-sm font-medium text-navy">Historial de aperturas, traspasos y cierres ↗</Link>}
    {esAdmin && extracciones.length > 0 && <details className="card px-4 py-3"><summary className="cursor-pointer text-sm">Últimas extracciones</summary>{extracciones.map(e => <p key={e.id} className="py-2 text-sm">{e.motivo} · {money(e.monto)} · {e.responsable}</p>)}</details>}
    {esAdmin && cambios.length > 0 && <details className="card px-4 py-3"><summary className="cursor-pointer text-sm">Cambios de precio ({cambios.length})</summary>{cambios.map(c => <p key={c.id} className="py-2 text-sm">Venta #{c.ventaId} · {c.usuario} · {money(c.totalAnterior)} → {money(c.totalNuevo)}</p>)}</details>}
  </div>;
}
