"use server";

import { eq } from "drizzle-orm";
import { db, ventas, ventaItems, productos } from "@/db";
import { requireAcceso } from "@/lib/auth";

export async function detalleVenta(id: number) {
  const usuario = await requireAcceso("ventas");
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false as const, error: "Venta inválida." };
  const [venta] = await db.select().from(ventas).where(eq(ventas.id, id)).limit(1);
  if (!venta || (usuario.rol !== "admin" && venta.sucursalId !== usuario.sucursalId)) {
    return { ok: false as const, error: "La venta no está disponible en tu sucursal." };
  }
  const items = await db.select({
    id: ventaItems.id,
    nombre: productos.nombre,
    sku: productos.sku,
    cantidad: ventaItems.cantidad,
    precioUnit: ventaItems.precioUnit,
  }).from(ventaItems).leftJoin(productos, eq(ventaItems.productoId, productos.id)).where(eq(ventaItems.ventaId, id));
  return { ok: true as const, venta, items };
}
