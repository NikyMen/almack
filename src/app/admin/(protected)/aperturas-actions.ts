"use server";

import { requireAdmin } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { revisarApertura } from "@/lib/caja";
import { revalidatePath } from "next/cache";

export async function revisarAperturaDesdePanel(datos: {
  sucursalId: number;
  turnoId: number;
  accion: "aprobar" | "rectificar" | "anular";
  motivo?: string;
  monto?: number;
}) {
  const admin = await requireAdmin();
  try {
    if (!["aprobar", "rectificar", "anular"].includes(datos.accion)) throw new Error("Acción de revisión inválida.");
    if (!Number.isSafeInteger(datos.sucursalId) || datos.sucursalId <= 0) throw new Error("Sucursal inválida.");
    const { lista } = await getContextoSucursal();
    if (!lista.some(s => s.id === datos.sucursalId)) throw new Error("La sucursal ya no está disponible.");
    if (!Number.isSafeInteger(datos.turnoId) || datos.turnoId <= 0) throw new Error("Apertura inválida.");
    await revisarApertura(datos.sucursalId, datos.turnoId, admin.usuario, datos.accion, datos.motivo ?? "", datos.monto);
    for (const ruta of ["/admin", "/admin/caja", "/admin/caja/historial"]) revalidatePath(ruta);
    return { ok: true as const, error: "" };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo revisar la apertura." };
  }
}
