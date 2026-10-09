import { db, productos, ventas, compras, clientes, facturas, gastos, stockSucursal, sucursales, stockReglas } from "@/db";
import { sql, desc, eq, and, lt } from "drizzle-orm";
import { getSucursalActivaId } from "@/lib/sucursal";

// Todas las métricas se leen "paradas" en algún lado: con `sucursalId` en null
// son los números consolidados de la empresa y con un id, los de ese local.
// Lo que no tiene sucursal (clientes, facturación) se muestra igual en las dos
// vistas: no hay dato para discriminarlo.

export async function getResumen(sucursalId: number | null) {
  // `undefined` en un where = sin filtro, que es justo la vista "Todas".
  const deVentas = sucursalId ? eq(ventas.sucursalId, sucursalId) : undefined;

  const [ventasTot] = await db
    .select({ total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .where(and(eq(ventas.estado, "completada"), deVentas));

  const [comprasTot] = await db
    .select({ total: sql<number>`coalesce(sum(${compras.total}),0)` })
    .from(compras)
    .where(sucursalId ? eq(compras.sucursalId, sucursalId) : undefined);

  const [gastosTot] = await db
    .select({ total: sql<number>`coalesce(sum(${gastos.monto}),0)`, count: sql<number>`count(*)` })
    .from(gastos)
    .where(sucursalId ? eq(gastos.sucursalId, sucursalId) : undefined);

  const [clientesTot] = await db.select({ count: sql<number>`count(*)` }).from(clientes);

  // Dentro de un local, "stock bajo" es lo que falta EN ESE LOCAL: un producto
  // puede estar sobrado en la casa central y agotado en la sucursal chica.
  const cantidadLocal = sql<number>`coalesce(${stockSucursal.cantidad}, 0)`;
  const bajoStock = sucursalId
    ? await db
        .select({ id: productos.id, nombre: productos.nombre, stock: cantidadLocal })
        .from(productos)
        .leftJoin(
          stockSucursal,
          and(eq(stockSucursal.productoId, productos.id), eq(stockSucursal.sucursalId, sucursalId))
        )
        .leftJoin(stockReglas, eq(stockReglas.productoId, productos.id))
        .where(and(lt(cantidadLocal, productos.stockMinimo), sql`coalesce(${stockReglas.alertaActiva},1) = 1`))
    : await db
        .select({ id: productos.id, nombre: productos.nombre, stock: productos.stock })
        .from(productos)
        .leftJoin(stockReglas, eq(stockReglas.productoId, productos.id))
        .where(and(lt(productos.stock, productos.stockMinimo), sql`coalesce(${stockReglas.alertaActiva},1) = 1`));

  const [valorStock] = sucursalId
    ? await db
        .select({
          valor: sql<number>`coalesce(sum(${stockSucursal.cantidad} * ${productos.precioCompra}),0)`,
        })
        .from(stockSucursal)
        .innerJoin(productos, eq(productos.id, stockSucursal.productoId))
        .where(eq(stockSucursal.sucursalId, sucursalId))
    : await db
        .select({
          valor: sql<number>`coalesce(sum(${productos.stock} * ${productos.precioCompra}),0)`,
        })
        .from(productos);

  return {
    ventasTotal: ventasTot?.total ?? 0,
    ventasCount: ventasTot?.count ?? 0,
    comprasTotal: comprasTot?.total ?? 0,
    gastosTotal: gastosTot?.total ?? 0,
    gastosCount: gastosTot?.count ?? 0,
    clientesCount: clientesTot?.count ?? 0,
    bajoStock,
    valorStock: valorStock?.valor ?? 0,
  };
}

export async function getContextoNegocio(): Promise<string> {
  const sucursalId = await getSucursalActivaId();
  const r = await getResumen(sucursalId);
  const topProductos = await db
    .select({ nombre: productos.nombre, stock: productos.stock, precio: productos.precioVenta })
    .from(productos)
    .orderBy(desc(productos.stock))
    .limit(8);

  return [
    `Ventas completadas: ${r.ventasCount} por un total de $${r.ventasTotal}.`,
    `Compras acumuladas: $${r.comprasTotal}.`,
    `Gastos registrados: $${r.gastosTotal}.`,
    `Clientes registrados: ${r.clientesCount}.`,
    `Valor del inventario (a costo): $${r.valorStock}.`,
    `Productos con stock bajo (${r.bajoStock.length}): ${r.bajoStock.map((p) => p.nombre).join(", ") || "ninguno"}.`,
    `Catálogo: ${topProductos.map((p) => `${p.nombre} (stock ${p.stock}, $${p.precio})`).join("; ")}.`,
  ].join("\n");
}

export async function getMetricas(sucursalId: number | null) {
  const r = await getResumen(sucursalId);
  const deLaSucursal = sucursalId ? eq(ventas.sucursalId, sucursalId) : undefined;
  const completadas = and(eq(ventas.estado, "completada"), deLaSucursal);

  // Ventas por mes (últimos 6 meses, solo completadas)
  const ventasMes = await db
    .select({
      mes: sql<string>`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`,
      total: sql<number>`coalesce(sum(${ventas.total}),0)`,
      count: sql<number>`count(*)`,
    })
    .from(ventas)
    .where(completadas)
    .groupBy(sql`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m', ${ventas.fecha}, 'unixepoch')`);

  // Ventas por canal
  const porCanal = await db
    .select({ canal: ventas.canal, total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .where(completadas)
    .groupBy(ventas.canal);

  // Por estado (todas)
  const porEstado = await db
    .select({ estado: ventas.estado, total: sql<number>`coalesce(sum(${ventas.total}),0)`, count: sql<number>`count(*)` })
    .from(ventas)
    .where(deLaSucursal)
    .groupBy(ventas.estado);

  // Cómo se reparten las ventas entre locales. Solo tiene sentido en la vista
  // consolidada: es justo el número que no se ve estando dentro de una.
  const porSucursal = sucursalId
    ? []
    : await db
        .select({
          nombre: sql<string>`coalesce(${sucursales.nombre}, 'Sin sucursal')`,
          total: sql<number>`coalesce(sum(${ventas.total}),0)`,
          count: sql<number>`count(*)`,
        })
        .from(ventas)
        .leftJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
        .where(eq(ventas.estado, "completada"))
        .groupBy(ventas.sucursalId);

  // Cuentas por cobrar (facturas emitidas, no pagadas). La facturación no
  // distingue local, así que el número es el mismo en las dos vistas.
  const [porCobrar] = await db
    .select({ total: sql<number>`coalesce(sum(${facturas.total}),0)`, count: sql<number>`count(*)` })
    .from(facturas)
    .where(eq(facturas.estado, "emitida"));

  // Top productos por valor de inventario
  const topInventario = sucursalId
    ? await db
        .select({
          nombre: productos.nombre,
          stock: stockSucursal.cantidad,
          valor: sql<number>`${stockSucursal.cantidad} * ${productos.precioCompra}`,
        })
        .from(stockSucursal)
        .innerJoin(productos, eq(productos.id, stockSucursal.productoId))
        .where(eq(stockSucursal.sucursalId, sucursalId))
        .orderBy(desc(sql`${stockSucursal.cantidad} * ${productos.precioCompra}`))
        .limit(5)
    : await db
        .select({
          nombre: productos.nombre,
          stock: productos.stock,
          valor: sql<number>`${productos.stock} * ${productos.precioCompra}`,
        })
        .from(productos)
        .orderBy(desc(sql`${productos.stock} * ${productos.precioCompra}`))
        .limit(5);

  const ticketPromedio = r.ventasCount ? r.ventasTotal / r.ventasCount : 0;
  // Los gastos de traslado y flete también se comen el margen.
  const margenBruto = r.ventasTotal - r.comprasTotal - r.gastosTotal;
  const margenPct = r.ventasTotal ? (margenBruto / r.ventasTotal) * 100 : 0;

  return {
    ...r,
    ventasMes,
    porCanal,
    porEstado,
    porSucursal,
    porCobrar: { total: porCobrar?.total ?? 0, count: porCobrar?.count ?? 0 },
    topInventario,
    ticketPromedio,
    margenBruto,
    margenPct,
  };
}

export const recientes = {
  ventas: (sucursalId: number | null = null) =>
    db
      .select({
        id: ventas.id,
        total: ventas.total,
        estado: ventas.estado,
        canal: ventas.canal,
        medioPago: ventas.medioPago,
        fecha: ventas.fecha,
        cliente: clientes.nombre,
        sucursal: sucursales.nombre,
      })
      .from(ventas)
      .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
      .leftJoin(sucursales, eq(ventas.sucursalId, sucursales.id))
      .where(sucursalId ? eq(ventas.sucursalId, sucursalId) : undefined)
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
