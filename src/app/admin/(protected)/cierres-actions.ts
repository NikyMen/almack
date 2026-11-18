"use server";

import { requireAdmin } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { anularCierre, aprobarCierre, rectificarCierre } from "@/lib/caja";
import { revalidatePath } from "next/cache";

export async function revisarCierreDesdePanel(datos: {
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
    if (!Number.isSafeInteger(datos.turnoId) || datos.turnoId <= 0) throw new Error("Cierre inválido.");
    const { lista } = await getContextoSucursal();
    if (!lista.some(s => s.id === datos.sucursalId)) throw new Error("La sucursal ya no está disponible.");
    if (datos.accion === "aprobar") await aprobarCierre(datos.sucursalId, datos.turnoId, admin.usuario);
    else if (datos.accion === "rectificar") await rectificarCierre(datos.sucursalId, datos.turnoId, admin.usuario, datos.monto ?? NaN, datos.motivo ?? "");
    else await anularCierre(datos.sucursalId, datos.turnoId, admin.usuario, datos.motivo ?? "");
    for (const ruta of ["/admin", "/admin/caja", "/admin/caja/historial"]) revalidatePath(ruta);
    return { ok: true as const, error: "" };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo revisar el cierre." };
  }
}
