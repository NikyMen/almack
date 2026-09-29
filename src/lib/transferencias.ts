import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, gastos, productos, stockMovimientoItems, stockMovimientos,
  stockSucursal, stockTransito,
} from "@/db";
import { esCategoriaGasto } from "@/lib/gastos";

type Linea = { productoId: number; cantidad: number };
type Verificada = { itemId: number; cantidad: number };
type Actor = { id: number; nombre: string };

function cantidadValida(n: number) {
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000;
}

export async function enviarTransferencia(datos: {
  origenId: number;
  destinoId: number;
  nota: string;
  items: Linea[];
  usuario: Actor;
  gasto?: { concepto: string; categoria: string; monto: number; sucursalId: number | null } | null;
}) {
  if (datos.origenId === datos.destinoId || !datos.items.length) throw new Error("Elegí dos sucursales distintas y al menos un producto.");
  if (datos.items.some((it) => !cantidadValida(it.cantidad) || it.cantidad === 0)) throw new Error("Revisá las cantidades del traslado.");

  return db.transaction(async (tx) => {
    const unidades = datos.items.reduce((suma, it) => suma + it.cantidad, 0);
    const [mov] = await tx.insert(stockMovimientos).values({
      origenId: datos.origenId,
      destinoId: datos.destinoId,
      usuarioId: datos.usuario.id || null,
      usuarioNombre: datos.usuario.nombre,
      nota: datos.nota,
      unidades,
      estado: "en_transito",
    }).returning({ id: stockMovimientos.id });

    for (const it of datos.items) {
      const [producto] = await tx.select({ nombre: productos.nombre }).from(productos).where(eq(productos.id, it.productoId));
      if (!producto) throw new Error(`El producto ${it.productoId} ya no existe.`);
      const salida = await tx.update(stockSucursal)
        .set({ cantidad: sql`${stockSucursal.cantidad} - ${it.cantidad}` })
        .where(and(
          eq(stockSucursal.productoId, it.productoId),
          eq(stockSucursal.sucursalId, datos.origenId),
          sql`${stockSucursal.cantidad} >= ${it.cantidad}`,
        ));
      if (!salida.rowsAffected) throw new Error(`No hay ${it.cantidad} unidades del producto ${it.productoId} en el origen.`);
      await tx.insert(stockTransito).values({ productoId: it.productoId, sucursalId: datos.destinoId, cantidad: it.cantidad })
        .onConflictDoUpdate({
          target: [stockTransito.productoId, stockTransito.sucursalId],
          set: { cantidad: sql`${stockTransito.cantidad} + ${it.cantidad}` },
        });
      await tx.update(productos).set({
        stock: sql`(select coalesce(sum(cantidad), 0) from stock_sucursal where producto_id = ${it.productoId})`,
      }).where(eq(productos.id, it.productoId));
      await tx.insert(stockMovimientoItems).values({
        movimientoId: mov.id, productoId: it.productoId, descripcion: producto.nombre,
        cantidad: it.cantidad, cantidadRecibida: 0,
      });
    }

    const gasto = datos.gasto;
    if (gasto && Number.isFinite(gasto.monto) && gasto.monto > 0) {
      await tx.insert(gastos).values({
        sucursalId: gasto.sucursalId ?? datos.origenId,
        movimientoId: mov.id,
        concepto: gasto.concepto.trim() || "Traslado de mercadería",
        categoria: esCategoriaGasto(gasto.categoria) ? gasto.categoria : "otros",
        monto: gasto.monto,
      });
    }
    return { id: mov.id, unidades };
  });
}

