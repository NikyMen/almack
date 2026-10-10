export type UnidadMedida = "unidad" | "kg";
export type ModoStock = "sumar" | "fijar";

export function cantidadValida(valor: number, unidad: UnidadMedida, permiteNoPositivo = false): boolean {
  if (!Number.isFinite(valor) || Math.abs(valor) > 1_000_000 || (!permiteNoPositivo && valor <= 0)) return false;
  const factor = unidad === "kg" ? 1000 : 1;
  return Math.abs(valor * factor - Math.round(valor * factor)) < 0.000001;
}

export function redondearCantidad(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 1000) / 1000;
}

export function stockDespues(anterior: number, cantidad: number, modo: ModoStock): number {
  return redondearCantidad(modo === "fijar" ? cantidad : anterior + cantidad);
}
