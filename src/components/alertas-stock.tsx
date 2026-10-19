"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { ProductoConStock } from "@/components/stock-manager";
import { ConfigProductoStock } from "@/components/stock-configuracion";

export function AlertasStock({ items, administrador, global, totalAlertas, total, busqueda, mostrarTodas, sucursal }: {
  items: ProductoConStock[];
  administrador: boolean;
  global: number | null;
  totalAlertas: number;
  total: number;
  busqueda: string;
  mostrarTodas: boolean;
  sucursal?: string;
}) {
  const [producto, setProducto] = useState<ProductoConStock | null>(null);

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Alertas de stock</h2><p className="text-sm text-slate-500">{totalAlertas} productos para reponer</p></div>
    </div>
    <form action="/admin/stock" className="mb-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="vista" value="alertas" />
      {sucursal && <input type="hidden" name="sucursal" value={sucursal} />}
      <label className="min-w-[180px] flex-1 text-xs text-slate-600">Buscar en todas las alertas
        <input className="input mt-1" name="buscar" defaultValue={busqueda} maxLength={100} placeholder="Producto o código…" />
      </label>
      {administrador && <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="todas" value="1" defaultChecked={mostrarTodas} onChange={e => e.currentTarget.form?.requestSubmit()} />Mostrar todos para configurar
      </label>}
      <button className="btn-primary" type="submit">Buscar</button>
    </form>
    <p className="mb-3 text-sm text-slate-500">{total} resultado(s)</p>
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(p => {
        const bajo = p.alertaActiva && p.stockLocal < p.stockMinimo;
        return <li key={p.id} className={`card p-4 ${bajo ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${bajo ? "text-amber-700" : "text-slate-400"}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{!p.alertaActiva ? "Alerta desactivada" : p.stockLocal === 0 && bajo ? "Sin stock" : bajo ? "Stock bajo" : "Stock suficiente"}</p>
              <p className="mt-1 break-words font-semibold">{p.nombre}</p>
              <p className="mt-1 text-xs text-slate-500">{p.sku}</p>
              <p className="mt-3 text-sm">Disponible: <strong>{p.stockLocal}</strong> · Mínimo: {p.stockMinimo}</p>
              {administrador && <button className="btn-ghost mt-3 border border-slate-200 text-xs" onClick={() => setProducto(p)}>Configurar alerta y precio</button>}
            </div>
          </div>
        </li>;
      })}
    </ul>
    {!items.length && <p className="card p-6 text-sm text-slate-500">{busqueda ? "No hay productos que coincidan con la búsqueda." : "No hay alertas de stock bajo en esta vista."}</p>}
    {producto && <ConfigProductoStock producto={producto} global={global} cerrar={() => setProducto(null)} />}
  </>;
}
