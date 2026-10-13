"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, promociones, productos } from "@/db";

type Datos = { id?: number; nombre: string; tipo: string; activa: boolean; porcentaje: number; productoIds: number[]; cantidadCombo: number; modo: string; fechaUnica: string; mes: string; dias: number[]; diaSemana: number };
export async function guardarPromocion(datos: Datos) {
  await requireAdmin();
  const nombre = datos.nombre.trim();
  if (!nombre || nombre.length > 100) return { ok: false, error: "Indicá un nombre de hasta 100 caracteres." };
  if (!["envio_gratis", "combo", "seleccionados", "total"].includes(datos.tipo)) return { ok: false, error: "Tipo inválido." };
  if (!["unica", "dias", "semanal", "continua"].includes(datos.modo)) return { ok: false, error: "Frecuencia inválida." };
  if (datos.tipo !== "envio_gratis" && (!Number.isFinite(datos.porcentaje) || datos.porcentaje <= 0 || datos.porcentaje > 99)) return { ok: false, error: "El descuento debe ser mayor que 0% y hasta 99%." };
  if (["combo", "seleccionados"].includes(datos.tipo) && !datos.productoIds.length) return { ok: false, error: "Seleccioná productos para la promoción." };
  if (datos.tipo === "combo" && (!Number.isInteger(datos.cantidadCombo) || datos.cantidadCombo < 2)) return { ok: false, error: "El combo requiere al menos 2 unidades." };
  if (datos.modo === "unica" && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaUnica)) return { ok: false, error: "Elegí una fecha válida." };
  if (["dias", "semanal"].includes(datos.modo) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(datos.mes)) return { ok: false, error: "Elegí un mes válido." };
  if (datos.modo === "dias" && (!datos.dias.length || datos.dias.some(d => !Number.isInteger(d) || d < 1 || d > 31))) return { ok: false, error: "Elegí días del mes entre 1 y 31." };
  if (datos.modo === "semanal" && (!Number.isInteger(datos.diaSemana) || datos.diaSemana < 0 || datos.diaSemana > 6)) return { ok: false, error: "Día de semana inválido." };
  const existentes = await db.select({ id: productos.id }).from(productos);
  const permitidos = new Set(existentes.map(p => p.id));
  if (datos.productoIds.some(id => !permitidos.has(id))) return { ok: false, error: "Hay productos inexistentes." };
  const valores = { nombre, tipo: datos.tipo, activa: datos.activa, porcentaje: datos.tipo === "envio_gratis" ? 0 : datos.porcentaje, productoIds: JSON.stringify([...new Set(datos.productoIds)]), cantidadCombo: datos.cantidadCombo, modo: datos.modo, fechaUnica: datos.fechaUnica, mes: datos.mes, dias: JSON.stringify([...new Set(datos.dias)]), diaSemana: datos.diaSemana };
  if (datos.id) {
    const cambio = await db.update(promociones).set(valores).where(eq(promociones.id, datos.id)).returning({ id: promociones.id });
    if (!cambio.length) return { ok: false, error: "Promoción inexistente." };
  } else await db.insert(promociones).values(valores);
  revalidatePath("/admin/ventas/promociones");
  return { ok: true, error: "" };
}

export async function activarPromocion(id: number, activa: boolean) {
  await requireAdmin();
  await db.update(promociones).set({ activa }).where(eq(promociones.id, id));
  revalidatePath("/admin/ventas/promociones");
  return { ok: true };
}
