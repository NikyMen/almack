import { db, productos } from "@/db";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { esSuperAdmin, tieneAcceso } from "@/lib/permisos";
import { PageHeader } from "@/components/ui";
import { StockManager, type ProductoConStock } from "@/components/stock-manager";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ sucursal?: string }> }) {
  const usuario = await requireAcceso("stock");
  const [items, desglose, transito, contexto] = await Promise.all([
    db.select().from(productos).orderBy(desc(productos.id)),
    desgloseStock(),
    desgloseTransito(),
    getContextoSucursal(),
  ]);
  const { lista } = contexto;
  const parametro = (await searchParams).sucursal;
  const activaId = esSuperAdmin(usuario) && parametro
    ? parametro === "todas" ? null : lista.find((s) => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const activa = lista.find((s) => s.id === activaId) ?? null;

  // En "Todas" la columna Stock es el total de la empresa; dentro de un local,
  // lo que hay en ese local y nada más.
  const filas: ProductoConStock[] = items.map((p) => {
    const porSucursal: Record<number, number> = {};
    for (const d of desglose.get(p.id) ?? []) porSucursal[d.sucursalId] = d.cantidad;
    const transitoPorSucursal: Record<number, number> = {};
    for (const d of transito.get(p.id) ?? []) transitoPorSucursal[d.sucursalId] = d.cantidad;
    return {
      ...p,
      porSucursal,
      transitoPorSucursal,
      stockLocal: activaId ? porSucursal[activaId] ?? 0 : p.stock,
      transitoLocal: activaId ? transitoPorSucursal[activaId] ?? 0 : Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
    };
  });

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={
          activa
            ? `Inventario de ${activa.nombre}.`
            : "Inventario consolidado de todas las sucursales."
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        <span className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">Inventario</span>
        {esSuperAdmin(usuario) && (
          <div className="flex flex-wrap gap-1" aria-label="Elegir sucursal para ver stock">
            <Link href="/admin/stock?sucursal=todas" className={`rounded-xl px-3 py-2 text-sm font-medium transition ${!activaId ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>Todas</Link>
            {lista.map((s) => <Link key={s.id} href={`/admin/stock?sucursal=${s.id}`} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${activaId === s.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s.nombre}</Link>)}
          </div>
        )}
        {tieneAcceso(usuario, "movimientos") && <Link href={`/admin/stock/mover?sucursal=${activaId ?? "todas"}`} className="ml-auto rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">Mover stock →</Link>}
      </div>
      <StockManager items={filas} sucursales={lista} sucursalActivaId={activaId} />
    </>
  );
}
