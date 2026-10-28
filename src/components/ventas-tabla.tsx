"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Overlay } from "@/components/overlay";
import { FilterableTable, Col } from "@/components/filterable-table";
import { Estado } from "@/components/ui";
import { moneyPreciso } from "@/lib/format";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { NuevaVentaModal } from "@/components/nueva-venta-modal";
import type { Producto } from "@/db/schema";
import { detalleVenta } from "@/app/admin/(protected)/ventas/historial/actions";

type Detalle = Extract<Awaited<ReturnType<typeof detalleVenta>>, { ok: true }>;

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
  const [seleccionada, setSeleccionada] = useState<Venta | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [errorDetalle, setErrorDetalle] = useState("");

  useEffect(() => {
    if (!seleccionada) return;
    let vigente = true;
    setDetalle(null);
    setErrorDetalle("");
    detalleVenta(seleccionada.id).then((r) => {
      if (!vigente) return;
      if (r.ok) setDetalle(r);
      else setErrorDetalle(r.error);
    }).catch(() => { if (vigente) setErrorDetalle("No se pudo cargar el detalle de la venta."); });
    return () => { vigente = false; };
  }, [seleccionada]);

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
    { key: "total", head: "Total", cell: (v) => <span className="font-semibold tabular-nums">{moneyPreciso(v.total)}</span>, value: (v) => v.total, className: "font-semibold" },
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
        onRowClick={setSeleccionada}
        search={(v) => `${v.id} ${v.cliente ?? "consumidor final"} ${v.estado} ${v.canal} ${v.sucursal ?? ""} ${v.cajero ?? ""} ${medio(v.medioPago)} ${v.total}`}
        searchPlaceholder="Buscar por cliente, estado, total…"
        sortOptions={[{ key: "fecha", label: "Más recientes", direction: "desc" }, { key: "fecha", label: "Más antiguas", direction: "asc" }]}
        groupBy={diaVenta}
        groupHeader={(key, rows) => <div className="flex flex-wrap items-center justify-between gap-2"><span>{key === "sin-fecha" ? "Sin fecha" : new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))}</span><span>Total del día: {moneyPreciso(rows.reduce((sum, v) => sum + (v.estado === "cancelada" ? 0 : v.total), 0))}</span></div>}
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
            <span className="shrink-0 text-sm font-semibold tabular-nums">{moneyPreciso(v.total)}</span>
          </div>
        )}
      />

      {seleccionada && <Overlay className="overlay" onClick={() => setSeleccionada(null)}>
        <div className="sheet sm:max-w-xl" role="dialog" aria-modal="true" aria-label={`Detalle de la venta #${seleccionada.id}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h3 className="text-lg font-semibold">Venta #{seleccionada.id}</h3><p className="text-sm text-slate-500">{fechaVenta(seleccionada)} · {seleccionada.sucursal ?? "Sin sucursal"}</p></div>
            <button className="btn-ghost px-2 py-1.5" onClick={() => setSeleccionada(null)} aria-label="Cerrar detalle"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-4 p-5 text-sm">
            {!detalle && !errorDetalle && <p className="text-slate-500">Cargando detalle…</p>}
            {errorDetalle && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-600">{errorDetalle}</p>}
            {detalle && <>
              <div className="flex flex-wrap gap-2"><span className="badge bg-slate-100 text-slate-700">{medio(detalle.venta.medioPago)}</span><Estado value={detalle.venta.estado} /><span className="text-slate-500">{detalle.venta.cajero || "Sin usuario"}</span></div>
              <div><h4 className="mb-2 font-semibold">Productos</h4><div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                {detalle.items.map((item) => <div key={item.id} className="flex justify-between gap-3 py-2"><div className="min-w-0"><p className="font-medium">{item.nombre ?? "Producto eliminado"}</p><p className="text-xs text-slate-500">{item.sku ?? "—"} · {item.cantidad} × {moneyPreciso(item.precioUnit)}</p></div><span className="shrink-0 font-semibold tabular-nums">{moneyPreciso(item.cantidad * item.precioUnit)}</span></div>)}
                {detalle.items.length === 0 && <p className="py-3 text-slate-500">Sin productos registrados.</p>}
              </div></div>
              {detalle.items.reduce((n, item) => n + item.cantidad * item.precioUnit, 0) > detalle.venta.total + 0.01 && <p className="text-emerald-700">Descuento aplicado: {moneyPreciso(detalle.items.reduce((n, item) => n + item.cantidad * item.precioUnit, 0) - detalle.venta.total)}</p>}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><span>Total cobrado</span><span>{moneyPreciso(detalle.venta.total)}</span></div>
              {detalle.venta.medioPago === "efectivo" && detalle.venta.efectivoRecibido !== null && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3"><div><p className="text-xs text-slate-500">Recibido</p><p className="font-semibold">{moneyPreciso(detalle.venta.efectivoRecibido)}</p></div><div><p className="text-xs text-slate-500">Vuelto entregado</p><p className="font-semibold">{moneyPreciso(detalle.venta.vuelto ?? 0)}</p></div></div>}
              {detalle.puedeVerSaldo && <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Efectivo esperado en caja {detalle.venta.cajaTurnoId ? `· turno #${detalle.venta.cajaTurnoId}` : ""}</p>{detalle.venta.efectivoAntes !== null && detalle.venta.efectivoDespues !== null ? <p className="mt-1 text-lg font-bold tabular-nums text-navy">{moneyPreciso(detalle.venta.efectivoAntes)} → {moneyPreciso(detalle.venta.efectivoDespues)}</p> : <p className="mt-1 text-sm text-slate-600">Saldo anterior no registrado para esta venta.</p>}</div>}
            </>}
          </div>
        </div>
      </Overlay>}

      {permitirAlta && nueva && (
        <NuevaVentaModal productos={productos} clientes={clientes} onClose={() => setNueva(false)} />
      )}
    </>
  );
}
