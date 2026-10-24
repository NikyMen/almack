"use server";
import { requireAcceso, requireAdmin } from "@/lib/auth";
import { db, productos, stockReglas } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { agruparDuplicadosStock, paginaGruposDuplicados } from "@/lib/duplicados-stock";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import type { ProductoConStock } from "@/components/stock-manager";
import type { ProductoTraslado } from "@/components/mover-stock";
import { buscarProductosTraslado } from "@/lib/stock-listado";
import { vaciarStockEnTransaccion } from "@/lib/vaciar-stock";
import { revalidatePath } from "next/cache";
import { esSuperAdmin } from "@/lib/permisos";
import { getContextoSucursal } from "@/lib/sucursal";

export async function buscarCodigoStock(codigo: string) {
  const usuario = await requireAcceso("stock");
  const sku = codigo.trim().slice(0, 100);
  if (!sku) return { items: [] as ProductoConStock[], grupo: null };
  const administrador = esSuperAdmin(usuario);
  const contexto = await getContextoSucursal();
  const sucursalId = administrador ? null : contexto.activaId;
  const items = await db.select().from(productos).where(eq(productos.sku, sku));
  const activos = items.filter(p => p.activo);
  const ids = activos.map(p => p.id);
  if (!ids.length) return { items: [] as ProductoConStock[], grupo: null };
  const [desglose, transito, reglas] = await Promise.all([
    desgloseStock(ids), desgloseTransito(ids),
    db.select().from(stockReglas).where(inArray(stockReglas.productoId, ids)),
  ]);
  const porId = new Map(reglas.map(r => [r.productoId, r]));
  const filas: ProductoConStock[] = activos.map(p => {
    const porSucursal = Object.fromEntries((desglose.get(p.id) ?? []).filter(d => administrador || d.sucursalId === sucursalId).map(d => [d.sucursalId, d.cantidad]));
    const transitoPorSucursal = Object.fromEntries((transito.get(p.id) ?? []).filter(d => administrador || d.sucursalId === sucursalId).map(d => [d.sucursalId, d.cantidad]));
    const stockLocal = administrador ? p.stock : (sucursalId ? porSucursal[sucursalId] ?? 0 : 0);
    return { ...p, stock: stockLocal, porSucursal, transitoPorSucursal, stockLocal,
      transitoLocal: Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
      alertaActiva: porId.get(p.id)?.alertaActiva ?? true,
      multiplicadorCosto: porId.get(p.id)?.multiplicador ?? null };
  });
  return { items: filas, grupo: filas.length > 1 ? { tipo: "codigo" as const, clave: sku, ids } : null };
}

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

export async function cargarProductosDuplicados(pagina = 1) {
  await requireAdmin();
  const identidades = await db.select({ id: productos.id, sku: productos.sku, nombre: productos.nombre })
    .from(productos).where(eq(productos.activo, true));
  const resultado = paginaGruposDuplicados(agruparDuplicadosStock(identidades), Number.isSafeInteger(pagina) ? pagina : 1);
  const { ids } = resultado;
  if (!ids.length) return { ...resultado, items: [] as ProductoConStock[] };
  const [items, desglose, transito, reglas] = await Promise.all([
    db.select().from(productos).where(inArray(productos.id, ids)),
    desgloseStock(ids), desgloseTransito(ids),
    db.select().from(stockReglas).where(inArray(stockReglas.productoId, ids)),
  ]);
  const porId = new Map(reglas.map(r => [r.productoId, r]));
  const filas: ProductoConStock[] = items.map(p => {
    const porSucursal = Object.fromEntries((desglose.get(p.id) ?? []).map(d => [d.sucursalId, d.cantidad]));
    const transitoPorSucursal = Object.fromEntries((transito.get(p.id) ?? []).map(d => [d.sucursalId, d.cantidad]));
    return { ...p, porSucursal, transitoPorSucursal, stockLocal: p.stock,
      transitoLocal: Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
      alertaActiva: porId.get(p.id)?.alertaActiva ?? true,
      multiplicadorCosto: porId.get(p.id)?.multiplicador ?? null };
  });
  return { ...resultado, items: filas };
}

export async function buscarProductosParaTraslado(origenId: number, busqueda: string): Promise<ProductoTraslado[]> {
  const usuario = await requireAcceso("movimientos");
  if (usuario.rol === "miembro" && usuario.sucursalId !== origenId) return [];
  return buscarProductosTraslado(origenId, busqueda);
}
