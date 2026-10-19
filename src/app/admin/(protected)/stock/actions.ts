"use server";
import { requireAdmin } from "@/lib/auth";
import { db, productos, stockReglas } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { agruparDuplicadosStock } from "@/lib/duplicados-stock";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import type { ProductoConStock } from "@/components/stock-manager";
import { vaciarStockEnTransaccion } from "@/lib/vaciar-stock";
import { revalidatePath } from "next/cache";

export async function vaciarStock(confirmacion: string, cantidadEsperada: number) {
  const usuario = await requireAdmin();
  if (confirmacion !== "VACIAR" || !Number.isSafeInteger(cantidadEsperada) || cantidadEsperada <= 0) return { ok: false as const, error: "Escribí VACIAR para confirmar." };
  try {
    const retirados = await vaciarStockEnTransaccion(usuario.nombre, cantidadEsperada);
    for (const ruta of ["/admin/stock", "/admin/stock/respaldos", "/admin/stock/carga", "/admin/caja", "/admin/ventas", "/admin", "/tienda", "/tienda/productos", "/"]) revalidatePath(ruta);
    return { ok: true as const, retirados };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo vaciar el stock. No se aplicaron cambios." };
  }
}

export async function cargarProductosDuplicados(): Promise<ProductoConStock[]> {
  await requireAdmin();
  const identidades = await db.select({ id: productos.id, sku: productos.sku, nombre: productos.nombre })
    .from(productos).where(eq(productos.activo, true));
  const ids = [...new Set(agruparDuplicadosStock(identidades).flatMap(g => g.ids))];
  if (!ids.length) return [];
  const [items, desglose, transito, reglas] = await Promise.all([
    db.select().from(productos).where(inArray(productos.id, ids)),
    desgloseStock(ids), desgloseTransito(ids),
    db.select().from(stockReglas).where(inArray(stockReglas.productoId, ids)),
  ]);
  const porId = new Map(reglas.map(r => [r.productoId, r]));
  return items.map(p => {
    const porSucursal = Object.fromEntries((desglose.get(p.id) ?? []).map(d => [d.sucursalId, d.cantidad]));
    const transitoPorSucursal = Object.fromEntries((transito.get(p.id) ?? []).map(d => [d.sucursalId, d.cantidad]));
    return { ...p, porSucursal, transitoPorSucursal, stockLocal: p.stock,
      transitoLocal: Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
      alertaActiva: porId.get(p.id)?.alertaActiva ?? true,
      multiplicadorCosto: porId.get(p.id)?.multiplicador ?? null };
  });
}