/** Registra el control físico. Aceptar acredita lo recibido; rechazar lo deja en tránsito. */
export async function verificarTransferencia(datos: {
  id: number;
  decision: "aceptar" | "rechazar";
  cantidades: Verificada[];
  nota: string;
  usuario: Actor;
}) {
  return db.transaction(async (tx) => {
    const [mov] = await tx.select().from(stockMovimientos).where(eq(stockMovimientos.id, datos.id));
    if (!mov || mov.estado !== "en_transito") throw new Error("El traslado ya fue procesado o no existe.");
    const items = await tx.select().from(stockMovimientoItems).where(eq(stockMovimientoItems.movimientoId, datos.id));
    if (!items.length) throw new Error("El traslado no tiene productos.");
    const recibidas = new Map(datos.cantidades.map((i) => [i.itemId, i.cantidad]));
    if (recibidas.size !== items.length || datos.cantidades.length !== items.length) throw new Error("Verificá todas las líneas del traslado.");
    for (const item of items) {
      const cantidad = recibidas.get(item.id);
      if (cantidad === undefined || !cantidadValida(cantidad)) throw new Error("Revisá las cantidades recibidas.");
    }
    const hayDiferencias = items.some((item) => recibidas.get(item.id) !== item.cantidad);
    if ((hayDiferencias || datos.decision === "rechazar") && !datos.nota.trim()) {
      throw new Error("Explicá la diferencia o el motivo del rechazo.");
    }

    for (const item of items) {
      const cantidad = recibidas.get(item.id)!;
      await tx.update(stockMovimientoItems).set({ cantidadVerificada: cantidad, cantidadRecibida: datos.decision === "aceptar" ? cantidad : 0 }).where(eq(stockMovimientoItems.id, item.id));
      if (datos.decision === "rechazar") continue;
      const salida = await tx.update(stockTransito)
        .set({ cantidad: sql`${stockTransito.cantidad} - ${item.cantidad}` })
        .where(and(eq(stockTransito.productoId, item.productoId), eq(stockTransito.sucursalId, mov.destinoId), sql`${stockTransito.cantidad} >= ${item.cantidad}`));
      if (!salida.rowsAffected) throw new Error("El stock en tránsito está desactualizado. Volvé a cargar la página.");
      await tx.insert(stockSucursal).values({ productoId: item.productoId, sucursalId: mov.destinoId, cantidad })
        .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: sql`${stockSucursal.cantidad} + ${cantidad}` } });
      await tx.update(productos).set({
        stock: sql`(select coalesce(sum(cantidad), 0) from stock_sucursal where producto_id = ${item.productoId})`,
      }).where(eq(productos.id, item.productoId));
    }

    const changed = await tx.update(stockMovimientos).set({
      estado: datos.decision === "aceptar" ? "recibido" : "rechazado",
      recibidoPor: datos.usuario.nombre,
      recepcionNota: datos.nota.trim(),
      recibidoEn: new Date(),
    }).where(and(eq(stockMovimientos.id, datos.id), eq(stockMovimientos.estado, "en_transito")));
    if (!changed.rowsAffected) throw new Error("El traslado ya fue procesado.");
    return { estado: datos.decision === "aceptar" ? "recibido" : "rechazado", hayDiferencias };
  });
}

/** Un rechazo permanece en tránsito hasta que el origen confirma la devolución física. */
export async function devolverTransferencia(datos: { id: number; cantidades: Verificada[]; nota: string; usuario: Actor }) {
  return db.transaction(async (tx) => {
    const [mov] = await tx.select().from(stockMovimientos).where(eq(stockMovimientos.id, datos.id));
    if (!mov || mov.estado !== "rechazado") throw new Error("Solo se pueden devolver traslados rechazados.");
    const items = await tx.select().from(stockMovimientoItems).where(eq(stockMovimientoItems.movimientoId, datos.id));
    const devueltas = new Map(datos.cantidades.map((i) => [i.itemId, i.cantidad]));
    if (!items.length || devueltas.size !== items.length || datos.cantidades.length !== items.length) throw new Error("Verificá todas las líneas de la devolución.");
    for (const item of items) {
      const cantidad = devueltas.get(item.id);
      if (cantidad === undefined || !cantidadValida(cantidad)) throw new Error("Revisá las cantidades devueltas.");
      if (cantidad !== item.cantidad && !datos.nota.trim()) throw new Error("Explicá la diferencia de la devolución.");
      const salida = await tx.update(stockTransito)
        .set({ cantidad: sql`${stockTransito.cantidad} - ${item.cantidad}` })
        .where(and(eq(stockTransito.productoId, item.productoId), eq(stockTransito.sucursalId, mov.destinoId), sql`${stockTransito.cantidad} >= ${item.cantidad}`));
      if (!salida.rowsAffected) throw new Error("El stock en tránsito está desactualizado.");
      await tx.insert(stockSucursal).values({ productoId: item.productoId, sucursalId: mov.origenId, cantidad })
        .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: sql`${stockSucursal.cantidad} + ${cantidad}` } });
      await tx.update(stockMovimientoItems).set({ cantidadRecibida: cantidad }).where(eq(stockMovimientoItems.id, item.id));
      await tx.update(productos).set({
        stock: sql`(select coalesce(sum(cantidad), 0) from stock_sucursal where producto_id = ${item.productoId})`,
      }).where(eq(productos.id, item.productoId));
    }
    const changed = await tx.update(stockMovimientos).set({
      estado: "devuelto", recibidoPor: datos.usuario.nombre,
      recepcionNota: [mov.recepcionNota, datos.nota.trim()].filter(Boolean).join(" · Devolución: "),
      recibidoEn: new Date(),
    }).where(and(eq(stockMovimientos.id, datos.id), eq(stockMovimientos.estado, "rechazado")));
    if (!changed.rowsAffected) throw new Error("El traslado ya fue procesado.");
  });
}
