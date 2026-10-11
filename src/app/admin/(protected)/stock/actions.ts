"use server";
import { requireAdmin } from "@/lib/auth";
import { vaciarStockEnTransaccion } from "@/lib/vaciar-stock";
import { revalidatePath } from "next/cache";

export async function vaciarStock(confirmacion: string, cantidadEsperada: number) {
  const usuario = await requireAdmin();
  if (confirmacion !== "VACIAR" || !Number.isSafeInteger(cantidadEsperada) || cantidadEsperada <= 0) return { ok: false as const, error: "Escribí VACIAR para confirmar." };
  try {
    const retirados = await vaciarStockEnTransaccion(usuario.nombre, cantidadEsperada);
    for (const ruta of ["/admin/stock", "/admin/stock/respaldos", "/admin/stock/carga", "/admin/caja", "/admin/ventas", "/admin", "/tienda", "/tienda/productos", "/"]) revalidatePath(ruta);
    return { ok: true as const, retirados };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo vaciar el stock. No se aplicaron cambios." };
  }
}
