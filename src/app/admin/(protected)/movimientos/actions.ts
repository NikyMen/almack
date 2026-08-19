"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, productos, gastos, stockMovimientos, stockMovimientoItems } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { moverStockEntreSucursales } from "@/lib/stock";
import { getSucursales } from "@/lib/sucursal";
import { esCategoriaGasto } from "@/lib/gastos";

export type LineaTraslado = { productoId: number; cantidad: number };

export type GastoTraslado = {
  concepto: string;
  categoria: string;
  monto: number;
  /** Sucursal que se hace cargo del gasto (por defecto, la de origen). */
  sucursalId: number | null;
};

/**
 * Registra un traslado de mercadería entre locales.
 *
 * El stock se mueve primero (es lo que puede fallar: si el origen no tiene las
 * unidades, no se mueve nada) y recién después se escribe el remito interno y
 * el gasto del flete, si lo hubo.
 */
export async function registrarTraslado(datos: {
  origenId: number;
  destinoId: number;
  nota?: string;
  items: LineaTraslado[];
  gasto?: GastoTraslado | null;
}) {
  const usuario = await requireAcceso("movimientos");

  const lista = await getSucursales();
  const origen = lista.find((s) => s.id === datos.origenId);
  const destino = lista.find((s) => s.id === datos.destinoId);
  if (!origen || !destino) return { ok: false as const, error: "Elegí sucursal de origen y de destino." };
  if (origen.id === destino.id) {
    return { ok: false as const, error: "El origen y el destino tienen que ser distintos." };
  }

  // Se juntan las líneas repetidas del mismo producto: mover 2 y después 3 del
  // mismo ítem tiene que validarse como 5, no como dos cargas sueltas.
  const porProducto = new Map<number, number>();
  for (const it of datos.items) {
    const cantidad = Math.trunc(it.cantidad);
    if (!it.productoId || cantidad <= 0) continue;
    porProducto.set(it.productoId, (porProducto.get(it.productoId) ?? 0) + cantidad);
  }
  const items = [...porProducto].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  if (items.length === 0) return { ok: false as const, error: "Agregá al menos un producto con cantidad." };

  const prods = await db
    .select({ id: productos.id, nombre: productos.nombre })
    .from(productos)
    .where(inArray(productos.id, items.map((i) => i.productoId)));
  const nombre = new Map(prods.map((p) => [p.id, p.nombre]));
  if (prods.length !== items.length) {
    return { ok: false as const, error: "Hay un producto de la lista que ya no existe." };
  }

  let unidades = 0;
  try {
    unidades = await moverStockEntreSucursales(origen.id, destino.id, items);
  } catch (e) {
    // El mensaje de stock.ts habla de ids; acá se traduce a algo legible.
    const falta = items.find((i) => (e as Error).message.includes(`producto ${i.productoId}`));
    return {
      ok: false as const,
      error: falta
        ? `No hay ${falta.cantidad} unidades de "${nombre.get(falta.productoId)}" en ${origen.nombre}.`
        : `No se movió nada: ${(e as Error).message}`,
    };
  }

  const [mov] = await db
    .insert(stockMovimientos)
    .values({
      origenId: origen.id,
      destinoId: destino.id,
      usuarioId: usuario.id || null,
      usuarioNombre: usuario.nombre,
      nota: String(datos.nota ?? "").trim(),
      unidades,
    })
    .returning({ id: stockMovimientos.id });

  await db.insert(stockMovimientoItems).values(
    items.map((i) => ({
      movimientoId: mov.id,
      productoId: i.productoId,
      descripcion: nombre.get(i.productoId) ?? "",
      cantidad: i.cantidad,
    }))
  );

  // El gasto del flete es opcional: solo se guarda si tiene monto.
  const g = datos.gasto;
  if (g && g.monto > 0) {
    const cargaA = lista.find((s) => s.id === g.sucursalId)?.id ?? origen.id;
    await db.insert(gastos).values({
      sucursalId: cargaA,
      movimientoId: mov.id,
      concepto: g.concepto.trim() || "Traslado de mercadería",
      categoria: esCategoriaGasto(g.categoria) ? g.categoria : "otros",
      monto: g.monto,
    });
  }

  revalidatePath("/admin/movimientos");
  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  return { ok: true as const, id: mov.id, unidades };
}

/** Gasto suelto de una sucursal, sin traslado de por medio. */
export async function registrarGasto(datos: {
  sucursalId: number | null;
  concepto: string;
  categoria: string;
  monto: number;
}) {
  await requireAcceso("movimientos");
  if (!(datos.monto > 0)) return { ok: false as const, error: "Poné el monto del gasto." };
  const concepto = datos.concepto.trim();
  if (!concepto) return { ok: false as const, error: "Escribí de qué es el gasto." };

  const lista = await getSucursales();
  await db.insert(gastos).values({
    sucursalId: lista.find((s) => s.id === datos.sucursalId)?.id ?? null,
    concepto,
    categoria: esCategoriaGasto(datos.categoria) ? datos.categoria : "otros",
    monto: datos.monto,
  });

  revalidatePath("/admin/movimientos");
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function eliminarGasto(id: number) {
  await requireAcceso("movimientos");
  await db.delete(gastos).where(eq(gastos.id, id));
  revalidatePath("/admin/movimientos");
  revalidatePath("/admin");
  return { ok: true as const };
}
