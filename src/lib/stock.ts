import { db, productos } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";

// Descuenta stock con un update atómico (nunca queda negativo).
// Lo comparten la caja (cobrarVenta) y el webhook de MercadoPago.
export async function descontarStock(items: { productoId: number; cantidad: number }[]) {
  await db.transaction(async (tx) => {
    for (const it of items) {
      const result = await tx
        .update(productos)
        .set({ stock: sql`${productos.stock} - ${it.cantidad}` })
        .where(and(eq(productos.id, it.productoId), gte(productos.stock, it.cantidad)));
      if (!result.rowsAffected) {
        throw new Error(`Stock insuficiente para el producto ${it.productoId}.`);
      }
    }
  });
}
