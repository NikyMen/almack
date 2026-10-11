import { leerReglasStock, multiplicadorProducto, precioDesdeCosto } from "@/lib/reglas-stock";
import { db, productos, compraLineas, compraItems, diferenciasPrecios, stockSucursal, compras, compraHistorial } from "@/db";
import type { CompraLinea } from "@/db/schema";
import { and, eq, asc, desc, sql, type SQL } from "drizzle-orm";
import { fijarStockEnTx, sumarStockEnTx } from "@/lib/stock";
import { stockDespues, type ModoStock } from "@/lib/cantidades";
import { diferenciaCosto, type ImpactoLinea } from "@/lib/precios-stock";
import { guardarRespaldoStock } from "@/lib/respaldos-stock";

export async function confirmarStockEnTransaccion({ compraId, pendientes, sucursalId, usuario, opciones }: {
  compraId: number; pendientes: CompraLinea[]; sucursalId: number | null;
  usuario: { nombre: string; id: number };
  opciones: { actualizarCosto?: boolean; revalorizar?: number[]; impactos?: ImpactoLinea[] };
}) {
  if (!pendientes.length) throw new Error("No hay renglones pendientes.");
  const creados: string[] = [];
  const ahora = new Date();
  await db.transaction(async (tx) => {
    const [compra] = await tx.select().from(compras).where(eq(compras.id, compraId));
    if (!compra || compra.stockRevertido) throw new Error("Esta carga fue revertida y no se puede volver a aplicar.");
    const [aplicada] = await tx.select({ id: compraLineas.id }).from(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, true))).limit(1);
    if (!aplicada) await guardarRespaldoStock(tx, "Antes de aplicar carga", usuario.nombre, compraId);
    const config = await leerReglasStock(tx);
    const vigentes = await tx.select().from(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false))).orderBy(asc(compraLineas.id));
    if (JSON.stringify(vigentes.slice(0, pendientes.length)) !== JSON.stringify(pendientes)) throw new Error("El borrador cambió. Volvé a revisar la carga.");
    const ids = pendientes.flatMap(l => l.productoId === null ? [] : [l.productoId]);
    if (new Set(ids).size !== ids.length) throw new Error("Un producto aparece en más de un renglón. Unificá sus cantidades antes de confirmar.");
    for (const linea of pendientes) {
      let productoId = linea.productoId;
      const impacto = opciones.impactos?.find(i => i.lineaId === linea.id);
      if (!impacto || impacto.costoNuevo !== linea.precioUnit || impacto.stockNuevo !== stockDespues(impacto.stockAnterior, linea.cantidad, linea.modoStock as ModoStock)) throw new Error("El borrador cambió. Revisá nuevamente.");

      const multiplicador = multiplicadorProducto(config, productoId);
      if ((impacto.multiplicador ?? null) !== multiplicador) throw new Error("El multiplicador cambió. Revisá y confirmá nuevamente.");
      const calcularPrecio = multiplicador !== null && linea.precioUnit > 0;
      const precioNuevo = calcularPrecio ? precioDesdeCosto(linea.precioUnit, multiplicador) : linea.precioVenta;
      if (productoId === null) {
        if (impacto.stockAnterior !== 0) throw new Error("El stock de un producto nuevo debe partir de 0. Revisá nuevamente.");
        if (impacto.ventaNueva !== undefined && impacto.ventaNueva !== precioNuevo) throw new Error("El precio de venta cambió. Revisá nuevamente.");
        if (linea.codigo) {
          const [duplicado] = await tx.select().from(productos).where(and(eq(productos.sku, linea.codigo), eq(productos.activo, true)));
          if (duplicado) throw new Error(`El código ${linea.codigo} ya existe. Vinculá el renglón al producto existente.`);
        }
        const [nuevo] = await tx
          .insert(productos)
          .values({
            nombre: linea.descripcion,
            sku: linea.codigo || `SKU-${Date.now()}-${linea.id}`,
            categoria: "General",
            stock: impacto.stockNuevo,
            unidadMedida: linea.unidadMedida,
            precioCompra: linea.precioUnit,
            precioVenta: precioNuevo,
            // publicado queda en false por defecto: entra al stock, no a la tienda.
          })
          .returning({ id: productos.id });
        productoId = nuevo.id;
        creados.push(`${linea.descripcion} (#${productoId}) ${linea.modoStock === "fijar" ? "saldo" : "+"}${impacto.stockNuevo}`);
        if (sucursalId) await (linea.modoStock === "fijar" ? fijarStockEnTx(tx, productoId, sucursalId, impacto.stockNuevo) : sumarStockEnTx(tx, productoId, sucursalId, linea.cantidad));
      } else {
        const [actual] = await tx.select().from(productos).where(eq(productos.id, productoId));
        if (!actual || !actual.activo) throw new Error("El producto ya no está disponible.");
        const [ultima] = await tx.select().from(compraItems).where(and(eq(compraItems.productoId, productoId), sql`${compraItems.precioUnit} > 0`)).orderBy(desc(compraItems.id)).limit(1);
        const costoAnterior = ultima?.precioUnit ?? actual.precioCompra;
        const diferencia = diferenciaCosto(costoAnterior, linea.precioUnit, actual.precioVenta, multiplicador);
        const [local] = sucursalId ? await tx.select().from(stockSucursal).where(and(eq(stockSucursal.productoId, productoId), eq(stockSucursal.sucursalId, sucursalId))) : [];
        const stockAnterior = sucursalId ? local?.cantidad ?? 0 : actual.stock;
        const stockNuevo = stockDespues(stockAnterior, linea.cantidad, linea.modoStock as ModoStock);
        const revisado = opciones.impactos?.find(i => i.lineaId === linea.id);
        if (!revisado || revisado.costoAnterior !== costoAnterior || revisado.ventaAnterior !== actual.precioVenta || revisado.costoNuevo !== linea.precioUnit || revisado.stockAnterior !== stockAnterior || revisado.stockNuevo !== stockNuevo || revisado.nombre !== actual.nombre || revisado.codigo !== actual.sku) throw new Error("Los precios cambiaron. Revisá y confirmá nuevamente.");
        const revalorizar = linea.precioUnit > 0 && (calcularPrecio || Boolean(opciones.revalorizar?.includes(linea.id)));
        if (revalorizar && diferencia.sugerido === null) throw new Error("No hay margen anterior para calcular el precio sugerido.");
        const set: { stock?: SQL | number; precioCompra?: number; precioVenta?: number; unidadMedida?: string } = {};
        if (linea.unidadMedida === "kg") set.unidadMedida = "kg";
        if (revalorizar) set.precioVenta = diferencia.sugerido!;
        if (diferencia.porcentaje !== null && Math.abs(diferencia.porcentaje) > 0.000001) {
          await tx.insert(diferenciasPrecios).values({
            compraId, productoId, sucursalId, nombre: actual.nombre, codigo: actual.sku,
            costoAnterior, costoNuevo: linea.precioUnit, porcentaje: diferencia.porcentaje,
            ventaAnterior: actual.precioVenta, ventaSugerida: diferencia.sugerido,
            ventaNueva: revalorizar ? diferencia.sugerido! : actual.precioVenta,
            revalorizado: revalorizar, usuarioNombre: usuario.nombre,
          });
        }
        // Sin sucursales (base previa a la migración) se suma al total, como antes.
        if (!sucursalId) set.stock = linea.modoStock === "fijar" ? stockNuevo : sql`${productos.stock} + ${linea.cantidad}`;
        // El costo solo se pisa si se pidió y si el remito trae precio.
        if ((opciones.actualizarCosto || multiplicador !== null) && linea.precioUnit > 0) set.precioCompra = linea.precioUnit;

        if (Object.keys(set).length > 0) {
          const r = await tx.update(productos).set(set).where(eq(productos.id, productoId));
          if (!r.rowsAffected) {
            throw new Error(`El producto de "${linea.descripcion}" ya no existe en el stock.`);
          }
        } else {
          // Sin campos que pisar igual hay que confirmar que el producto sigue
          // existiendo: si no, la línea sumaría stock a un id fantasma.
          const [existe] = await tx
            .select({ id: productos.id })
            .from(productos)
            .where(eq(productos.id, productoId));
          if (!existe) {
            throw new Error(`El producto de "${linea.descripcion}" ya no existe en el stock.`);
          }
        }
        if (sucursalId) await (linea.modoStock === "fijar" ? fijarStockEnTx(tx, productoId, sucursalId, stockNuevo) : sumarStockEnTx(tx, productoId, sucursalId, linea.cantidad));
      }

      await tx.insert(compraItems).values({
        compraId,
        productoId,
        cantidad: linea.modoStock === "fijar" ? stockDespues(0, impacto.stockNuevo - impacto.stockAnterior, "sumar") : linea.cantidad,
        precioUnit: linea.precioUnit,
      });

      await tx
        .update(compraLineas)
        .set({ productoId, aplicado: true, aplicadoEn: ahora })
        .where(eq(compraLineas.id, linea.id));
    }
    for (const creado of creados) await tx.insert(compraHistorial).values({ compraId, usuarioId: usuario.id || null,
      usuarioNombre: usuario.nombre, campo: "Producto creado", antes: "", despues: creado });
    if (vigentes.length === pendientes.length) await tx.update(compras).set({ estado: "verificado" }).where(eq(compras.id, compraId));
    await tx.insert(compraHistorial).values({ compraId, usuarioId: usuario.id || null, usuarioNombre: usuario.nombre,
      campo: "Carga al stock", antes: "", despues: `${pendientes.length} renglones · ${pendientes.reduce((n, l) => n + l.cantidad, 0)} unidades · ${creados.length} productos nuevos` });
  });
  return creados;
}
