"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FilterableTable, Col } from "@/components/filterable-table";
import { Estado } from "@/components/ui";
import { money } from "@/lib/format";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { NuevaVentaModal } from "@/components/nueva-venta-modal";
import type { Producto } from "@/db/schema";

type Venta = {
  id: number;
  total: number;
  estado: string;
  canal: string;
  medioPago: string;
  fecha: number | Date | null;
  cliente: string | null;
  /** Local donde se hizo. Null en las ventas anteriores a las sucursales. */
  sucursal?: string | null;
  cajero?: string | null;
};

const medio = (v: string) => ETIQUETA_MEDIO[v as MedioPago] ?? v;
const fechaVenta = (v: Venta) => v.fecha ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(v.fecha instanceof Date ? v.fecha : new Date(v.fecha * 1000)) : "—";
const diaVenta = (v: Venta) => v.fecha ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(v.fecha instanceof Date ? v.fecha : new Date(v.fecha * 1000)) : "sin-fecha";

export function VentasTabla({
  ventas,
  productos,
  clientes,
  permitirAlta = true,
}: {
  ventas: Venta[];
  productos: Producto[];
  clientes: { id: number; nombre: string }[];
  permitirAlta?: boolean;
}) {
  const [nueva, setNueva] = useState(false);

  const cols: Col<Venta>[] = [
    { key: "id", head: "#", cell: (v) => <span className="text-slate-400">#{v.id}</span>, value: (v) => v.id },
    { key: "cliente", head: "Cliente", cell: (v) => <span className="font-medium">{v.cliente ?? "Consumidor final"}</span>, value: (v) => v.cliente ?? "Consumidor final" },
    { key: "canal", head: "Canal", cell: (v) => <Estado value={v.canal} />, value: (v) => v.canal, filter: true },
    // La columna aparece sola cuando hay ventas con sucursal cargada: en la
    // vista de un solo local no aporta nada.
    ...(ventas.some((v) => v.sucursal)
      ? [{
          key: "sucursal", head: "Sucursal",
          cell: (v: Venta) => <span className="text-slate-500">{v.sucursal ?? "—"}</span>,
          value: (v: Venta) => v.sucursal ?? "—",
          filter: true,
        } satisfies Col<Venta>]
      : []),
    { key: "cajero", head: "Usuario", cell: (v) => <span className="text-slate-500">{v.cajero || "Sin registrar"}</span>, value: (v) => v.cajero || "Sin registrar", filter: true },
    { key: "medioPago", head: "Pago", cell: (v) => <span className="text-slate-500">{medio(v.medioPago)}</span>, value: (v) => medio(v.medioPago), filter: true },
    { key: "estado", head: "Estado", cell: (v) => <Estado value={v.estado} />, value: (v) => v.estado, filter: true },
    { key: "fecha", head: "Fecha", cell: (v) => <span className="text-slate-500">{fechaVenta(v)}</span>, value: (v) => (v.fecha instanceof Date ? v.fecha.getTime() : Number(v.fecha)), sort: true },
    { key: "total", head: "Total", cell: (v) => <span className="font-semibold tabular-nums">{money(v.total)}</span>, value: (v) => v.total, className: "font-semibold" },
  ];

  return (
    <>
      {permitirAlta && <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setNueva(true)}>
          <Plus className="h-4 w-4" /> Añadir venta
        </button>
      </div>}

      <FilterableTable
        rows={ventas}
        cols={cols}
        rowKey={(v) => v.id}
        search={(v) => `${v.id} ${v.cliente ?? "consumidor final"} ${v.estado} ${v.canal} ${v.sucursal ?? ""} ${v.cajero ?? ""} ${medio(v.medioPago)} ${v.total}`}
        searchPlaceholder="Buscar por cliente, estado, total…"
        sortOptions={[{ key: "fecha", label: "Más recientes", direction: "desc" }, { key: "fecha", label: "Más antiguas", direction: "asc" }]}
        groupBy={diaVenta}
        groupHeader={(key, rows) => <div className="flex flex-wrap items-center justify-between gap-2"><span>{key === "sin-fecha" ? "Sin fecha" : new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))}</span><span>Total del día: {money(rows.reduce((sum, v) => sum + (v.estado === "cancelada" ? 0 : v.total), 0))}</span></div>}
        mobileCard={(v) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.cliente ?? "Consumidor final"}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                #{v.id} · {fechaVenta(v)} · {medio(v.medioPago)} · {v.sucursal ?? "Sin sucursal"} · {v.cajero || "Sin usuario"}
              </p>
              <div className="mt-1 flex gap-1">
                <Estado value={v.canal} />
                <Estado value={v.estado} />
              </div>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{money(v.total)}</span>
          </div>
        )}
      />

      {permitirAlta && nueva && (
        <NuevaVentaModal productos={productos} clientes={clientes} onClose={() => setNueva(false)} />
      )}
    </>
  );
}
