import { db, productos, stockSucursal } from "@/db";
import { and, asc, eq, sql, inArray, desc } from "drizzle-orm";

// El stock vive en dos lugares a la vez y hay que escribirlos juntos:
//
//   productos.stock   → TOTAL de la empresa. Lo leen la caja, la tienda online,
//                       el checkout de MercadoPago y las métricas históricas.
//   stock_sucursal    → cuánto de ese total está en cada local.
//
// Todo lo que mueva stock pasa por acá. La regla es siempre la misma: se toca
// la fila de la sucursal y después se recalcula el total desde el desglose, así
// no puede quedar descuadrado aunque algo falle a mitad de camino.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Recalcula productos.stock como la suma de sus sucursales. */
async function recalcularTotal(tx: Tx, productoId: number) {
  await tx
    .update(productos)
    .set({
      stock: sql`(select coalesce(sum(${stockSucursal.cantidad}), 0) from ${stockSucursal} where ${stockSucursal.productoId} = ${productoId})`,
    })
    .where(eq(productos.id, productoId));
}

/**
 * Suma (o resta, con delta negativo) unidades en una sucursal. Nunca deja la
 * fila en negativo.
 *
 * Se exporta para los flujos que ya vienen con su propia transacción abierta
 * (la recepción de un remito, que además crea productos y compra_items).
 */
export async function sumarStockEnTx(tx: Tx, productoId: number, sucursalId: number, delta: number) {
  await tx
    .insert(stockSucursal)
    .values({ productoId, sucursalId, cantidad: Math.max(0, delta) })
    .onConflictDoUpdate({
      target: [stockSucursal.productoId, stockSucursal.sucursalId],
      set: { cantidad: sql`max(0, ${stockSucursal.cantidad} + ${delta})` },
    });
  await recalcularTotal(tx, productoId);
}

/** Suma/resta unidades de un producto en una sucursal (alta, ajuste manual, recepción). */
export async function ajustarStockEnSucursal(productoId: number, sucursalId: number, delta: number) {
  if (!delta) return;
  await db.transaction(async (tx) => {
    await sumarStockEnTx(tx, productoId, sucursalId, delta);
  });
}

/** Deja la sucursal con exactamente `cantidad` unidades (edición del producto). */
export async function fijarStockEnSucursal(productoId: number, sucursalId: number, cantidad: number) {
  const valor = Math.max(0, Math.trunc(cantidad));
  await db.transaction(async (tx) => {
    await tx
      .insert(stockSucursal)
      .values({ productoId, sucursalId, cantidad: valor })
      .onConflictDoUpdate({
        target: [stockSucursal.productoId, stockSucursal.sucursalId],
        set: { cantidad: valor },
      });
    await recalcularTotal(tx, productoId);
  });
}

/** Borra el desglose de un producto (se llama al eliminarlo del catálogo). */
export async function borrarStockDeProducto(productoId: number) {
  await db.delete(stockSucursal).where(eq(stockSucursal.productoId, productoId));
}

/**
 * Descuenta stock con updates atómicos (nunca queda negativo).
 * Lo comparten la caja (cobrarVenta) y el webhook de MercadoPago.
 *
 * Si viene `sucursalId`, la mercadería sale de ese local y falla si no alcanza.
 * Si no viene (venta online, o panel en "Todas" sin sucursales cargadas), se
 * toma de los locales que más tengan hasta cubrir la cantidad.
 */
export async function descontarStock(
  items: { productoId: number; cantidad: number }[],
  sucursalId?: number | null
) {
  await db.transaction(async (tx) => {
    for (const it of items) {
      if (sucursalId) {
        const r = await tx
          .update(stockSucursal)
          .set({ cantidad: sql`${stockSucursal.cantidad} - ${it.cantidad}` })
          .where(
            and(
              eq(stockSucursal.productoId, it.productoId),
              eq(stockSucursal.sucursalId, sucursalId),
              sql`${stockSucursal.cantidad} >= ${it.cantidad}`
            )
          );
        if (!r.rowsAffected) {
          throw new Error(`Stock insuficiente en esta sucursal para el producto ${it.productoId}.`);
        }
      } else {
        let falta = it.cantidad;
        const filas = await tx
          .select()
          .from(stockSucursal)
          .where(eq(stockSucursal.productoId, it.productoId))
          .orderBy(desc(stockSucursal.cantidad));
        for (const fila of filas) {
          if (falta <= 0) break;
          const toma = Math.min(falta, fila.cantidad);
          if (toma <= 0) continue;
          await tx
            .update(stockSucursal)
            .set({ cantidad: sql`${stockSucursal.cantidad} - ${toma}` })
            .where(eq(stockSucursal.id, fila.id));
          falta -= toma;
        }
        if (falta > 0) {
          throw new Error(`Stock insuficiente para el producto ${it.productoId}.`);
        }
      }
      await recalcularTotal(tx, it.productoId);
    }
  });
}

/**
 * Traslado entre locales: descuenta en el origen y suma en el destino, todo o
 * nada. Devuelve las unidades movidas.
 */
export async function moverStockEntreSucursales(
  origenId: number,
  destinoId: number,
  items: { productoId: number; cantidad: number }[]
) {
  await db.transaction(async (tx) => {
    for (const it of items) {
      const r = await tx
        .update(stockSucursal)
        .set({ cantidad: sql`${stockSucursal.cantidad} - ${it.cantidad}` })
        .where(
          and(
            eq(stockSucursal.productoId, it.productoId),
            eq(stockSucursal.sucursalId, origenId),
            sql`${stockSucursal.cantidad} >= ${it.cantidad}`
          )
        );
      if (!r.rowsAffected) {
        throw new Error(`No hay ${it.cantidad} unidades del producto ${it.productoId} en el origen.`);
      }
      await sumarStockEnTx(tx, it.productoId, destinoId, it.cantidad);
    }
  });
  return items.reduce((a, i) => a + i.cantidad, 0);
}

// --- Lecturas ----------------------------------------------------------------

export type StockDeProducto = { sucursalId: number; cantidad: number };

/**
 * Desglose por sucursal de todos los productos (o de los ids pedidos), listo
 * para mostrarlo en la tabla de Stock.
 */
export async function desgloseStock(ids?: number[]): Promise<Map<number, StockDeProducto[]>> {
  const filas = await db
    .select({
      productoId: stockSucursal.productoId,
      sucursalId: stockSucursal.sucursalId,
      cantidad: stockSucursal.cantidad,
    })
    .from(stockSucursal)
    .where(ids && ids.length ? inArray(stockSucursal.productoId, ids) : undefined)
    .orderBy(asc(stockSucursal.sucursalId));

  const mapa = new Map<number, StockDeProducto[]>();
  for (const f of filas) {
    const lista = mapa.get(f.productoId) ?? [];
    lista.push({ sucursalId: f.sucursalId, cantidad: f.cantidad });
    mapa.set(f.productoId, lista);
  }
  return mapa;
}

/** Cuántas unidades tiene una sucursal de cada producto (productoId → cantidad). */
export async function stockDeSucursal(sucursalId: number): Promise<Map<number, number>> {
  const filas = await db
    .select({ productoId: stockSucursal.productoId, cantidad: stockSucursal.cantidad })
    .from(stockSucursal)
    .where(eq(stockSucursal.sucursalId, sucursalId));
  return new Map(filas.map((f) => [f.productoId, f.cantidad]));
}
