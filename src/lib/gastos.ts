// Categorías de gasto. Sin dependencias de Node ni de la DB, así lo pueden
// importar las server actions y los componentes de cliente (mismo criterio que
// src/lib/compras.ts).

export const CATEGORIAS_GASTO = ["combustible", "flete", "peaje", "viaticos", "otros"] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const ETIQUETA_GASTO: Record<CategoriaGasto, string> = {
  combustible: "Nafta / combustible",
  flete: "Flete o changarín",
  peaje: "Peaje",
  viaticos: "Viáticos",
  otros: "Otros",
};

export function esCategoriaGasto(v: string): v is CategoriaGasto {
  return (CATEGORIAS_GASTO as readonly string[]).includes(v);
}
