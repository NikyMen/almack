"use server";
import { requireAcceso } from "@/lib/auth";
import { sucursalOperativaId } from "@/lib/sucursal";
import { abrirCaja, moverEfectivo, cerrarCaja, extraerEfectivo, cambiarArqueo, iniciarTraspaso, recibirTraspaso, cancelarTraspaso, rectificarCierre, aprobarCierre, ingresarCambioCerrada } from "@/lib/caja";
import { revalidatePath } from "next/cache";
const denominaciones = new Set([0.01, 0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 10000, 20000]);
function montoContado(detalle: Record<string, number> | undefined) {
  if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) throw new Error("Cargá el conteo por denominación.");
  let total = 0;
  for (const [valor, cantidad] of Object.entries(detalle)) {
    if (!denominaciones.has(Number(valor)) || !Number.isSafeInteger(cantidad) || cantidad < 0 || cantidad > 100000) throw new Error("Revisá las cantidades del conteo.");
    total += Number(valor) * cantidad;
  }
  if (!Object.keys(detalle).length || total > 1e12) throw new Error("Cargá el conteo por denominación.");
  return Math.round((total + Number.EPSILON) * 100) / 100;
}
export async function operarCaja(datos: { operacion: "abrir" | "movimiento" | "cerrar" | "extraccion" | "iniciar_arqueo" | "cancelar_arqueo" | "iniciar_traspaso" | "recibir_traspaso" | "cancelar_traspaso" | "rectificar" | "aprobar" | "ingreso_cerrada"; saldoRestante?: number; clave?: string; solicitudId?: string; turnoId?: number; monto?: number; detalle?: Record<string, number>; tipo?: string; motivo?: string; entregadoA?: string }) {
  const usuario = await requireAcceso("caja");
  if (["extraccion", "movimiento", "rectificar", "aprobar", "ingreso_cerrada", "cancelar_traspaso"].includes(datos.operacion) && usuario.rol !== "admin") return { ok: false, error: "Solo administración puede realizar esta operación." };
  const sucursal = await sucursalOperativaId();
  if (!sucursal) return { ok: false, error: "Creá una sucursal antes de abrir la caja." };
  try {
    let contado: number | undefined;
    if (["abrir", "cerrar", "iniciar_traspaso", "recibir_traspaso"].includes(datos.operacion)) contado = montoContado(datos.detalle);
    if (datos.operacion === "abrir") await abrirCaja(sucursal, usuario.nombre, contado, datos.motivo ?? "", usuario.usuario, JSON.stringify(datos.detalle));
    else if (datos.operacion === "movimiento") await moverEfectivo(sucursal, datos.turnoId ?? 0, usuario.nombre, datos.tipo ?? "", datos.monto ?? NaN, datos.motivo ?? "", usuario.usuario, true);
    else if (datos.operacion === "iniciar_arqueo" || datos.operacion === "cancelar_arqueo") await cambiarArqueo(sucursal, datos.turnoId ?? 0, datos.operacion === "iniciar_arqueo", usuario.usuario, usuario.nombre);
    else if (datos.operacion === "cerrar") await cerrarCaja(sucursal, datos.turnoId ?? 0, usuario.nombre, contado!, datos.motivo ?? "", usuario.usuario, JSON.stringify(datos.detalle));
    else if (datos.operacion === "iniciar_traspaso") await iniciarTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, usuario.nombre, contado!, JSON.stringify(datos.detalle));
    else if (datos.operacion === "recibir_traspaso") await recibirTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, usuario.nombre, contado!, JSON.stringify(datos.detalle));
    else if (datos.operacion === "cancelar_traspaso") await cancelarTraspaso(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.motivo ?? "");
    else if (datos.operacion === "rectificar") await rectificarCierre(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.monto ?? NaN, datos.motivo ?? "");
    else if (datos.operacion === "aprobar") await aprobarCierre(sucursal, datos.turnoId ?? 0, usuario.usuario);
    else if (datos.operacion === "ingreso_cerrada") await ingresarCambioCerrada(sucursal, datos.turnoId ?? 0, usuario.usuario, datos.monto ?? NaN, datos.motivo ?? "");
    else if (datos.operacion === "extraccion") {
      const resultado = await extraerEfectivo({ sucursalId: sucursal, turnoId: datos.turnoId ?? 0, usuario: usuario.usuario, responsable: `${usuario.nombre} (${usuario.usuario})`, clave: datos.clave ?? "", monto: datos.monto ?? NaN, saldoRestante: datos.saldoRestante ?? NaN, motivo: datos.motivo ?? "", entregadoA: datos.entregadoA ?? "", solicitudId: datos.solicitudId ?? "" });
      if (!resultado.ok) return resultado;
    }
    else throw new Error("Operación inválida.");
    revalidatePath("/admin/caja");
    return { ok: true, error: "", contado: datos.operacion === "cerrar" || datos.operacion === "iniciar_traspaso" || datos.operacion === "recibir_traspaso" ? contado : undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la operación." }; }
}

