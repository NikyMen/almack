"use server";
import { requireAcceso } from "@/lib/auth";
import { sucursalOperativaId } from "@/lib/sucursal";
import { abrirCaja, moverEfectivo, cerrarCaja, extraerEfectivo } from "@/lib/caja";
import { revalidatePath } from "next/cache";
export async function operarCaja(datos: { operacion: "abrir" | "movimiento" | "cerrar" | "extraccion"; usarSaldoAnterior?: boolean; clave?: string; solicitudId?: string; turnoId?: number; monto: number; tipo?: string; motivo?: string }) {
  const usuario = await requireAcceso("caja");
  const sucursal = await sucursalOperativaId();
  if (!sucursal) return { ok: false, error: "Creá una sucursal antes de abrir la caja." };
  try {
    if (datos.operacion === "abrir") await abrirCaja(sucursal, usuario.nombre, datos.monto, datos.usarSaldoAnterior === true);
    else if (datos.operacion === "movimiento") await moverEfectivo(sucursal, datos.turnoId ?? 0, usuario.nombre, datos.tipo ?? "", datos.monto, datos.motivo ?? "");
    else if (datos.operacion === "cerrar") await cerrarCaja(sucursal, datos.turnoId ?? 0, usuario.nombre, datos.monto, datos.motivo ?? "");
    else if (datos.operacion === "extraccion") {
      const resultado = await extraerEfectivo({ sucursalId: sucursal, turnoId: datos.turnoId ?? 0, usuario: usuario.usuario, responsable: `${usuario.nombre} (${usuario.usuario})`, clave: datos.clave ?? "", monto: datos.monto, motivo: datos.motivo ?? "", solicitudId: datos.solicitudId ?? "" });
      if (!resultado.ok) return resultado;
    }
    else throw new Error("Operación inválida.");
    revalidatePath("/admin/caja");
    return { ok: true, error: "" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la operación." }; }
}

