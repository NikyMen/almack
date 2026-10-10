"use server";
import { db, compras, compraItems, compraHistorial, productos, stockSucursal } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type LineaReversion = {
  productoId: number; nombre: string; cargado: number; actual: number; quedaria: number;
};
export type DecisionReversion = { productoId: number; actual: number; modo: "negativo" | "cero" | "manual"; cantidad?: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function detalle(compraId: number, executor: typeof db | Tx) {
  const [compra] = await executor.select().from(compras).where(eq(compras.id, compraId));
  if (!compra || !compra.sucursalId || compra.stockRevertido) throw new Error("La carga no existe, no tiene sucursal o ya fue revertida.");
  const items = await executor.select().from(compraItems).where(eq(compraItems.compraId, compraId));
  if (!items.length) throw new Error("Esta carga no tiene productos aplicados al stock.");
  const sumas = new Map<number, number>();
  for (const item of items) sumas.set(item.productoId, (sumas.get(item.productoId) ?? 0) + item.cantidad);
  const ids = [...sumas.keys()];
  const catalogo = await executor.select().from(productos).where(inArray(productos.id, ids));
  const locales = await executor.select().from(stockSucursal).where(and(eq(stockSucursal.sucursalId, compra.sucursalId), inArray(stockSucursal.productoId, ids)));
  const nombres = new Map<number, string>(catalogo.map((p: typeof productos.$inferSelect) => [p.id, p.nombre]));
  const cantidades = new Map<number, number>(locales.map((s: typeof stockSucursal.$inferSelect) => [s.productoId, s.cantidad]));
  if (nombres.size !== ids.length) throw new Error("Falta un producto de esta carga. Revisá el inventario antes de revertir.");
  return { compra, lineas: ids.map(productoId => {
    const actual = cantidades.get(productoId) ?? 0;
    const cargado = sumas.get(productoId)!;
    return { productoId, nombre: nombres.get(productoId)!, cargado, actual, quedaria: actual - cargado };
  }) };
}

export async function vistaPreviaReversion(compraId: number) {
  await requireAdmin();
  try { return { ok: true as const, ...(await detalle(compraId, db)) }; }
  catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo revisar la carga." }; }
}

export async function revertirCargaStock(compraId: number, decisiones: DecisionReversion[]) {
  const usuario = await requireAdmin();
  try {
    const resultado = await db.transaction(async tx => {
      // La lectura y la escritura ocurren dentro de una transacción para no aplicar una vista previa vieja.
      const { compra, lineas } = await detalle(compraId, tx);
      if (decisiones.length !== lineas.length || new Set(decisiones.map(d => d.productoId)).size !== lineas.length)
        throw new Error("Volvé a revisar la carga antes de confirmar.");
      const finales = lineas.map(linea => {
        const d = decisiones.find(x => x.productoId === linea.productoId);
        if (!d || d.actual !== linea.actual) throw new Error("El stock cambió. Volvé a revisar la carga.");
        if (linea.quedaria >= 0) return { ...linea, final: linea.quedaria };
        let final: number;
        if (d.modo === "negativo") final = linea.quedaria;
        else if (d.modo === "cero") final = 0;
        else if (d.modo === "manual" && Number.isSafeInteger(d.cantidad) && d.cantidad! >= 0) final = d.cantidad!;
        else throw new Error(`Elegí una cantidad válida para ${linea.nombre}.`);
        return { ...linea, final };
      });
      for (const linea of finales) {
        await tx.insert(stockSucursal).values({ productoId: linea.productoId, sucursalId: compra.sucursalId!, cantidad: linea.final })
          .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: linea.final } });
        await tx.update(productos).set({ stock: sql`(select coalesce(sum(cantidad),0) from stock_sucursal where producto_id = ${linea.productoId})` })
          .where(eq(productos.id, linea.productoId));
      }
      await tx.update(compras).set({ stockRevertido: true, estado: "pedido" }).where(and(eq(compras.id, compraId), eq(compras.stockRevertido, false)));
      await tx.insert(compraHistorial).values({
        compraId, usuarioId: usuario.id || null, usuarioNombre: usuario.nombre,
        campo: "Carga de stock revertida",
        antes: JSON.stringify(finales.map(x => ({ productoId: x.productoId, cantidad: x.actual }))),
        despues: JSON.stringify(finales.map(x => ({ productoId: x.productoId, cantidad: x.final }))),
      });
      return finales.length;
    });
    for (const ruta of ["/admin/stock", "/admin/stock/carga", "/admin/compras", "/admin/caja", "/admin", "/tienda"]) revalidatePath(ruta);
    return { ok: true as const, productos: resultado };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo revertir la carga." }; }
}
