"use server";

import { eq } from "drizzle-orm";
import { db, ventas, ventaItems, ventaDevoluciones, productos } from "@/db";
import { requireAcceso, requireAdmin } from "@/lib/auth";
import { sucursalOperativaId } from "@/lib/sucursal";
import { devolverVenta } from "@/lib/caja";
import { revalidatePath } from "next/cache";

export async function registrarDevolucion(ventaId: number, motivo: string, referencia: string, reponerStock: boolean) {
  const usuario = await requireAdmin();
  const sucursalId = await sucursalOperativaId();
  if (!sucursalId) return { ok: false as const, error: "Seleccioná una sucursal." };
  try {
    await devolverVenta(sucursalId, ventaId, usuario.nombre, motivo, referencia, reponerStock);
    for (const ruta of ["/admin/caja", "/admin/ventas/historial", "/admin/stock", "/admin"]) revalidatePath(ruta);
    return { ok: true as const, error: "" };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudo registrar la devolución." };
  }
}

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
  const [devolucion] = await db.select().from(ventaDevoluciones).where(eq(ventaDevoluciones.ventaId, id));
  return { ok: true as const, venta: usuario.rol === "admin" ? venta : { ...venta, efectivoAntes: null, efectivoDespues: null }, items, devolucion: devolucion ?? null, puedeVerSaldo: usuario.rol === "admin" };
}
