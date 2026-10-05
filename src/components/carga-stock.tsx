"use client";

import { useState } from "react";
import Link from "next/link";
import { PackagePlus, Loader2 } from "lucide-react";
import type { Compra, Sucursal } from "@/db/schema";
import { crearCargaStock } from "@/app/admin/(protected)/compras/actions";
import { CompraRecepcion } from "@/components/compra-recepcion";

export function CargaStock({ sucursales, activaId, borradores }: { sucursales: Sucursal[]; activaId: number | null; borradores: Compra[] }) {
  const [compra, setCompra] = useState<Compra | null>(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link className="btn-ghost" href="/admin/compras/diferencias-precios">Diferencias de precios</Link>
      <Link className="btn-ghost" href="/admin/compras">Ver compras e historial</Link>
    </div>
    <div className="grid gap-3 text-sm sm:grid-cols-3">
      {["1 · Subí el comprobante", "2 · Corregí y revisá el impacto", "3 · Confirmá stock y precios"].map(t => <div key={t} className="rounded-xl border border-slate-200 bg-white p-4 font-medium">{t}</div>)}
    </div>
    {!compra ? <>
      <form className="rounded-xl border border-slate-200 bg-white p-5" onSubmit={async e => {
        e.preventDefault(); const fd = new FormData(e.currentTarget); setCreando(true); setError("");
        try { const r = await crearCargaStock(fd); if (r.ok) setCompra(r.compra); else setError(r.error); }
        catch { setError("No se pudo iniciar la carga."); } finally { setCreando(false); }
      }}>
        <h2 className="mb-4 text-lg font-semibold">Nueva entrada de mercadería</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Proveedor<input name="proveedor" className="input mt-1" required placeholder="Nombre del proveedor" /></label>
          <label className="text-sm">Sucursal de destino<select name="sucursalId" className="input mt-1" defaultValue={activaId ?? ""} disabled={activaId !== null} required><option value="" disabled>Elegí dónde ingresa</option>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600" role="alert">{error}</p>}
        <button className="btn-primary mt-4" disabled={creando || !sucursales.length}>{creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Iniciar carga</button>
      </form>
      {borradores.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Retomar una carga pendiente</h2><div className="mt-3 flex flex-wrap gap-2">{borradores.map(c => <button className="btn-ghost" key={c.id} onClick={() => setCompra(c)}>#{c.id} · {c.proveedor}</button>)}</div></div>}
    </> : <div className="rounded-xl bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Carga #{compra.id} · {compra.proveedor} · {sucursales.find(s => s.id === compra.sucursalId)?.nombre}</h2><button className="btn-ghost" onClick={() => setCompra(null)}>Otra carga</button></div>
      <CompraRecepcion compra={compra} onCambio={() => {}} />
    </div>}
  </div>;
}
