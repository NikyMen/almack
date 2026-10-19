import { db, productos, stockReglas, stockSucursal, stockTransito, stockConfiguracion, stockMovimientos, stockMovimientoItems } from "@/db";
import { and, asc, count, countDistinct, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import type { ProductoConStock } from "@/components/stock-manager";
import type { ProductoTraslado } from "@/components/mover-stock";

export const TAMANO_PAGINA_STOCK = 50;
export type OrdenStock = "recientes" | "bajo" | "stock_asc" | "stock_desc" | "precio_asc" | "precio_desc" | "transito_asc" | "transito_desc";
export const ORDENES_STOCK: OrdenStock[] = ["recientes", "bajo", "stock_asc", "stock_desc", "precio_asc", "precio_desc", "transito_asc", "transito_desc"];

export async function buscarProductosTraslado(origenId: number, busqueda: string): Promise<ProductoTraslado[]> {
  const termino = busqueda.trim().slice(0, 100);
  if (!Number.isSafeInteger(origenId) || origenId <= 0 || !termino) return [];
  const filas = await db.select({ id: productos.id, nombre: productos.nombre, sku: productos.sku, cantidad: stockSucursal.cantidad })
    .from(stockSucursal).innerJoin(productos, eq(stockSucursal.productoId, productos.id))
    .where(and(eq(stockSucursal.sucursalId, origenId), gt(stockSucursal.cantidad, 0), eq(productos.activo, true),
      or(sql`instr(lower(${productos.nombre}), lower(${termino})) > 0`, sql`instr(lower(${productos.sku}), lower(${termino})) > 0`)))
    .orderBy(productos.nombre, productos.id).limit(8);
  return filas.map(p => ({ id: p.id, nombre: p.nombre, sku: p.sku, porSucursal: { [origenId]: p.cantidad } }));
}

export async function listarLineasTransito(destinoId: number | null, pagina: number) {
  const filtro = and(
    inArray(stockMovimientos.estado, ["en_transito", "rechazado"]),
    destinoId ? eq(stockMovimientos.destinoId, destinoId) : undefined,
  );
  const [{ total, unidades, traslados }] = await db.select({
    total: count(), unidades: sql<number>`coalesce(sum(${stockMovimientoItems.cantidad}), 0)`, traslados: countDistinct(stockMovimientos.id),
  }).from(stockMovimientoItems)
    .innerJoin(stockMovimientos, eq(stockMovimientoItems.movimientoId, stockMovimientos.id))
    .innerJoin(productos, eq(stockMovimientoItems.productoId, productos.id)).where(filtro);
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_STOCK));
  const paginaActual = Math.min(Math.max(1, pagina), paginas);
  const filas = await db.select({
    itemId: stockMovimientoItems.id, movimientoId: stockMovimientos.id, sku: productos.sku,
    producto: stockMovimientoItems.descripcion, cantidad: stockMovimientoItems.cantidad,
    origenId: stockMovimientos.origenId, destinoId: stockMovimientos.destinoId,
    estado: stockMovimientos.estado, creadoEn: stockMovimientos.creadoEn,
  }).from(stockMovimientoItems)
    .innerJoin(stockMovimientos, eq(stockMovimientoItems.movimientoId, stockMovimientos.id))
    .innerJoin(productos, eq(stockMovimientoItems.productoId, productos.id))
    .where(filtro).orderBy(desc(stockMovimientos.id), stockMovimientoItems.id)
    .limit(TAMANO_PAGINA_STOCK).offset((paginaActual - 1) * TAMANO_PAGINA_STOCK);
  return { filas, total, unidades, traslados, paginas, paginaActual };
}

