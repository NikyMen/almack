import { db, compraLineas } from "@/db";
import { and, asc, eq } from "drizzle-orm";

/** Agrupa el mismo SKU/producto; nunca mezcla precios incompatibles. */
export async function unificarBorrador(compraId: number) {
  return db.transaction(async tx => {
    const lineas = await tx.select().from(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false))).orderBy(asc(compraLineas.id));
    const grupos = new Map<string, typeof lineas>();
    for (const linea of lineas) {
      const key = linea.productoId !== null ? `producto:${linea.productoId}` : linea.codigo.trim() ? `sku:${linea.codigo.trim()}` : `linea:${linea.id}`;
      grupos.set(key, [...(grupos.get(key) ?? []), linea]);
    }
    let unificadas = 0;
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      const primera = grupo[0];
      const ventas = new Set(grupo.map(l => l.precioVenta).filter(p => p > 0));
      if (new Set(grupo.map(l => l.precioUnit)).size > 1 || ventas.size > 1) throw new Error(`El código ${primera.codigo || primera.descripcion} tiene precios distintos. Igualá los precios antes de continuar.`);
      const cantidad = grupo.reduce((n, l) => n + l.cantidad, 0);
      if (!Number.isSafeInteger(cantidad) || cantidad <= 0) throw new Error("La cantidad agrupada no es válida.");
      await tx.update(compraLineas).set({ cantidad, precioVenta: [...ventas][0] ?? 0, confirmado: grupo.every(l => l.confirmado) }).where(eq(compraLineas.id, primera.id));
      for (const extra of grupo.slice(1)) await tx.delete(compraLineas).where(eq(compraLineas.id, extra.id));
      unificadas += grupo.length - 1;
    }
    return unificadas;
  });
}
