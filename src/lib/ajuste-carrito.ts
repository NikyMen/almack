import type { AjustePrecio } from "@/lib/caja";

export function ajusteVigente(
  ajuste: AjustePrecio | null,
  firmaOriginal: string,
  firmaActual: string,
  productoIds: number[],
): AjustePrecio | null {
  if (!ajuste) return null;
  if (ajuste.tipo === "producto") return productoIds.includes(ajuste.productoId ?? -1) ? ajuste : null;
  return firmaOriginal === firmaActual ? ajuste : null;
}