export async function listarStock({ pagina, busqueda, categoria, orden, sucursalId, administrador, soloAlertas = false, contarAlertas = false }: {
  pagina: number; busqueda: string; categoria: string; orden: OrdenStock; sucursalId: number | null; administrador: boolean; soloAlertas?: boolean; contarAlertas?: boolean;
}) {
  const stockLocal = sucursalId
    ? sql<number>`coalesce((select sum(${stockSucursal.cantidad}) from ${stockSucursal} where ${stockSucursal.productoId} = ${productos.id} and ${stockSucursal.sucursalId} = ${sucursalId}), 0)`
    : productos.stock;
  const transitoLocal = sucursalId
    ? sql<number>`coalesce((select sum(${stockTransito.cantidad}) from ${stockTransito} where ${stockTransito.productoId} = ${productos.id} and ${stockTransito.sucursalId} = ${sucursalId}), 0)`
    : sql<number>`coalesce((select sum(${stockTransito.cantidad}) from ${stockTransito} where ${stockTransito.productoId} = ${productos.id}), 0)`;
  const bajo = sql<number>`case when coalesce((select ${stockReglas.alertaActiva} from ${stockReglas} where ${stockReglas.productoId} = ${productos.id}), 1) = 1 and ${stockLocal} < ${productos.stockMinimo} then 0 else 1 end`;
  const termino = busqueda.trim().slice(0, 100);
  const filtro = and(
    eq(productos.activo, true),
    termino ? or(
      sql`instr(lower(${productos.nombre}), lower(${termino})) > 0`,
      sql`instr(lower(${productos.sku}), lower(${termino})) > 0`,
      sql`instr(lower(${productos.categoria}), lower(${termino})) > 0`,
      sql`instr(cast(${productos.precioVenta} as text), ${termino}) > 0`,
    ) : undefined,
    categoria ? eq(productos.categoria, categoria) : undefined,
    soloAlertas ? eq(bajo, 0) : undefined,
  );
  const [[{ total }], [{ total: totalProductos }], [{ total: totalAlertas }]] = await Promise.all([
    db.select({ total: count() }).from(productos).where(filtro),
    db.select({ total: count() }).from(productos).where(eq(productos.activo, true)),
    contarAlertas ? db.select({ total: count() }).from(productos).where(and(eq(productos.activo, true), eq(bajo, 0))) : Promise.resolve([{ total: 0 }]),
  ]);
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_STOCK));
  const paginaActual = Math.min(Math.max(1, pagina), paginas);
  const ordenSql = {
    recientes: [desc(productos.id)],
    bajo: [asc(bajo), asc(stockLocal), desc(productos.id)],
    stock_asc: [asc(stockLocal), desc(productos.id)],
    stock_desc: [desc(stockLocal), desc(productos.id)],
    precio_asc: [asc(productos.precioVenta), desc(productos.id)],
    precio_desc: [desc(productos.precioVenta), desc(productos.id)],
    transito_asc: [asc(transitoLocal), desc(productos.id)],
    transito_desc: [desc(transitoLocal), desc(productos.id)],
  }[orden];
  const items = await db.select().from(productos).where(filtro)
    .orderBy(...ordenSql).limit(TAMANO_PAGINA_STOCK).offset((paginaActual - 1) * TAMANO_PAGINA_STOCK);
  const ids = items.map(p => p.id);
  const [desglose, transito, reglas, [config], categorias] = await Promise.all([
    ids.length ? desgloseStock(ids) : new Map(),
    ids.length ? desgloseTransito(ids) : new Map(),
    ids.length ? db.select().from(stockReglas).where(inArray(stockReglas.productoId, ids)) : [],
    db.select().from(stockConfiguracion).limit(1),
    db.selectDistinct({ categoria: productos.categoria }).from(productos).where(eq(productos.activo, true)).orderBy(productos.categoria),
  ]);
  const reglasPorId = new Map(reglas.map(r => [r.productoId, r]));
  const filas: ProductoConStock[] = items.map(p => {
    const porSucursal: Record<number, number> = {};
    for (const d of desglose.get(p.id) ?? []) if (administrador || d.sucursalId === sucursalId) porSucursal[d.sucursalId] = d.cantidad;
    const transitoPorSucursal: Record<number, number> = {};
    for (const d of transito.get(p.id) ?? []) if (administrador || d.sucursalId === sucursalId) transitoPorSucursal[d.sucursalId] = d.cantidad;
    return {
      ...p,
      stock: administrador ? p.stock : (sucursalId ? porSucursal[sucursalId] ?? 0 : 0),
      alertaActiva: reglasPorId.get(p.id)?.alertaActiva ?? true,
      multiplicadorCosto: reglasPorId.get(p.id)?.multiplicador ?? null,
      porSucursal, transitoPorSucursal,
      stockLocal: sucursalId ? porSucursal[sucursalId] ?? 0 : p.stock,
      transitoLocal: sucursalId ? transitoPorSucursal[sucursalId] ?? 0 : Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
    };
  });
  return { filas, total, totalProductos, totalAlertas, paginas, paginaActual, multiplicador: config?.multiplicador ?? null, categorias: categorias.map(c => c.categoria ?? "").filter(Boolean) };
}
