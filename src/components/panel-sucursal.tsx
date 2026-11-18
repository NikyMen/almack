"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { cajas, sucursales } from "@/db/schema";
import { guardarPanelSucursal } from "@/app/admin/(protected)/sucursales/actions";
import { crearSucursal } from "@/app/actions";

type Local = typeof sucursales.$inferSelect;
type Caja = typeof cajas.$inferSelect;

function Tarjeta({ local, locales, cajas }: { local: Local; locales: Local[]; cajas: Caja[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(local.nombre);
  const [direccion, setDireccion] = useState(local.direccion);
  const [deposito, setDeposito] = useState(local.esDeposito);
  const [puntoVenta, setPuntoVenta] = useState(local.esPuntoVenta);
  const [mayorista, setMayorista] = useState(local.esMayorista);
  const [depositoId, setDepositoId] = useState(local.depositoId?.toString() ?? "");
  const [cantidad, setCantidad] = useState(cajas.filter(c => c.activa).length);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, iniciar] = useTransition();
  const depositos = locales.filter(s => s.id === local.id ? deposito : s.esDeposito);
  function guardar() {
    setError(""); setAviso("");
    iniciar(async () => {
      const resultado = await guardarPanelSucursal({ id: local.id, nombre, direccion, esDeposito: deposito, esPuntoVenta: puntoVenta, esMayorista: mayorista, depositoId: depositoId ? Number(depositoId) : null, cantidadCajas: cantidad });
      if (!resultado.ok) { setError(resultado.error); return; }
      setAviso("Configuración guardada."); router.refresh();
    });
  }
  return <section className="card overflow-hidden">
    <div className="border-b border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sucursal #{local.id}</p><h2 className="text-lg font-bold text-navy">{local.nombre}</h2></div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Activa</span>
      </div>
    </div>
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="space-y-4">
        <label className="label block">Nombre<input className="input mt-1" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} /></label>
        <label className="label block">Dirección<input className="input mt-1" value={direccion} onChange={e => setDireccion(e.target.value)} maxLength={200} /></label>
        <fieldset className="space-y-2"><legend className="label">Funciones del local</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deposito} onChange={e => setDeposito(e.target.checked)} /> Depósito</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={puntoVenta} onChange={e => { setPuntoVenta(e.target.checked); if (e.target.checked && cantidad === 0) setCantidad(1); if (!e.target.checked && !mayorista) setCantidad(0); }} /> Punto de venta</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mayorista} onChange={e => { setMayorista(e.target.checked); if (e.target.checked && cantidad === 0) setCantidad(1); if (!e.target.checked && !puntoVenta) setCantidad(0); }} /> Mayorista</label>
        </fieldset>
      </div>
      <div className="space-y-4">
        <label className="label block">Depósito de abastecimiento
          <select className="input mt-1" value={depositoId} onChange={e => setDepositoId(e.target.value)}>
            <option value="">Sin depósito asignado</option>
            {depositos.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.id === local.id ? " (propio)" : ""}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-500">El depósito asignado identifica el origen habitual de los traslados. Cada local conserva su propio stock.</p>
        <label className="label block">Cajas operativas independientes
          <input className="input mt-1 max-w-32" type="number" min={puntoVenta || mayorista ? 1 : 0} max={20} step={1} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} />
        </label>
        <p className="text-xs text-slate-500">Cada caja tiene responsable, saldo, ventas, arqueo e historial propios. Al reducir la cantidad, los turnos anteriores se conservan.</p>
        <div className="flex flex-wrap gap-2">
          {cajas.filter(c => c.activa).map(c => <Link key={c.id} href={`/admin/caja?caja=${c.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Caja {c.numero} ↗</Link>)}
        </div>
      </div>
    </div>
    <div className="border-t border-slate-100 px-5 py-4">
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {aviso && <p role="status" className="mb-3 text-sm text-emerald-700">{aviso}</p>}
      <button className="btn-primary" disabled={ocupado} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar sucursal"}</button>
    </div>
  </section>;
}

export function PanelSucursal({ locales, cajas }: { locales: Local[]; cajas: Caja[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  function agregar() {
    setError("");
    iniciar(async () => {
      const resultado = await crearSucursal(nombre, direccion);
      if (!resultado.ok) { setError(resultado.error); return; }
      setNombre(""); setDireccion(""); setNuevo(false); router.refresh();
    });
  }
  return <div className="space-y-5">
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
      <strong>Cómo configurar:</strong> marcá una o varias funciones para cada local, elegí su depósito de abastecimiento y definí cuántas cajas pueden operar. Un local puede ser depósito y punto de venta a la vez. Cerrá y aprobá los turnos antes de quitar una caja.
    </div>
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-navy">Locales</h2><p className="text-sm text-slate-500">{locales.length} sucursal{locales.length === 1 ? "" : "es"} activa{locales.length === 1 ? "" : "s"}</p></div><button type="button" className="btn-primary" onClick={() => setNuevo(!nuevo)}>{nuevo ? "Cancelar" : "Agregar sucursal"}</button></div>
      {nuevo && <form className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action={agregar}><label className="label">Nombre<input className="input mt-1" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} required /></label><label className="label">Dirección<input className="input mt-1" value={direccion} onChange={e => setDireccion(e.target.value)} maxLength={200} /></label><button className="btn-primary" disabled={ocupado}>Crear local</button>{error && <p role="alert" className="text-sm text-rose-700 sm:col-span-3">{error}</p>}</form>}
    </div>
    {locales.map(local => <Tarjeta key={local.id} local={local} locales={locales} cajas={cajas.filter(c => c.sucursalId === local.id)} />)}
  </div>;
}
