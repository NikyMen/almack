"use server";
import { requireAdmin } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { aplicarImportacionStock, leerImportacionStock } from "@/lib/importar-stock";
import { revalidatePath } from "next/cache";

async function preparar(archivo: File, sucursalId: number) {
  await requireAdmin();
  const contexto = await getContextoSucursal();
  const sucursal = contexto.lista.find(s => s.id === sucursalId);
  if (!sucursal) throw new Error("Seleccioná una sucursal válida.");
  if (!(archivo instanceof File)) throw new Error("Seleccioná una planilla XLSX.");
  const filas = await leerImportacionStock(archivo, sucursal.nombre);
  return { sucursal, filas };
}

export async function previsualizarStock(archivo: File, sucursalId: number) {
  try {
    const { filas } = await preparar(archivo, sucursalId);
    return { ok: true as const, total: filas.length, muestra: filas.slice(0, 5).map(f => ({ sku: f.sku, nombre: f.nombre, stock: f.stock })), error: "" };
  } catch (e) {
    return { ok: false as const, total: 0, muestra: [], error: e instanceof Error ? e.message : "No se pudo leer la planilla." };
  }
}

export async function confirmarImportacionStock(archivo: File, sucursalId: number) {
  try {
    const { filas } = await preparar(archivo, sucursalId);
    const resultado = await aplicarImportacionStock(filas, sucursalId);
    for (const ruta of ["/admin/stock", "/admin/caja", "/tienda", "/tienda/productos"]) revalidatePath(ruta);
    return { ok: true as const, ...resultado, error: "" };
  } catch (e) {
    return { ok: false as const, creados: 0, actualizados: 0, error: e instanceof Error ? e.message : "No se pudo importar la planilla." };
  }
}
