"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, gastos, stockMovimientos } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { enviarTransferencia, verificarTransferencia, devolverTransferencia } from "@/lib/transferencias";
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

/** Envía mercadería al tránsito del destino; no acredita su stock disponible. */
export async function registrarTraslado(datos: {
  origenId: number;
  destinoId: number;
  nota?: string;
  items: LineaTraslado[];
  gasto?: GastoTraslado | null;
}) {
  const usuario = await requireAcceso("movimientos");

  if (usuario.rol === "miembro" && usuario.sucursalId !== datos.origenId) return { ok: false as const, error: "Solo podés mover stock desde tu sucursal." };
  const lista = await getSucursales();
  const origen = lista.find((s) => s.id === datos.origenId);
  const destino = lista.find((s) => s.id === datos.destinoId);
  if (!origen || !destino) return { ok: false as const, error: "Elegí sucursal de origen y de destino." };
  if (origen.id === destino.id) {
    return { ok: false as const, error: "El origen y el destino tienen que ser distintos." };
  }

  const porProducto = new Map<number, number>();
  for (const it of datos.items) {
    if (!Number.isSafeInteger(it.productoId) || !Number.isSafeInteger(it.cantidad) || it.cantidad <= 0) {
      return { ok: false as const, error: "Revisá las cantidades y productos del traslado." };
    }
    porProducto.set(it.productoId, (porProducto.get(it.productoId) ?? 0) + it.cantidad);
  }
  const items = [...porProducto].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  if (items.length === 0) return { ok: false as const, error: "Agregá al menos un producto con cantidad." };

  try {
    const resultado = await enviarTransferencia({
      origenId: origen.id,
      destinoId: destino.id,
      nota: String(datos.nota ?? "").trim(),
      items,
      usuario,
      gasto: datos.gasto ? {
        ...datos.gasto,
        sucursalId: lista.find((s) => s.id === datos.gasto?.sucursalId)?.id ?? origen.id,
      } : null,
    });
    revalidatePath("/admin/movimientos");
    revalidatePath("/admin/stock/mover");
  revalidatePath("/admin/stock/mover/[id]", "page");
    revalidatePath("/admin/stock");
    revalidatePath("/admin");
    return { ok: true as const, ...resultado };
  } catch (e) {
    return { ok: false as const, error: `No se envió nada: ${(e as Error).message}` };
  }
}

export async function resolverTraslado(datos: { id: number; decision: "aceptar" | "rechazar"; cantidades: { itemId: number; cantidad: number }[]; nota: string }) {
  const usuario = await requireAcceso("movimientos");
  const [m] = await db.select().from(stockMovimientos).where(eq(stockMovimientos.id, datos.id));
  if (usuario.rol === "miembro" && m?.destinoId !== usuario.sucursalId) return { ok: false as const, error: "Este traslado no pertenece a tu sucursal." };
  try {
    const resultado = await verificarTransferencia({ ...datos, usuario });
    revalidatePath("/admin/movimientos");
    revalidatePath("/admin/stock/mover");
  revalidatePath("/admin/stock/mover/[id]", "page");
    revalidatePath("/admin/stock");
    revalidatePath("/admin");
    return { ok: true as const, ...resultado };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function confirmarDevolucion(datos: { id: number; cantidades: { itemId: number; cantidad: number }[]; nota: string }) {
  const usuario = await requireAcceso("movimientos");
  const [m] = await db.select().from(stockMovimientos).where(eq(stockMovimientos.id, datos.id));
  if (usuario.rol === "miembro" && m?.origenId !== usuario.sucursalId) return { ok: false as const, error: "Este traslado no pertenece a tu sucursal." };
  try {
    await devolverTransferencia({ ...datos, usuario });
    revalidatePath("/admin/movimientos");
    revalidatePath("/admin/stock/mover");
  revalidatePath("/admin/stock/mover/[id]", "page");
    revalidatePath("/admin/stock");
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** Gasto suelto de una sucursal, sin traslado de por medio. */
export async function registrarGasto(datos: {
  sucursalId: number | null;
  concepto: string;
  categoria: string;
  monto: number;
}) {
  const usuario = await requireAcceso("movimientos");
  if (usuario.rol === "miembro" && datos.sucursalId !== usuario.sucursalId) return { ok: false as const, error: "Solo podés registrar gastos de tu sucursal." };
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
  revalidatePath("/admin/stock/mover");
  revalidatePath("/admin/stock/mover/[id]", "page");
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function eliminarGasto(id: number) {
  const usuario = await requireAcceso("movimientos");
  const [gasto] = await db.select().from(gastos).where(eq(gastos.id, id));
  if (usuario.rol === "miembro" && gasto?.sucursalId !== usuario.sucursalId) return { ok: false as const, error: "Este gasto no pertenece a tu sucursal." };
  await db.delete(gastos).where(eq(gastos.id, id));
  revalidatePath("/admin/movimientos");
  revalidatePath("/admin/stock/mover");
  revalidatePath("/admin/stock/mover/[id]", "page");
  revalidatePath("/admin");
  return { ok: true as const };
}
