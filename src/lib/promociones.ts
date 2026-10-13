import { eq } from "drizzle-orm";
import { db, promociones, productos } from "@/db";
import type { CouponQuote } from "@/lib/types";

export type Promocion = typeof promociones.$inferSelect;
type Linea = { productoId: number; cantidad: number; precio: number };
const redondear = (n: number) => Math.round(n * 100) / 100;

function numeros(json: string): number[] {
  try {
    const data: unknown = JSON.parse(json);
    return Array.isArray(data) ? data.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
  } catch { return []; }
}

export function vigente(p: Promocion, fecha = new Date()): boolean {
  if (!p.activa) return false;
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? "";
  const dia = `${valor("year")}-${valor("month")}-${valor("day")}`;
  if (p.modo === "unica") return p.fechaUnica === dia;
  if (p.modo === "dias") return p.mes === dia.slice(0, 7) && numeros(p.dias).includes(Number(valor("day")));
  if (p.modo === "semanal") {
    const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(valor("weekday"));
    return p.mes === dia.slice(0, 7) && semana === p.diaSemana;
  }
  return p.modo === "continua";
}

export function cotizarPromocion(p: Promocion, lineas: Linea[]): CouponQuote | null {
  if (!vigente(p)) return null;
  const subtotal = redondear(lineas.reduce((n, l) => n + redondear(l.precio * l.cantidad), 0));
  if (subtotal <= 0) return null;
  const ids = new Set(numeros(p.productoIds));
  const seleccionadas = lineas.filter(l => ids.has(l.productoId));
  const base = seleccionadas.reduce((n, l) => n + redondear(l.precio * l.cantidad), 0);
  const porcentaje = Math.max(0, Math.min(100, p.porcentaje));
  let descuento = 0;
  if (p.tipo === "total") descuento = subtotal * porcentaje / 100;
  if (p.tipo === "seleccionados") descuento = base * porcentaje / 100;
  if (p.tipo === "combo" && seleccionadas.reduce((n, l) => n + l.cantidad, 0) >= p.cantidadCombo) descuento = base * porcentaje / 100;
  if (p.tipo === "envio_gratis") return { code: `PROMO-${p.id}`, subtotal, discount: 0, total: subtotal, description: `${p.nombre} · envío gratis`, automatic: true };
  descuento = redondear(Math.min(Math.max(0, subtotal - 0.01), descuento));
  return descuento > 0 ? { code: `PROMO-${p.id}`, subtotal, discount: descuento, total: redondear(subtotal - descuento), description: p.nombre, automatic: true } : null;
}

export async function mejorPromocion(items: { productoId: number; cantidad: number }[]) {
  if (!items.length) return null;
  const ids = [...new Set(items.map(i => i.productoId))];
  const catalogo = await db.select({ id: productos.id, precio: productos.precioVenta }).from(productos);
  const precios = new Map(catalogo.filter(p => ids.includes(p.id)).map(p => [p.id, p.precio]));
  const lineas = items.filter(i => precios.has(i.productoId)).map(i => ({ ...i, precio: precios.get(i.productoId)! }));
  const activas = await db.select().from(promociones).where(eq(promociones.activa, true));
  return activas.map(p => ({ promo: p, quote: cotizarPromocion(p, lineas) })).filter((x): x is { promo: Promocion; quote: CouponQuote } => x.quote !== null).sort((a, b) => b.quote.discount - a.quote.discount)[0] ?? null;
}
