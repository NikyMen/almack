"use server";
import { db, productos, stockConfiguracion, stockReglas } from "@/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { validarMultiplicador, precioDesdeCosto, leerReglasStock } from "@/lib/reglas-stock";
import { revalidatePath } from "next/cache";
function refrescar() { for (const p of ["/admin/stock", "/admin", "/admin/caja", "/admin/compras", "/tienda"]) revalidatePath(p); }
export async function guardarMultiplicadorStock(multiplicador: number | null) {
  const admin = await requireAdmin();
  try {
    validarMultiplicador(multiplicador);
    await db.insert(stockConfiguracion).values({id:1,multiplicador,actualizadoPor:admin.usuario}).onConflictDoUpdate({target:stockConfiguracion.id,set:{multiplicador,actualizadoPor:admin.usuario}});
    refrescar(); return {ok:true,error:""};
  } catch(e) { return {ok:false,error:e instanceof Error ? e.message : "No se pudo guardar."}; }
}
export async function configurarProductoStock(id: number, datos: { stockMinimo: number; alertaActiva: boolean; precioVenta: number; multiplicador: number | null; calcularAhora: boolean }) {
  const admin = await requireAdmin();
  try {
    validarMultiplicador(datos.multiplicador);
    if (!Number.isSafeInteger(datos.stockMinimo) || datos.stockMinimo < 0 || datos.stockMinimo > 1e9) throw new Error("El mínimo de stock debe ser un entero positivo o cero.");
    if (!Number.isFinite(datos.precioVenta) || datos.precioVenta < 0 || datos.precioVenta > 1e12) throw new Error("Ingresá un precio de venta válido.");
    await db.transaction(async tx => {
      const [p] = await tx.select().from(productos).where(eq(productos.id,id));
      if (!p) throw new Error("El producto ya no existe.");
      let precioVenta = Math.round(datos.precioVenta * 100) / 100;
      if (datos.calcularAhora) {
        const config = await leerReglasStock(tx);
        const factor = datos.multiplicador ?? config.multiplicador;
        if (factor === null || p.precioCompra <= 0) throw new Error("Configurá un multiplicador y un costo positivo para calcular el precio.");
        precioVenta = precioDesdeCosto(p.precioCompra,factor);
      }
      await tx.insert(stockReglas).values({productoId:id,alertaActiva:datos.alertaActiva,multiplicador:datos.multiplicador,actualizadoPor:admin.usuario}).onConflictDoUpdate({target:stockReglas.productoId,set:{alertaActiva:datos.alertaActiva,multiplicador:datos.multiplicador,actualizadoPor:admin.usuario}});
      await tx.update(productos).set({stockMinimo:datos.stockMinimo,precioVenta}).where(eq(productos.id,id));
    });
    refrescar(); return {ok:true,error:""};
  } catch(e) { return {ok:false,error:e instanceof Error ? e.message : "No se pudo guardar."}; }
}
