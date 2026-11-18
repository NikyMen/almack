"use server";

import { asc, eq, or, sql } from "drizzle-orm";
import { db, ventas, ventaItems, ventaDevoluciones, productos, clientes } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { sucursalOperativaId } from "@/lib/sucursal";
import { devolverVenta } from "@/lib/caja";
import { revalidatePath } from "next/cache";
import { stockDeSucursal } from "@/lib/stock";

export async function datosNuevaVenta() {
  await requireAdmin();
  const sucursalId = await sucursalOperativaId();
  const [catalogo, listaClientes, stock] = await Promise.all([
    db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.nombre)),
    db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes)
      .where(sucursalId ? or(eq(clientes.sucursalId, sucursalId), sql`exists (select 1 from ${ventas} where ${ventas.clienteId} = ${clientes.id} and ${ventas.sucursalId} = ${sucursalId})`) : undefined)
      .orderBy(asc(clientes.nombre)),
    sucursalId ? stockDeSucursal(sucursalId) : Promise.resolve(null),
  ]);
  return { productos: stock ? catalogo.map(p => ({ ...p, stock: stock.get(p.id) ?? 0 })) : catalogo, clientes: listaClientes };
}

export async function registrarDevolucion(ventaId: number, motivo: string, referencia: string, reponerStock: boolean) {
  const usuario = await requireAdmin();
  const sucursalId = await sucursalOperativaId();
  if (!sucursalId) return { ok: false as const, error: "Seleccioná una sucursal." };
  try {
    await devolverVenta(sucursalId, ventaId, usuario.nombre, motivo, referencia, reponerStock, usuario.usuario);
    for (const ruta of ["/admin/caja", "/admin/ventas/historial", "/admin/stock", "/admin"]) revalidatePath(ruta);
    return { ok: true as const, error: "" };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudo registrar la devolución." };
  }
}

export async function detalleVenta(id: number) {
  await requireAdmin();
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false as const, error: "Venta inválida." };
  const [venta] = await db.select().from(ventas).where(eq(ventas.id, id)).limit(1);
  if (!venta) {
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
  return { ok: true as const, venta, items, devolucion: devolucion ?? null, puedeVerSaldo: true };
}
