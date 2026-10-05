"use client";
import { useState } from "react";
import type { diferenciasPrecios } from "@/db/schema";
import { money, fechaHora } from "@/lib/format";
import { FilterableTable, type Col } from "@/components/filterable-table";

type Registro = typeof diferenciasPrecios.$inferSelect;
export function DiferenciasPreciosTabla({ registros }: { registros: Registro[] }) {
  const [filtro, setFiltro] = useState("todos");
  const filas = registros.filter(r => filtro === "todos" || (filtro === "subas" ? r.porcentaje > 0 : r.porcentaje < 0));
  const cols: Col<Registro>[] = [
    { key: "nombre", head: "Producto", cell: r => <><b>{r.nombre}</b><span className="block font-mono text-xs text-slate-400">{r.codigo}</span></>, value: r => r.nombre, sort: true },
    { key: "creadoEn", head: "Carga", cell: r => <><span>#{r.compraId}</span><span className="block text-xs text-slate-400">{fechaHora(r.creadoEn)} · {r.usuarioNombre}</span></> },
    { key: "costoAnterior", head: "Costo anterior", cell: r => money(r.costoAnterior) },
    { key: "costoNuevo", head: "Costo nuevo", cell: r => money(r.costoNuevo) },
    { key: "porcentaje", head: "Variación", cell: r => <span className={r.porcentaje > 0 ? "text-amber-700" : "text-emerald-700"}>{r.porcentaje > 0 ? "+" : ""}{r.porcentaje.toFixed(2)} %</span>, value: r => r.porcentaje, sort: true },
    { key: "ventaSugerida", head: "Venta sugerida", cell: r => r.ventaSugerida === null ? "Sin margen previo" : money(r.ventaSugerida) },
    { key: "ventaNueva", head: "Decisión", cell: r => <><span className="badge bg-slate-100 text-slate-600">{r.revalorizado ? "Revalorizado" : "Precio conservado"}</span><span className="mt-1 block text-xs">{money(r.ventaAnterior)} → {money(r.ventaNueva)}</span></> },
  ];
  return <><div className="mb-4 flex gap-2">{[ ["todos", "Todos"], ["subas", "Subas"], ["bajas", "Bajas"] ].map(([key, label]) => <button key={key} className={filtro === key ? "btn-primary" : "btn-ghost"} onClick={() => setFiltro(key)}>{label}</button>)}</div><FilterableTable rows={filas} cols={cols} rowKey={r => r.id} search={r => `${r.nombre} ${r.codigo} ${r.compraId} ${r.usuarioNombre}`} searchPlaceholder="Buscar producto, código o carga…" /></>;
}
