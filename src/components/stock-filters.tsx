"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { OrdenStock } from "@/lib/stock-listado";

export function StockFilters({
  busqueda, categoria, orden, categorias, sucursal,
}: {
  busqueda: string;
  categoria: string;
  orden: OrdenStock;
  categorias: string[];
  sucursal?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function aplicar() {
    if (!form.current) return;
    const datos = new FormData(form.current);
    const query = new URLSearchParams({ vista: "inventario" });
    if (sucursal) query.set("sucursal", sucursal);
    const buscar = String(datos.get("buscar") ?? "").trim();
    const categoriaElegida = String(datos.get("categoria") ?? "");
    const ordenElegido = String(datos.get("orden") ?? "recientes");
    if (buscar) query.set("buscar", buscar);
    if (categoriaElegida) query.set("categoria", categoriaElegida);
    if (ordenElegido !== "recientes") query.set("orden", ordenElegido);
    router.replace(`/admin/stock?${query}`, { scroll: false });
  }

  function programarBusqueda() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; aplicar(); }, 300);
  }

  function aplicarSeleccion() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    aplicar();
  }

  return <form ref={form} onSubmit={e => { e.preventDefault(); aplicarSeleccion(); }} className="mb-3 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(9rem,15rem)_minmax(10rem,16rem)] sm:items-end">
    <label className="min-w-0 text-xs text-slate-600">Buscar en todo el stock
      <input className="input mt-1" name="buscar" type="search" defaultValue={busqueda} maxLength={100} placeholder="Nombre, SKU, categoría o precio…" onChange={programarBusqueda} />
    </label>
    <label className="text-xs text-slate-600">Categoría
      <select className="input mt-1" name="categoria" defaultValue={categoria} onChange={aplicarSeleccion}><option value="">Todas</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select>
    </label>
    <label className="text-xs text-slate-600">Ordenar
      <select className="input mt-1" name="orden" defaultValue={orden} onChange={aplicarSeleccion}>
        <option value="recientes">Más recientes</option><option value="bajo">Stock bajo primero</option>
        <option value="stock_asc">Menor stock primero</option><option value="stock_desc">Mayor stock primero</option>
        <option value="precio_asc">Menor precio de venta</option><option value="precio_desc">Mayor precio de venta</option>
        <option value="transito_desc">Mayor stock en tránsito</option><option value="transito_asc">Menor stock en tránsito</option>
      </select>
    </label>
  </form>;
}
