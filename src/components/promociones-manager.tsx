"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activarPromocion, guardarPromocion } from "@/app/admin/(protected)/ventas/promociones/actions";
import type { Promocion } from "@/lib/promociones";
import { money } from "@/lib/format";

type Datos = Parameters<typeof guardarPromocion>[0];
const nueva: Datos = { nombre: "", tipo: "total", activa: false, porcentaje: 10, productoIds: [], cantidadCombo: 2, modo: "continua", fechaUnica: "", mes: "", dias: [], diaSemana: 6 };
const tipos: Record<string, string> = { envio_gratis: "Envío gratis", combo: "Combo de productos", seleccionados: "Descuento en seleccionados", total: "Descuento del total" };
const semanas = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function numeros(json: string) { try { const x = JSON.parse(json); return Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n)) : []; } catch { return []; } }

export function PromocionesManager({ promociones, productos }: { promociones: Promocion[]; productos: { id: number; sku: string; nombre: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Datos>(nueva);
  const [mensaje, setMensaje] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [pendiente, start] = useTransition();
  const editar = (p: Promocion) => { const ids = numeros(p.productoIds); const activos = new Set(productos.map(producto => producto.id)); const productoIds = ids.filter(id => activos.has(id)); setForm({ id: p.id, nombre: p.nombre, tipo: p.tipo, activa: p.activa, porcentaje: p.porcentaje, productoIds, cantidadCombo: p.cantidadCombo, modo: p.modo, fechaUnica: p.fechaUnica, mes: p.mes, dias: numeros(p.dias), diaSemana: p.diaSemana }); setMensaje(ids.length > productoIds.length ? "Los productos archivados se quitarán de esta promoción al guardarla." : ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const guardar = () => start(async () => { const r = await guardarPromocion(form); setMensaje(r.ok ? "Promoción guardada." : r.error); if (r.ok) { setForm(nueva); router.refresh(); } });
  const alternar = (p: Promocion) => start(async () => { await activarPromocion(p.id, !p.activa); router.refresh(); });
  const productosVisibles = productos.filter(p => `${p.sku} ${p.nombre}`.toLocaleLowerCase("es").includes(busquedaProducto.trim().toLocaleLowerCase("es")));
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">{form.id ? "Editar promoción" : "Nueva promoción"}</h2>
      <label className="block text-sm">Nombre<input className="input mt-1" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} maxLength={100} /></label>
      <label className="block text-sm">Tipo<select className="input mt-1" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {form.tipo !== "envio_gratis" && <label className="block text-sm">Descuento porcentual<input className="input mt-1" type="number" min="0.01" max="99" step="0.01" value={form.porcentaje} onChange={e => setForm({ ...form, porcentaje: Number(e.target.value) })} /></label>}
      {form.tipo === "envio_gratis" && <p className="text-xs text-slate-500">El checkout actual no cobra envío por separado; esta promoción señala el envío gratis y no modifica el total.</p>}
      {(form.tipo === "combo" || form.tipo === "seleccionados") && <div><label htmlFor="buscar-producto-promocion" className="mb-2 block text-sm">Productos incluidos{form.productoIds.length > 0 ? ` · ${form.productoIds.length} seleccionados` : ""}</label><input id="buscar-producto-promocion" className="input mb-2" type="search" value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)} placeholder="Buscar por código o nombre" /><div className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 p-3">{productosVisibles.map(p => <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-slate-50"><input className="mt-1" type="checkbox" checked={form.productoIds.includes(p.id)} onChange={e => setForm({ ...form, productoIds: e.target.checked ? [...form.productoIds, p.id] : form.productoIds.filter(id => id !== p.id) })} /><span className="min-w-0"><span className="font-mono font-medium">{p.sku || "Sin código"}</span><span className="mx-1.5 text-slate-400">·</span><span>{p.nombre}</span><span className="ml-2 text-xs text-slate-400">#{p.id}</span></span></label>)}{productosVisibles.length === 0 && <p className="py-3 text-sm text-slate-500">No hay productos con ese código o nombre.</p>}</div></div>}
      {form.tipo === "combo" && <label className="block text-sm">Unidades mínimas combinadas<input className="input mt-1" type="number" min="2" step="1" value={form.cantidadCombo} onChange={e => setForm({ ...form, cantidadCombo: Number(e.target.value) })} /></label>}
      <label className="block text-sm">Cuándo aplica<select className="input mt-1" value={form.modo} onChange={e => setForm({ ...form, modo: e.target.value })}><option value="continua">Hasta desactivarla</option><option value="unica">Una fecha</option><option value="dias">Días exactos de un mes</option><option value="semanal">Cada día de semana de un mes</option></select></label>
      {form.modo === "unica" && <label className="block text-sm">Fecha<input className="input mt-1" type="date" value={form.fechaUnica} onChange={e => setForm({ ...form, fechaUnica: e.target.value })} /></label>}
      {(form.modo === "dias" || form.modo === "semanal") && <label className="block text-sm">Mes<input className="input mt-1" type="month" value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} /></label>}
      {form.modo === "dias" && <div><p className="mb-2 text-sm">Días del mes</p><div className="grid grid-cols-7 gap-1">{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <label key={d} className={`cursor-pointer rounded border p-1 text-center text-xs ${form.dias.includes(d) ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}><input className="sr-only" type="checkbox" checked={form.dias.includes(d)} onChange={e => setForm({ ...form, dias: e.target.checked ? [...form.dias, d] : form.dias.filter(x => x !== d) })} />{d}</label>)}</div></div>}
      {form.modo === "semanal" && <label className="block text-sm">Día de la semana<select className="input mt-1" value={form.diaSemana} onChange={e => setForm({ ...form, diaSemana: Number(e.target.value) })}>{semanas.map((s, i) => <option value={i} key={s}>{s}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} />Activar al guardar</label>
      <div className="flex gap-2"><button className="btn-primary" disabled={pendiente} onClick={guardar}>{pendiente ? "Guardando…" : "Guardar promoción"}</button>{form.id && <button className="btn-ghost" onClick={() => setForm(nueva)}>Cancelar edición</button>}</div>
      {mensaje && <p role="status" className="text-sm text-slate-600">{mensaje}</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Promociones configuradas</h2>{promociones.length === 0 && <p className="card p-5 text-sm text-slate-500">Todavía no hay promociones.</p>}{promociones.map(p => <div className="card p-4" key={p.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{p.nombre}</h3><p className="text-sm text-slate-500">{p.tipo === "precio_fijo" ? `Precio especial ${money(p.precioFijo ?? 0)}` : `${tipos[p.tipo] ?? p.tipo} ${p.tipo !== "envio_gratis" ? `· ${p.porcentaje}%` : ""}`}</p>{p.tipo === "precio_fijo" && <p className="text-xs text-slate-500">Productos: {numeros(p.productoIds).map(id => productos.find(item => item.id === id)?.nombre ?? `#${id}`).join(", ")} · mismas cantidades del pedido original</p>}<p className="text-xs text-slate-400">{p.modo === "continua" ? "Hasta desactivarla" : p.modo === "unica" ? p.fechaUnica : p.modo === "dias" ? `${p.mes} · días ${numeros(p.dias).join(", ")}` : `${p.mes} · cada ${semanas[p.diaSemana] ?? "semana"}`}</p></div><span className={`rounded-full px-2 py-1 text-xs ${p.activa ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{p.activa ? "Activada" : "Desactivada"}</span></div><div className="mt-3 flex gap-2">{p.tipo !== "precio_fijo" && <button className="btn-ghost text-sm" onClick={() => editar(p)}>Editar</button>}<button className="btn-ghost text-sm" disabled={pendiente} onClick={() => alternar(p)}>{p.activa ? "Desactivar" : "Activar"}</button></div></div>)}</section>
  </div>;
}
