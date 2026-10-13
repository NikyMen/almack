export const CAMPOS_CATALOGO = ["codigo", "nombre", "precio", "marca", "categoria", "unidad", "moneda"] as const;
export const CAMPOS_COMPROBANTE = ["proveedor", "fecha", "numero", "total", "codigo", "nombre", "cantidad", "precio"] as const;
export type Campo = typeof CAMPOS_CATALOGO[number] | typeof CAMPOS_COMPROBANTE[number];
export type ReglaCampo = { origen: string; transformacion: "ninguna" | "mayusculas" | "minusculas" | "decimal_coma" | "decimal_punto" };
export type MapeoCampos = Partial<Record<Campo, ReglaCampo>>;
export type ArticuloImportado = { codigo: string; nombre: string; precio: number; marca: string; categoria: string; unidad: string; moneda: string };

export const CAMPOS_INICIALES: MapeoCampos = {
  codigo: { origen: "Código", transformacion: "ninguna" },
  nombre: { origen: "Producto", transformacion: "ninguna" },
  precio: { origen: "Precio", transformacion: "decimal_coma" },
};
