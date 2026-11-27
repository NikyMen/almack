"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { cajas, sucursales } from "@/db/schema";
import { guardarPanelSucursal } from "@/app/admin/(protected)/sucursales/actions";
import { crearSucursal, seleccionarSucursal } from "@/app/actions";
import { MapaSucursales } from "@/components/mapa-sucursales";
import { TarjetaFlotante } from "@/components/tarjeta-flotante";
import type { Actividad, EstadoCaja } from "@/components/mapa-interior";

export type { Actividad, EstadoCaja };

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
  return <div>
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
  </div>;
}

export function PanelSucursal({ locales, cajas, estados, actividad }: { locales: Local[]; cajas: Caja[]; estados: EstadoCaja[]; actividad: Actividad[] }) {
  const router = useRouter();
  const [errorCajas, setErrorCajas] = useState("");
  const [ocupadoCajas, iniciarCajas] = useTransition();
  /** Agrega o quita cajas desde el interior del local, conservando el resto de su configuración guardada. */
  function cambiarCajas(localId: number, cantidad: number) {
    const local = locales.find(l => l.id === localId);
    if (!local) return;
    setErrorCajas("");
    iniciarCajas(async () => {
      const r = await guardarPanelSucursal({ id: local.id, nombre: local.nombre, direccion: local.direccion, esDeposito: local.esDeposito, esPuntoVenta: local.esPuntoVenta, esMayorista: local.esMayorista, depositoId: local.depositoId, cantidadCajas: cantidad });
      if (!r.ok) { setErrorCajas(r.error); return; }
      router.refresh();
    });
  }
  function irACaja(localId: number, cajaId: number) {
    setErrorCajas("");
    iniciarCajas(async () => {
      const r = await seleccionarSucursal(localId);
      if (!r.ok) { setErrorCajas(r.error); return; }
      router.push(`/admin/caja?caja=${cajaId}`);
    });
  }
  const [seleccion, setSeleccion] = useState<number | null>(null);
  // El formulario del local aparece recién al pedir "Más detalles" desde el mapa.
  const [detalles, setDetalles] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  const actual = detalles ? locales.find(l => l.id === seleccion) ?? null : null;
  // El mapa muestra turnos y clientes: se refresca cada minuto mientras la pestaña está
  // visible y no hay un formulario abierto encima.
  const formularioAbierto = useRef(false);
  formularioAbierto.current = detalles || nuevo;
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !formularioAbierto.current) router.refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  function elegir(id: number | null) { if (id !== seleccion) setDetalles(false); setSeleccion(id); if (id !== null) setNuevo(false); }
  function masDetalles(id: number) { setSeleccion(id); setDetalles(true); setNuevo(false); }
  function abrirNuevo() { setNuevo(true); setSeleccion(null); setDetalles(false); setError(""); }
  const cerrarDetalles = useCallback(() => setDetalles(false), []);
  const cerrarNuevo = useCallback(() => setNuevo(false), []);
  function agregar() {
    setError("");
    iniciar(async () => {
      const resultado = await crearSucursal(nombre, direccion);
      if (!resultado.ok) { setError(resultado.error); return; }
      setNombre(""); setDireccion(""); setNuevo(false); setSeleccion(resultado.id); router.refresh();
    });
  }
  return <div className="space-y-5">
    <MapaSucursales locales={locales} cajas={cajas} estados={estados} actividad={actividad} onMasDetalles={masDetalles} ocupadoCajas={ocupadoCajas} errorCajas={errorCajas} onCambiarCajas={cambiarCajas} onIrACaja={irACaja} seleccion={seleccion} onSeleccionar={elegir} onNuevo={abrirNuevo} creando={nuevo} />
    {nuevo && <TarjetaFlotante titulo="Nueva sucursal" subtitulo="Terreno libre" ancho="max-w-2xl" onCerrar={cerrarNuevo}>
      <div className="p-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action={agregar}><label className="label">Nombre<input className="input mt-1" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} required autoFocus /></label><label className="label">Dirección<input className="input mt-1" value={direccion} onChange={e => setDireccion(e.target.value)} maxLength={200} /></label><button className="btn-primary" disabled={ocupado}>{ocupado ? "Creando…" : "Crear local"}</button>{error && <p role="alert" className="text-sm text-rose-700 sm:col-span-3">{error}</p>}</form>
      </div>
    </TarjetaFlotante>}
    {actual && <TarjetaFlotante titulo={actual.nombre} subtitulo={`Sucursal #${actual.id} · Activa`} onCerrar={cerrarDetalles}>
      <Tarjeta key={`${actual.id}-${cajas.filter(c => c.sucursalId === actual.id && c.activa).length}`} local={actual} locales={locales} cajas={cajas.filter(c => c.sucursalId === actual.id)} />
    </TarjetaFlotante>}
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
      <strong>Cómo configurar:</strong> tocá un local del mapa y elegí <strong>Más detalles</strong>. Ahí marcá una o varias funciones para cada local, elegí su depósito de abastecimiento y definí cuántas cajas pueden operar. Un local puede ser depósito y punto de venta a la vez. Cerrá y aprobá los turnos antes de quitar una caja.
    </div>
  </div>;
}
