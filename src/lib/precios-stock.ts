import { precioDesdeCosto } from "./reglas-stock";
export function diferenciaCosto(anterior: number, nuevo: number, venta: number, multiplicador: number | null = null) {
  const porcentaje = anterior > 0 && nuevo > 0 ? (nuevo / anterior - 1) * 100 : null;
  const sugerido = multiplicador !== null ? precioDesdeCosto(nuevo, multiplicador) : anterior > 0 && nuevo > 0 && venta > 0
    ? Math.round(venta * nuevo / anterior * 100) / 100 : null;
  return { porcentaje, sugerido };
}

export type ImpactoLinea = {
  multiplicador?: number | null; ventaNueva?: number;
  lineaId: number; nombre: string; codigo: string; stockAnterior: number;
  stockNuevo: number; costoAnterior: number; costoNuevo: number;
  ventaAnterior: number; porcentaje: number | null; sugerido: number | null;
};
