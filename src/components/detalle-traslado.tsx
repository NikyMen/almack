"use client";
import { FilterableTable } from "@/components/filterable-table";
import { RecepcionTraslado, type TrasladoVista } from "@/components/mover-stock";
export function DetalleTraslado({ traslado: m, sucursalActivaId }: { traslado: TrasladoVista; sucursalActivaId: number | null }) {
  const recibido = m.estado === "recibido";
  return <section className="card p-4 sm:p-5">
    <h2 className="mb-4 font-semibold">Productos del movimiento · {m.unidades} unidades</h2>
    <FilterableTable rows={m.items} rowKey={i => i.id} search={i => `${i.codigo ?? ""} ${i.nombre}`} searchPlaceholder="Buscar por código o nombre…" cols={[
      { key: "codigo", head: "Código", cell: i => <span className="break-all font-mono text-xs">{i.codigo ?? "—"}</span>, value: i => i.codigo ?? "", sort: true },
      { key: "nombre", head: "Producto", cell: i => i.nombre, value: i => i.nombre, sort: true },
      { key: "cantidad", head: "Cantidad enviada", cell: i => i.enviado, value: i => i.enviado, sort: true },
      ...(m.items.some(i => i.verificado !== null) ? [{ key: "verificado", head: "Verificada", cell: (i: TrasladoVista["items"][number]) => i.verificado ?? "—" }] : []),
      ...(recibido ? [{ key: "ingresado", head: "Ingresada", cell: (i: TrasladoVista["items"][number]) => i.ingresado }] : []),
    ]} mobileCard={i => <div><p className="break-all font-mono text-xs text-slate-500">{i.codigo ?? "—"}</p><p className="mt-1 break-words font-semibold">{i.nombre}</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between gap-3"><dt>Cantidad enviada</dt><dd className="font-semibold tabular-nums">{i.enviado}</dd></div>{i.verificado !== null && <div className="flex justify-between gap-3"><dt>Verificada</dt><dd>{i.verificado}</dd></div>}{recibido && <div className="flex justify-between gap-3"><dt>Ingresada</dt><dd>{i.ingresado}</dd></div>}</dl></div>} />
    {m.estado === "en_transito" && (sucursalActivaId === null || sucursalActivaId === m.destinoId) && <RecepcionTraslado key={`${m.id}-${m.estado}`} traslado={m} modo="recepcion" />}
    {m.estado === "rechazado" && (sucursalActivaId === null || sucursalActivaId === m.origenId) && <RecepcionTraslado key={`${m.id}-${m.estado}`} traslado={m} modo="devolucion" />}
  </section>;
}