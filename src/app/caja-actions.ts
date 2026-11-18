"use server";
import { requireAcceso } from "@/lib/auth";
import { sucursalOperativaId } from "@/lib/sucursal";
import { abrirCaja, moverEfectivo, cerrarCaja, registrarMotivoCierre, registrarMotivoApertura, extraerEfectivo, cambiarArqueo, iniciarTraspaso, recibirTraspaso, cancelarTraspaso, ingresarCambioCerrada } from "@/lib/caja";
import { revalidatePath } from "next/cache";
export async function operarCaja(datos: { operacion: "abrir" | "movimiento" | "cerrar" | "motivo_cierre" | "motivo_apertura" | "extraccion" | "iniciar_arqueo" | "cancelar_arqueo" | "iniciar_traspaso" | "recibir_traspaso" | "cancelar_traspaso" | "ingreso_cerrada"; saldoRestante?: number; clave?: string; solicitudId?: string; turnoId?: number; monto?: number; tipo?: string; motivo?: string; entregadoA?: string }) {
  const usuario = await requireAcceso("caja");
  if (["extraccion", "movimiento", "ingreso_cerrada", "cancelar_traspaso"].includes(datos.operacion) && usuario.rol !== "admin") return { ok: false, error: "Solo administración puede realizar esta operación." };
  const sucursal = await sucursalOperativaId();
  if (!sucursal) return { ok: false, error: "Creá una sucursal antes de abrir la caja." };
  try {
    const contado = datos.monto;
    let requiereMotivo = false;
    let turnoResultante: number | undefined;
    if (datos.operacion === "abrir") {
      const turno = await abrirCaja(sucursal, usuario.nombre, contado, "", usuario.usuario);
      requiereMotivo = (turno.diferenciaApertura ?? 0) < 0;
      turnoResultante = turno.id;
    }
    else if (datos.operacion === "movimiento") await moverEfectivo(sucursal, datos.turnoId ?? 0, usuario.nombre, datos.tipo ?? "", datos.monto ?? NaN, datos.motivo ?? "", usuario.usuario, true);
    else if (datos.operacion === "iniciar_arqueo" || datos.operacion === "cancelar_arqueo") await cambiarArqueo(sucursal, datos.turnoId ?? 0, datos.operacion === "iniciar_arqueo", usuario.usuario, usuario.nombre);
    else if (datos.operacion === "cerrar") {
      const cierre = await cerrarCaja(sucursal, datos.turnoId ?? 0, usuario.nombre, contado ?? NaN, "", usuario.usuario);
      requiereMotivo = cierre.requiereMotivo;
      turnoResultante = datos.turnoId;
    }
    else if (datos.operacion === "motivo_cierre") await registrarMotivoCierre(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.motivo ?? "");
    else if (datos.operacion === "motivo_apertura") await registrarMotivoApertura(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.motivo ?? "");
    else if (datos.operacion === "iniciar_traspaso") await iniciarTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, usuario.nombre, contado ?? NaN);
    else if (datos.operacion === "recibir_traspaso") await recibirTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, usuario.nombre, contado ?? NaN);
    else if (datos.operacion === "cancelar_traspaso") await cancelarTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.motivo ?? "");
    else if (datos.operacion === "ingreso_cerrada") await ingresarCambioCerrada(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.monto ?? NaN, datos.motivo ?? "");
    else if (datos.operacion === "extraccion") {
      const resultado = await extraerEfectivo({ sucursalId: sucursal, turnoId: datos.turnoId ?? 0, usuario: usuario.usuario, responsable: `${usuario.nombre} (${usuario.usuario})`, clave: datos.clave ?? "", monto: datos.monto ?? NaN, saldoRestante: datos.saldoRestante ?? NaN, motivo: datos.motivo ?? "", entregadoA: datos.entregadoA ?? "", solicitudId: datos.solicitudId ?? "" });
      if (!resultado.ok) return resultado;
    }
    else throw new Error("Operación inválida.");
    revalidatePath("/admin/caja");
    if (["abrir", "motivo_apertura", "cerrar", "motivo_cierre"].includes(datos.operacion)) revalidatePath("/admin");
    return { ok: true, error: "", contado: datos.operacion === "cerrar" || datos.operacion === "iniciar_traspaso" || datos.operacion === "recibir_traspaso" ? contado : undefined, requiereMotivo, turnoId: turnoResultante };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la operación." }; }
}

