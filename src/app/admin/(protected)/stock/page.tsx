import { db, productos, stockMovimientoItems, stockMovimientos } from "@/db";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { esSuperAdmin, tieneAcceso } from "@/lib/permisos";
import { PageHeader } from "@/components/ui";
import { StockManager, type ProductoConStock } from "@/components/stock-manager";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";
import { StockTransitoView, type LineaEnTransito } from "@/components/stock-transito-view";

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
  const administrador = esSuperAdmin(usuario);
  const modoTransito = parametro === "transito" || Boolean(parametro?.startsWith("transito-"));
  const destinoSolicitado = parametro?.startsWith("transito-") ? parametro.slice("transito-".length) : null;
  const destinoId = modoTransito
    ? administrador
      ? lista.find((s) => String(s.id) === destinoSolicitado)?.id ?? null
      : contexto.activaId
    : null;
  const activaId = administrador && parametro && !modoTransito
    ? parametro === "todas" ? null : lista.find((s) => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const activa = lista.find((s) => s.id === activaId) ?? null;
  const destino = lista.find((s) => s.id === destinoId) ?? null;

  const pendientes = modoTransito ? await db
    .select({
      itemId: stockMovimientoItems.id,
      movimientoId: stockMovimientos.id,
      sku: productos.sku,
      producto: stockMovimientoItems.descripcion,
      cantidad: stockMovimientoItems.cantidad,
      origenId: stockMovimientos.origenId,
      destinoId: stockMovimientos.destinoId,
      estado: stockMovimientos.estado,
      creadoEn: stockMovimientos.creadoEn,
    })
    .from(stockMovimientoItems)
    .innerJoin(stockMovimientos, eq(stockMovimientoItems.movimientoId, stockMovimientos.id))
    .innerJoin(productos, eq(stockMovimientoItems.productoId, productos.id))
    .where(and(
      inArray(stockMovimientos.estado, ["en_transito", "rechazado"]),
      destinoId ? eq(stockMovimientos.destinoId, destinoId) : undefined,
    ))
    .orderBy(desc(stockMovimientos.id), stockMovimientoItems.id) : [];
  const nombres = new Map(lista.map((s) => [s.id, s.nombre]));
  const lineasEnTransito: LineaEnTransito[] = pendientes.map((p) => ({
    itemId: p.itemId,
    movimientoId: p.movimientoId,
    sku: p.sku,
    producto: p.producto,
    cantidad: p.cantidad,
    origen: nombres.get(p.origenId) ?? `Sucursal ${p.origenId}`,
    destino: nombres.get(p.destinoId) ?? `Sucursal ${p.destinoId}`,
    estado: p.estado === "rechazado" ? "rechazado" : "en_transito",
    creadoEn: p.creadoEn,
  }));

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
          modoTransito
            ? destino ? `Mercadería pendiente para ${destino.nombre}.` : "Mercadería pendiente de todas las sucursales."
            : activa
            ? `Inventario de ${activa.nombre}.`
            : "Inventario consolidado de todas las sucursales."
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        <span className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">Vista</span>
        {administrador && (
          <div className="flex flex-wrap gap-1" aria-label="Elegir sucursal para ver stock">
            <Link href="/admin/stock?sucursal=todas" className={`rounded-xl px-3 py-2 text-sm font-medium transition ${!modoTransito && !activaId ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>Todas</Link>
            {lista.map((s) => <Link key={s.id} href={`/admin/stock?sucursal=${s.id}`} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${!modoTransito && activaId === s.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s.nombre}</Link>)}
          </div>
        )}
        <Link href="/admin/stock?sucursal=transito" aria-current={modoTransito ? "page" : undefined} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${modoTransito ? "bg-amber-100 text-amber-900" : "text-slate-600 hover:bg-slate-100"}`}>Tránsito</Link>
        {tieneAcceso(usuario, "movimientos") && <Link href={`/admin/stock/mover?sucursal=${modoTransito ? destinoId ?? "todas" : activaId ?? "todas"}`} className="ml-auto rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">Mover stock →</Link>}
      </div>
      {modoTransito
        ? <StockTransitoView lineas={lineasEnTransito} sucursales={lista} destinoId={destinoId} elegirDestino={administrador} />
        : <StockManager items={filas} sucursales={lista} sucursalActivaId={activaId} />}
    </>
  );
}
