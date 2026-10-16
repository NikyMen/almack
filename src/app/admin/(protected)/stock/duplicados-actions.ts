"use server";

import { db, productos, stockMovimientoItems, stockMovimientos, stockSucursal, stockTransito } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { agruparDuplicadosStock } from "@/lib/duplicados-stock";
import { guardarRespaldoStock } from "@/lib/respaldos-stock";
import { revalidatePath } from "next/cache";

function refrescar() {
  for (const ruta of ["/admin/stock", "/admin/stock/respaldos", "/admin/caja", "/admin/ventas", "/admin", "/tienda", "/tienda/productos", "/"]) revalidatePath(ruta);
}

function idsValidos(ids: number[]) {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
}

export async function actualizarPreciosDuplicados(ids: number[], cambios: { precioVenta?: number; precioCompra?: number }) {
  await requireAdmin();
  if (!idsValidos(ids) || !Object.keys(cambios).length || Object.keys(cambios).some(k => !["precioVenta", "precioCompra"].includes(k)))
    return { ok: false as const, error: "Seleccioná productos y al menos un precio para actualizar." };
  if (Object.values(cambios).some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e12))
    return { ok: false as const, error: "Ingresá precios válidos." };
  try {
    const activos = await db.select({ id: productos.id }).from(productos).where(and(inArray(productos.id, ids), eq(productos.activo, true)));
    if (activos.length !== ids.length) throw new Error("El inventario cambió. Actualizá la página antes de continuar.");
    await db.update(productos).set(cambios).where(and(inArray(productos.id, ids), eq(productos.activo, true)));
    refrescar();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudieron actualizar los precios." };
  }
}

export async function consolidarDuplicados(destinoId: number, origenIds: number[]) {
  const usuario = await requireAdmin();
  if (!Number.isSafeInteger(destinoId) || destinoId <= 0 || !idsValidos(origenIds) || origenIds.includes(destinoId))
    return { ok: false as const, error: "Elegí un producto principal y al menos otro para consolidar." };
  try {
    await db.transaction(async tx => {
      const ids = [destinoId, ...origenIds];
      const activos = await tx.select().from(productos).where(and(inArray(productos.id, ids), eq(productos.activo, true)));
      if (activos.length !== ids.length) throw new Error("El inventario cambió. Actualizá la página antes de continuar.");
      if (new Set(activos.map(p => p.unidadMedida)).size !== 1) throw new Error("No se pueden consolidar productos que se venden en unidades distintas.");
      const grupo = agruparDuplicadosStock(activos).find(g => ids.every(id => g.ids.includes(id)));
      if (!grupo) throw new Error("Los productos ya no forman un mismo grupo de duplicados.");

      const [transito] = await tx.select({ id: stockTransito.id }).from(stockTransito)
        .where(and(inArray(stockTransito.productoId, origenIds), sql`${stockTransito.cantidad} <> 0`)).limit(1);
      const [pendiente] = await tx.select({ id: stockMovimientoItems.id }).from(stockMovimientoItems)
        .innerJoin(stockMovimientos, eq(stockMovimientoItems.movimientoId, stockMovimientos.id))
        .where(and(inArray(stockMovimientoItems.productoId, origenIds), inArray(stockMovimientos.estado, ["en_transito", "rechazado"]))).limit(1);
      if (transito || pendiente) throw new Error("Uno de los productos tiene un traslado pendiente. Resolvelo antes de consolidar.");

      await guardarRespaldoStock(tx, `Antes de consolidar duplicados en #${destinoId}`, usuario.nombre);
      const existencias = await tx.select({ productoId: stockSucursal.productoId, sucursalId: stockSucursal.sucursalId, cantidad: stockSucursal.cantidad })
        .from(stockSucursal).where(inArray(stockSucursal.productoId, origenIds));
      for (const fila of existencias) {
        await tx.insert(stockSucursal).values({ productoId: destinoId, sucursalId: fila.sucursalId, cantidad: fila.cantidad })
          .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: sql`round(${stockSucursal.cantidad} + ${fila.cantidad}, 3)` } });
      }
      await tx.delete(stockSucursal).where(inArray(stockSucursal.productoId, origenIds));
      await tx.update(productos).set({ stock: sql`(select coalesce(sum(${stockSucursal.cantidad}), 0) from ${stockSucursal} where ${stockSucursal.productoId} = ${destinoId})` }).where(eq(productos.id, destinoId));
      await tx.update(productos).set({ activo: false, publicado: false, stock: 0 }).where(inArray(productos.id, origenIds));
    });
    refrescar();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudieron consolidar los productos." };
  }
}
