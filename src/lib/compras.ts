// Flujo de control de una compra: se pide, se recibe y hay que controlarla
// contra el remito, y recién ahí queda verificada.
// Vive en lib (no en las server actions) porque un módulo "use server" solo
// puede exportar funciones async, y esto lo consumen también los componentes.

export const ESTADOS_COMPRA = ["pedido", "falta_controlar", "verificado"] as const;
export type EstadoCompra = (typeof ESTADOS_COMPRA)[number];

export const ETIQUETA_ESTADO: Record<string, string> = {
  pedido: "Pedido",
  falta_controlar: "Falta controlar",
  verificado: "Verificado",
  // Estados previos a este flujo: la migración los convierte, pero si queda
  // alguno suelto igual se muestra con un nombre entendible.
  pendiente: "Pedido",
  recibida: "Verificado",
};

export function esEstadoCompra(v: string): v is EstadoCompra {
  return (ESTADOS_COMPRA as readonly string[]).includes(v);
}
