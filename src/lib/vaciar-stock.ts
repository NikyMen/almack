import { db, productos, stockSucursal, stockTransito, stockMovimientos } from "@/db";
import { eq, sql } from "drizzle-orm";
import { guardarRespaldoStock } from "@/lib/respaldos-stock";

export async function vaciarStockEnTransaccion(usuarioNombre: string, cantidadEsperada: number) {
  return db.transaction(async tx => {
    const [actual] = await tx.select({ n: sql<number>`count(*)` }).from(productos).where(eq(productos.activo, true));
    if (Number(actual.n) !== cantidadEsperada) throw new Error("El inventario cambió. Actualizá la página y revisá la cantidad antes de vaciarlo.");
    if (!Number(actual.n)) return 0;
    const [transito] = await tx.select({ id: stockTransito.productoId }).from(stockTransito).where(sql`${stockTransito.cantidad} <> 0`).limit(1);
    const [pendiente] = await tx.select({ id: stockMovimientos.id }).from(stockMovimientos).where(sql`${stockMovimientos.estado} in ('en_transito', 'rechazado')`).limit(1);
    if (transito || pendiente) throw new Error("Hay traslados pendientes. Recibilos o devolvelos desde Movimientos antes de vaciar el stock.");
    await guardarRespaldoStock(tx, "Antes de vaciar stock", usuarioNombre);
    const activos = sql`(select id from productos where activo = 1)`;
    await tx.delete(stockSucursal).where(sql`${stockSucursal.productoId} in ${activos}`);
    await tx.delete(stockTransito).where(sql`${stockTransito.productoId} in ${activos}`);
    await tx.update(productos).set({ activo: false, publicado: false, stock: 0 }).where(eq(productos.activo, true));
    return Number(actual.n);
  });
}
