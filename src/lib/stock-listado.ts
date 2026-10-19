import { db, productos, stockReglas, stockSucursal, stockTransito, stockConfiguracion } from "@/db";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import type { ProductoConStock } from "@/components/stock-manager";

export const TAMANO_PAGINA_STOCK = 50;
export type OrdenStock = "recientes" | "bajo" | "stock_asc" | "stock_desc" | "precio_asc" | "precio_desc" | "transito_asc" | "transito_desc";
export const ORDENES_STOCK: OrdenStock[] = ["recientes", "bajo", "stock_asc", "stock_desc", "precio_asc", "precio_desc", "transito_asc", "transito_desc"];

export async function listarStock({ pagina, busqueda, categoria, orden, sucursalId, administrador }: {
  pagina: number; busqueda: string; categoria: string; orden: OrdenStock; sucursalId: number | null; administrador: boolean;
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
  );
  const [[{ total }], [{ total: totalProductos }]] = await Promise.all([
    db.select({ total: count() }).from(productos).where(filtro),
    db.select({ total: count() }).from(productos).where(eq(productos.activo, true)),
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
  return { filas, total, totalProductos, paginas, paginaActual, multiplicador: config?.multiplicador ?? null, categorias: categorias.map(c => c.categoria ?? "").filter(Boolean) };
}
