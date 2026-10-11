import { db, compras, compraLineas, compraItems, compraHistorial, diferenciasPrecios, productos, stockSucursal, stockTransito, ventaItems, stockMovimientoItems } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { guardarRespaldoStock } from "@/lib/respaldos-stock";
import { fijarStockEnTx } from "@/lib/stock";
import { redondearCantidad } from "@/lib/cantidades";

/** Borra el comprobante y sus dependencias sin modificar productos ni stock. */
export async function eliminarCompraEnTransaccion(compraId: number, usuarioNombre = "Administrador") {
  return db.transaction(async tx => {
    const [compra] = await tx.select().from(compras).where(eq(compras.id, compraId));
    if (!compra) return null;
    const items = await tx.select().from(compraItems).where(eq(compraItems.compraId, compraId));
    if (items.length && !compra.stockRevertido) throw new Error("Deshacé la carga antes de borrar el comprobante.");
    await guardarRespaldoStock(tx, "Antes de borrar comprobante", usuarioNombre, compraId);
    await tx.delete(compraLineas).where(eq(compraLineas.compraId, compraId));
    await tx.delete(compraItems).where(eq(compraItems.compraId, compraId));
    await tx.delete(compraHistorial).where(eq(compraHistorial.compraId, compraId));
    await tx.delete(diferenciasPrecios).where(eq(diferenciasPrecios.compraId, compraId));
    await tx.delete(compras).where(eq(compras.id, compraId));
    return compra;
  });
}

/** Revierte los movimientos registrados y retira solo los productos creados por esta carga sin uso posterior. */
export async function deshacerCargaEnTransaccion(compraId: number, usuario: { nombre: string; id: number }) {
  return db.transaction(async tx => {
    const [compra] = await tx.select().from(compras).where(eq(compras.id, compraId));
    if (!compra) throw new Error("La carga no existe.");
    if (compra.stockRevertido) return;
    const items = await tx.select().from(compraItems).where(eq(compraItems.compraId, compraId));
    if (!items.length) throw new Error("La carga no tiene stock aplicado.");
    await guardarRespaldoStock(tx, "Antes de deshacer carga", usuario.nombre, compraId);
    const historial = await tx.select().from(compraHistorial).where(eq(compraHistorial.compraId, compraId));
    const creados = new Set(historial.filter(h => h.campo === "Producto creado").flatMap(h => {
      const id = h.despues.match(/\(#(\d+)\)/)?.[1];
      return id ? [Number(id)] : [];
    }));
    const cantidades = new Map<number, number>();
    for (const item of items) cantidades.set(item.productoId, (cantidades.get(item.productoId) ?? 0) + item.cantidad);
    let retirados = 0;
    for (const [productoId, cantidad] of cantidades) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, productoId));
      if (!p?.activo) continue;
      const [local] = compra.sucursalId ? await tx.select().from(stockSucursal).where(and(eq(stockSucursal.productoId, productoId), eq(stockSucursal.sucursalId, compra.sucursalId))) : [];
      const actual = compra.sucursalId ? local?.cantidad ?? 0 : p.stock;
      const final = redondearCantidad(actual - cantidad);
      if (final < 0) throw new Error(`${p.nombre}: el stock cambió desde la carga (${actual} disponibles, ${cantidad} cargados). Revisá la reversión desde Stock → Cargar stock antes de continuar.`);
      if (compra.sucursalId) await fijarStockEnTx(tx, productoId, compra.sucursalId, final);
      else await tx.update(productos).set({ stock: final }).where(eq(productos.id, productoId));
      if (creados.has(productoId)) {
        const [usado] = await tx.select({ n: sql<number>`
          (select count(*) from ${ventaItems} where ${ventaItems.productoId} = ${productoId}) +
          (select count(*) from ${stockMovimientoItems} where ${stockMovimientoItems.productoId} = ${productoId}) +
          (select count(*) from ${compraItems} where ${compraItems.productoId} = ${productoId} and ${compraItems.compraId} <> ${compraId}) +
          (select count(*) from ${compraLineas} where ${compraLineas.productoId} = ${productoId} and ${compraLineas.compraId} <> ${compraId}) +
          (select count(*) from ${stockTransito} where ${stockTransito.productoId} = ${productoId} and ${stockTransito.cantidad} <> 0) +
          (select count(*) from ${stockSucursal} where ${stockSucursal.productoId} = ${productoId} and ${stockSucursal.cantidad} <> 0)` }).from(productos).where(eq(productos.id, productoId));
        if (!Number(usado.n) && final === 0) {
          await tx.delete(stockSucursal).where(eq(stockSucursal.productoId, productoId));
          await tx.update(productos).set({ activo: false, publicado: false, stock: 0 }).where(eq(productos.id, productoId));
          retirados++;
        }
      }
    }
    await tx.update(compras).set({ stockRevertido: true, estado: "pedido" }).where(eq(compras.id, compraId));
    await tx.delete(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false)));
    await tx.insert(compraHistorial).values({ compraId, usuarioId: usuario.id || null, usuarioNombre: usuario.nombre,
      campo: "Carga deshecha", despues: `${cantidades.size} productos revisados · ${retirados} productos creados por la carga retirados` });
  });
}
