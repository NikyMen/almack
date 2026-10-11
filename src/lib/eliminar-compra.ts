import { db, compras, compraLineas, compraItems, compraHistorial, diferenciasPrecios } from "@/db";
import { eq } from "drizzle-orm";

/** Borra el comprobante y sus dependencias sin modificar productos ni stock. */
export async function eliminarCompraEnTransaccion(compraId: number) {
  return db.transaction(async tx => {
    const [compra] = await tx.select().from(compras).where(eq(compras.id, compraId));
    if (!compra) return null;
    await tx.delete(compraLineas).where(eq(compraLineas.compraId, compraId));
    await tx.delete(compraItems).where(eq(compraItems.compraId, compraId));
    await tx.delete(compraHistorial).where(eq(compraHistorial.compraId, compraId));
    await tx.delete(diferenciasPrecios).where(eq(diferenciasPrecios.compraId, compraId));
    await tx.delete(compras).where(eq(compras.id, compraId));
    return compra;
  });
}
