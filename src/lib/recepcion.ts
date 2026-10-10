// Recepción de mercadería: lo que se lee de un remito y cómo se compara contra
// el stock. Sin dependencias de Node ni de la DB, así lo pueden importar tanto
// las server actions como los componentes de cliente (mismo criterio que
// src/lib/compras.ts).

// Estado de cada línea del borrador respecto del stock actual.
//   match → se encontró el producto, se le va a sumar cantidad
//   duda  → hay parecidos pero ninguno claro; lo tiene que resolver una persona
//   nuevo → no existe nada parecido; si se confirma, se crea el producto
export const ESTADOS_LINEA = ["match", "duda", "nuevo"] as const;
export type EstadoLinea = (typeof ESTADOS_LINEA)[number];

export const ETIQUETA_LINEA: Record<EstadoLinea, string> = {
  match: "Ya en stock",
  duda: "Revisar",
  nuevo: "Producto nuevo",
};

export const ESTILO_LINEA: Record<EstadoLinea, string> = {
  match: "bg-emerald-50 text-emerald-700",
  duda: "bg-amber-50 text-amber-700",
  nuevo: "bg-violet-50 text-violet-700",
};

export function esEstadoLinea(v: string): v is EstadoLinea {
  return (ESTADOS_LINEA as readonly string[]).includes(v);
}

// Un ítem tal como lo devuelve la IA al leer la foto (o el texto del detalle).
export type ItemRemito = {
  descripcion: string;
  codigo: string;
  cantidad: number;
  precioUnit: number;
  precioVenta?: number;
  modoStock?: "sumar" | "fijar";
  unidadMedida?: "unidad" | "kg";
};

export type LecturaRemito = {
  proveedor: string;
  total: number;
  items: ItemRemito[];
  omitidos?: number;
};

// Producto candidato a ser el de la línea, con qué tanto se parece (0 a 1).
export type Candidato = { id: number; nombre: string; sku: string; score: number };

// Por encima de MATCH lo damos por encontrado; por debajo de DUDA, por nuevo.
// En el medio queda en "revisar": es justo la franja donde equivocarse crea un
// producto duplicado o le suma stock al que no era.
export const UMBRAL_MATCH = 0.72;
export const UMBRAL_DUDA = 0.42;

export function clasificar(score: number): EstadoLinea {
  if (score >= UMBRAL_MATCH) return "match";
  if (score >= UMBRAL_DUDA) return "duda";
  return "nuevo";
}

// Saca acentos, puntuación y ruido para poder comparar "Coca-Cola 1,5L" con
// "coca cola 1.5 l" sin sorpresas.
export function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    // "134 G" y "134g" son lo mismo: el remito separa la unidad y el catálogo
    // no (o al revés), y si no se pegan quedan como números distintos.
    .replace(/(\d)\s+(kgs?|grs?|g|mls?|cc|lts?|l|unid?s?|uni|u|cms?|mms?|mts?|m|k)(?=\s|$)/g, "$1$2");
}

// Palabras que aparecen en casi todos los remitos y no distinguen nada.
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "x", "por", "con", "y"]);

export function tokens(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => t && !VACIAS.has(t));
}

function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const v of a) if (b.has(v)) comunes++;
  return (2 * comunes) / (a.size + b.size);
}

function bigramas(s: string): Set<string> {
  const t = normalizar(s).replace(/ /g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/**
 * Cuánto se parecen dos nombres de producto, de 0 a 1.
 * Mezcla parecido por palabras (aguanta el orden cambiado y las palabras de
 * más del remito) con parecido por bigramas (aguanta abreviaturas y typos del
 * OCR). Después ajusta con dos reglas que en la práctica son las que evitan
 * los errores caros:
 *   - si un nombre contiene al otro entero, es casi seguro el mismo producto;
 *   - si los dos traen números (500 g, 1 l, 12 u) y no coincide ninguno,
 *     probablemente sea otra presentación del mismo artículo → penaliza.
 */
export function similitud(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const porPalabras = dice(new Set(ta), new Set(tb));
  const porLetras = dice(bigramas(a), bigramas(b));
  let score = 0.6 * porPalabras + 0.4 * porLetras;

  const na = normalizar(a);
  const nb = normalizar(b);
  const corto = na.length <= nb.length ? na : nb;
  const largo = na.length <= nb.length ? nb : na;
  if (corto.length >= 4 && largo.includes(corto)) {
    // Que un nombre contenga al otro solo vale como certeza si el contenido es
    // la mayor parte del otro. "Taza" está dentro de "Taza cerámica artesanal",
    // pero también dentro de otras cinco tazas: eso va a revisión, no a match.
    const proporcion = corto.length / largo.length;
    score = Math.max(score, corto.length >= 6 && proporcion >= 0.5 ? 0.85 : 0.55);
  }

  const numsA = ta.filter((t) => /\d/.test(t));
  const numsB = tb.filter((t) => /\d/.test(t));
  if (numsA.length > 0 && numsB.length > 0 && !numsA.some((n) => numsB.includes(n))) {
    score *= 0.75;
  }

  return Math.min(1, score);
}

export function parseCandidatos(json: string | null | undefined): Candidato[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? (arr as Candidato[]) : [];
  } catch {
    return [];
  }
}

// Lo que va a pasar si se confirma la carga al stock: es el texto del cartel de
// confirmación, calculado en el servidor para que no dependa de la UI.
export type ResumenRecepcion = {
  pendientes: number;
  existentes: { lineas: number; unidades: number };
  nuevos: { lineas: number; unidades: number; nombres: string[] };
  dudas: number;
  sinConfirmar: number;
  costo: number;
  inventario: number;
  noPositivos: number;
};
