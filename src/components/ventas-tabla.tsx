"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FilterableTable, Col } from "@/components/filterable-table";
import { Estado } from "@/components/ui";
import { money, fecha } from "@/lib/format";
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
};

const medio = (v: string) => ETIQUETA_MEDIO[v as MedioPago] ?? v;

export function VentasTabla({
  ventas,
  productos,
  clientes,
}: {
  ventas: Venta[];
  productos: Producto[];
  clientes: { id: number; nombre: string }[];
}) {
  const [nueva, setNueva] = useState(false);

  const cols: Col<Venta>[] = [
    { key: "id", head: "#", cell: (v) => <span className="text-slate-400">#{v.id}</span>, value: (v) => v.id, sort: true },
    { key: "cliente", head: "Cliente", cell: (v) => <span className="font-medium">{v.cliente ?? "Consumidor final"}</span>, value: (v) => v.cliente ?? "Consumidor final" },
    { key: "canal", head: "Canal", cell: (v) => <Estado value={v.canal} />, value: (v) => v.canal, filter: true },
    { key: "medioPago", head: "Pago", cell: (v) => <span className="text-slate-500">{medio(v.medioPago)}</span>, value: (v) => medio(v.medioPago), filter: true },
    { key: "estado", head: "Estado", cell: (v) => <Estado value={v.estado} />, value: (v) => v.estado, filter: true },
    { key: "fecha", head: "Fecha", cell: (v) => <span className="text-slate-500">{fecha(v.fecha)}</span>, value: (v) => (v.fecha instanceof Date ? v.fecha.getTime() : Number(v.fecha)), sort: true },
    { key: "total", head: "Total", cell: (v) => <span className="font-semibold tabular-nums">{money(v.total)}</span>, value: (v) => v.total, sort: true, className: "font-semibold" },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setNueva(true)}>
          <Plus className="h-4 w-4" /> Añadir venta
        </button>
      </div>

      <FilterableTable
        rows={ventas}
        cols={cols}
        rowKey={(v) => v.id}
        search={(v) => `${v.id} ${v.cliente ?? "consumidor final"} ${v.estado} ${v.canal} ${medio(v.medioPago)} ${v.total}`}
        searchPlaceholder="Buscar por cliente, estado, total…"
        mobileCard={(v) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.cliente ?? "Consumidor final"}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                #{v.id} · {fecha(v.fecha)} · {medio(v.medioPago)}
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

      {nueva && (
        <NuevaVentaModal productos={productos} clientes={clientes} onClose={() => setNueva(false)} />
      )}
    </>
  );
}
