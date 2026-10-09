import { db, stockConfiguracion, stockReglas } from "@/db";
export type StockExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
export async function leerReglasStock(executor: StockExecutor = db) {
  const [global] = await executor.select().from(stockConfiguracion);
  const reglas = await executor.select().from(stockReglas);
  return { multiplicador: global?.multiplicador ?? null, reglas };
}
export function multiplicadorProducto(config: Awaited<ReturnType<typeof leerReglasStock>>, productoId: number | null) {
  return config.reglas.find(r => r.productoId === productoId)?.multiplicador ?? config.multiplicador;
}
export function validarMultiplicador(multiplicador: number | null) {
  if (multiplicador !== null && (!Number.isFinite(multiplicador) || multiplicador <= 0 || multiplicador > 1000 || Math.abs(multiplicador * 10000 - Math.round(multiplicador * 10000)) > 0.000001)) throw new Error("El multiplicador debe ser mayor que cero, hasta 1000 y con hasta cuatro decimales.");
}
export function precioDesdeCosto(costo: number, multiplicador: number) {
  validarMultiplicador(multiplicador);
  if (!Number.isFinite(costo) || costo < 0 || costo * multiplicador > 1e12) throw new Error("Revisá el costo del producto.");
  return Math.round((costo * multiplicador + Number.EPSILON) * 100) / 100;
}

