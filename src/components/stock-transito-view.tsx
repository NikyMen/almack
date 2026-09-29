import Link from "next/link";
import { fechaHora } from "@/lib/format";
import type { Sucursal } from "@/db/schema";

export type LineaEnTransito = {
  itemId: number;
  movimientoId: number;
  sku: string;
  producto: string;
  cantidad: number;
  origen: string;
  destino: string;
  estado: "en_transito" | "rechazado";
  creadoEn: Date | null;
};

export function StockTransitoView({ lineas, sucursales, destinoId, elegirDestino }: {
  lineas: LineaEnTransito[];
  sucursales: Sucursal[];
  destinoId: number | null;
  elegirDestino: boolean;
}) {
  const unidades = lineas.reduce((total, linea) => total + linea.cantidad, 0);
  const traslados = new Set(lineas.map((linea) => linea.movimientoId)).size;

  return (
    <section aria-label="Stock en tránsito">
      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Stock en tránsito</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-navy">{unidades} <span className="text-sm font-medium text-slate-600">unidades</span></p>
          </div>
          <p className="text-sm text-slate-600">{traslados} {traslados === 1 ? "traslado pendiente" : "traslados pendientes"}. Esta mercadería todavía no está disponible para vender.</p>
        </div>
      </div>

      {elegirDestino && (
        <nav aria-label="Filtrar tránsito por destino" className="mb-5 flex flex-wrap gap-2">
          <Link href="/admin/stock?sucursal=transito" aria-current={destinoId === null ? "page" : undefined} className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${destinoId === null ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>Todos los destinos</Link>
          {sucursales.map((s) => (
            <Link key={s.id} href={`/admin/stock?sucursal=transito-${s.id}`} aria-current={destinoId === s.id ? "page" : undefined} className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${destinoId === s.id ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>Tránsito · {s.nombre}</Link>
          ))}
        </nav>
      )}

      {lineas.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No hay mercadería pendiente en tránsito{destinoId ? " para esta sucursal" : ""}.</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Unidades</th><th className="px-4 py-3">Origen</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">Traslado</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((linea) => (
                  <tr key={linea.itemId}>
                    <td className="px-4 py-3"><span className="font-semibold text-navy">{linea.producto}</span><span className="block font-mono text-xs text-slate-400">{linea.sku}</span></td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{linea.cantidad}</td>
                    <td className="px-4 py-3">{linea.origen}</td>
                    <td className="px-4 py-3"><EstadoTransito estado={linea.estado} /></td>
                    <td className="px-4 py-3">{linea.destino}</td>
                    <td className="px-4 py-3 text-slate-500">#{linea.movimientoId}<span className="block text-xs">{fechaHora(linea.creadoEn)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {lineas.map((linea) => (
              <article key={linea.itemId} className="card p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-navy">{linea.producto}</p><p className="font-mono text-xs text-slate-400">{linea.sku} · traslado #{linea.movimientoId}</p></div><span className="shrink-0 text-lg font-bold tabular-nums">{linea.cantidad}</span></div>
                <dl className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Origen</dt><dd className="text-right font-medium">{linea.origen}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Estado</dt><dd><EstadoTransito estado={linea.estado} /></dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Destino</dt><dd className="text-right font-medium">{linea.destino}</dd></div></dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EstadoTransito({ estado }: { estado: LineaEnTransito["estado"] }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estado === "rechazado" ? "bg-rose-50 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{estado === "rechazado" ? "Rechazado · pendiente de devolución" : "En tránsito"}</span>;
}
