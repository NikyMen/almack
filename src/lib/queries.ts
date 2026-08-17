import { db, productos, ventas, compras, clientes, facturas } from "@/db";
import { sql, desc, eq, lt } from "drizzle-orm";

export async function getResumen() {
  const [ventasTot] = await db
    .select({ total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .where(eq(ventas.estado, "completada"));

  const [comprasTot] = await db
    .select({ total: sql<number>`coalesce(sum(${compras.total}),0)` })
    .from(compras);

  const [clientesTot] = await db.select({ count: sql<number>`count(*)` }).from(clientes);

  const bajoStock = await db
    .select()
    .from(productos)
    .where(lt(productos.stock, productos.stockMinimo));

  const [valorStock] = await db
    .select({ valor: sql<number>`coalesce(sum(${productos.stock} * ${productos.precioCompra}),0)` })
    .from(productos);

  return {
    ventasTotal: ventasTot?.total ?? 0,
    ventasCount: ventasTot?.count ?? 0,
    comprasTotal: comprasTot?.total ?? 0,
    clientesCount: clientesTot?.count ?? 0,
    bajoStock,
    valorStock: valorStock?.valor ?? 0,
  };
}

export async function getContextoNegocio(): Promise<string> {
  const r = await getResumen();
  const topProductos = await db
    .select({ nombre: productos.nombre, stock: productos.stock, precio: productos.precioVenta })
    .from(productos)
    .orderBy(desc(productos.stock))
    .limit(8);

  return [
    `Ventas completadas: ${r.ventasCount} por un total de $${r.ventasTotal}.`,
    `Compras acumuladas: $${r.comprasTotal}.`,
    `Clientes registrados: ${r.clientesCount}.`,
    `Valor del inventario (a costo): $${r.valorStock}.`,
    `Productos con stock bajo (${r.bajoStock.length}): ${r.bajoStock.map((p) => p.nombre).join(", ") || "ninguno"}.`,
    `Catálogo: ${topProductos.map((p) => `${p.nombre} (stock ${p.stock}, $${p.precio})`).join("; ")}.`,
  ].join("\n");
}

export async function getMetricas() {
  const r = await getResumen();

  // Ventas por mes (últimos 6 meses, solo completadas)
  const ventasMes = await db
    .select({
      mes: sql<string>`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`,
      total: sql<number>`coalesce(sum(${ventas.total}),0)`,
      count: sql<number>`count(*)`,
    })
    .from(ventas)
    .where(eq(ventas.estado, "completada"))
    .groupBy(sql`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`);

  // Ventas por canal
  const porCanal = await db
    .select({ canal: ventas.canal, total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .where(eq(ventas.estado, "completada"))
    .groupBy(ventas.canal);

  // Por estado (todas)
  const porEstado = await db
    .select({ estado: ventas.estado, total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .groupBy(ventas.estado);

  // Cuentas por cobrar (facturas emitidas, no pagadas)
  const [porCobrar] = await db
    .select({ total: sql<number>`coalesce(sum(${facturas.total}),0)`, count: sql<number>`count(*)` })
    .from(facturas)
    .where(eq(facturas.estado, "emitida"));

  // Top productos por valor de inventario
  const topInventario = await db
    .select({ nombre: productos.nombre, stock: productos.stock, valor: sql<number>`${productos.stock} * ${productos.precioCompra}` })
    .from(productos)
    .orderBy(desc(sql`${productos.stock} * ${productos.precioCompra}`))
    .limit(5);

  const ticketPromedio = r.ventasCount ? r.ventasTotal / r.ventasCount : 0;
  const margenBruto = r.ventasTotal - r.comprasTotal;
  const margenPct = r.ventasTotal ? (margenBruto / r.ventasTotal) * 100 : 0;

  return {
    ...r,
    ventasMes,
    porCanal,
    porEstado,
    porCobrar: { total: porCobrar?.total ?? 0, count: porCobrar?.count ?? 0 },
    topInventario,
    ticketPromedio,
    margenBruto,
    margenPct,
  };
}

export const recientes = {
  ventas: () =>
    db
      .select({
        id: ventas.id,
        total: ventas.total,
        estado: ventas.estado,
        canal: ventas.canal,
        medioPago: ventas.medioPago,
        fecha: ventas.fecha,
        cliente: clientes.nombre,
      })
      .from(ventas)
      .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
      .orderBy(desc(ventas.id))
      .limit(50),
  facturas: () =>
    db
      .select({ id: facturas.id, numero: facturas.numero, total: facturas.total, tipo: facturas.tipo, estado: facturas.estado, fecha: facturas.fecha, cliente: clientes.nombre })
      .from(facturas)
      .leftJoin(clientes, eq(facturas.clienteId, clientes.id))
      .orderBy(desc(facturas.fecha))
      .limit(20),
};
