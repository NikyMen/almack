"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Building2, Plus, Search } from "lucide-react";
import type { proveedores } from "@/db";
import { guardarProveedor } from "@/app/admin/(protected)/compras/proveedores/actions";

type Proveedor = typeof proveedores.$inferSelect;
export function ProveedoresLista({ lista }: { lista: { proveedor: Proveedor; articulos: number }[] }) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, start] = useTransition();
  const visibles = lista.filter(x => `${x.proveedor.nombre} ${x.proveedor.cuit} ${x.proveedor.contacto}`.toLowerCase().includes(buscar.toLowerCase()));
  const crear = () => start(async () => {
    const r = await guardarProveedor({ nombre, cuit: "", contacto: "", telefono: "", email: "", direccion: "", notas: "", activo: true });
    if (r.ok) router.push(`/admin/compras/proveedores/${r.id}`);
    else setMensaje(r.error);
  });
  return <>
    <div className="mb-5 flex flex-wrap gap-3"><div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proveedor, CUIT o contacto…" /></div><button className="btn-primary" onClick={() => setNuevo(!nuevo)}><Plus className="h-4 w-4" /> Nuevo proveedor</button></div>
    {nuevo && <form className="card mb-5 flex flex-wrap items-end gap-3 p-5" action={crear}><label className="min-w-56 flex-1 text-sm font-medium">Nombre del proveedor<input className="input mt-1" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} required autoFocus /></label><button className="btn-primary" disabled={pendiente || !nombre.trim()}>{pendiente ? "Guardando…" : "Crear proveedor"}</button>{mensaje && <p role="alert" className="w-full text-sm text-rose-700">{mensaje}</p>}</form>}
    {visibles.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{visibles.map(({ proveedor: p, articulos }) => <Link key={p.id} href={`/admin/compras/proveedores/${p.id}`} className="group card flex min-h-36 flex-col justify-between p-5 transition hover:border-orange-300 hover:shadow-lg"><div className="flex items-start gap-3"><span className="rounded-xl bg-orange-50 p-3 text-orange-700"><Building2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-navy">{p.nombre}</h2><p className="mt-1 text-xs text-slate-500">{p.contacto || p.cuit || "Sin datos de contacto"}</p></div><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{articulos} artículos en catálogo</span><span className={p.activo ? "text-emerald-700" : "text-slate-400"}>{p.activo ? "Activo" : "Inactivo"}</span></div></Link>)}</div> : <div className="card p-8 text-center text-sm text-slate-500">{buscar ? "No hay proveedores que coincidan." : "Todavía no hay proveedores. Creá el primero para cargar su catálogo."}</div>}
  </>;
}
