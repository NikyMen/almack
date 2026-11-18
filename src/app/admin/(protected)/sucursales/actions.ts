"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, cajas, cajaTurnos, sucursales } from "@/db";
import { requireAdmin } from "@/lib/auth";

export async function guardarPanelSucursal(datos: {
  id: number; nombre: string; direccion: string; esDeposito: boolean;
  esPuntoVenta: boolean; esMayorista: boolean; depositoId: number | null; cantidadCajas: number;
}) {
  await requireAdmin();
  try {
    if (!Number.isSafeInteger(datos.id) || datos.id < 1) throw new Error("Sucursal inválida.");
    const nombre = datos.nombre.trim();
    if (!nombre || nombre.length > 100) throw new Error("Ingresá un nombre de hasta 100 caracteres.");
    if (datos.direccion.length > 200) throw new Error("La dirección es demasiado larga.");
    if (!datos.esDeposito && !datos.esPuntoVenta && !datos.esMayorista) throw new Error("Elegí al menos un tipo de local.");
    if (!Number.isSafeInteger(datos.cantidadCajas) || datos.cantidadCajas < 0 || datos.cantidadCajas > 20) throw new Error("La cantidad de cajas debe estar entre 0 y 20.");
    if (!datos.esPuntoVenta && !datos.esMayorista && datos.cantidadCajas !== 0) throw new Error("Un depósito sin ventas no necesita cajas.");
    if ((datos.esPuntoVenta || datos.esMayorista) && datos.cantidadCajas < 1) throw new Error("Un local de ventas necesita al menos una caja.");
    await db.transaction(async tx => {
      const [actual] = await tx.select().from(sucursales).where(and(eq(sucursales.id, datos.id), eq(sucursales.activo, true)));
      if (!actual) throw new Error("La sucursal ya no está activa.");
      const [duplicada] = await tx.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.nombre, nombre), eq(sucursales.activo, true)));
      if (duplicada && duplicada.id !== datos.id) throw new Error("Ya existe una sucursal con ese nombre.");
      if (datos.depositoId !== null) {
        const [deposito] = await tx.select().from(sucursales).where(and(eq(sucursales.id, datos.depositoId), eq(sucursales.activo, true)));
        if (!deposito || (deposito.id === datos.id ? !datos.esDeposito : !deposito.esDeposito)) throw new Error("Seleccioná un depósito activo.");
      }
      if (actual.esDeposito && !datos.esDeposito) {
        const [dependiente] = await tx.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.depositoId, datos.id), eq(sucursales.activo, true)));
        if (dependiente && dependiente.id !== datos.id) throw new Error("Otros locales usan este depósito. Reasignalos antes de quitarle esa función.");
      }
      const actuales = await tx.select().from(cajas).where(eq(cajas.sucursalId, datos.id));
      const desactivar = actuales.filter(c => c.numero > datos.cantidadCajas && c.activa).map(c => c.id);
      if (desactivar.length) {
        const [ocupada] = await tx.select({ id: cajaTurnos.id }).from(cajaTurnos).where(and(inArray(cajaTurnos.cajaId, desactivar), inArray(cajaTurnos.estado, ["abierta", "pendiente"])) ).limit(1);
        if (ocupada) throw new Error("Cerrá y aprobá los turnos de las cajas que querés desactivar.");
      }
      await tx.update(sucursales).set({ nombre, direccion: datos.direccion.trim(), esDeposito: datos.esDeposito, esPuntoVenta: datos.esPuntoVenta, esMayorista: datos.esMayorista, depositoId: datos.depositoId }).where(eq(sucursales.id, datos.id));
      for (let numero = 1; numero <= datos.cantidadCajas; numero++) {
        const existente = actuales.find(c => c.numero === numero);
        if (existente) {
          if (!existente.activa) await tx.update(cajas).set({ activa: true }).where(eq(cajas.id, existente.id));
        } else await tx.insert(cajas).values({ sucursalId: datos.id, numero, activa: true });
      }
      if (desactivar.length) await tx.update(cajas).set({ activa: false }).where(inArray(cajas.id, desactivar));
    });
    revalidatePath("/admin/sucursales");
    revalidatePath("/admin/caja");
    revalidatePath("/admin", "layout");
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo guardar la sucursal." }; }
}
