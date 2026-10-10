import { db, productos } from "@/db";
import type { Producto } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  clasificar,
  normalizar,
  similitud,
  UMBRAL_MATCH,
  type Candidato,
  type EstadoLinea,
  type ItemRemito,
} from "@/lib/recepcion";

export type LineaClasificada = ItemRemito & {
  productoId: number | null;
  estado: EstadoLinea;
  candidatos: Candidato[];
};

const MAX_CANDIDATOS = 5;
// Si el segundo candidato está a menos de esto del primero, no hay un ganador
// claro: mejor que lo mire una persona antes de sumarle stock al que no era.
const EMPATE = 0.05;

function candidato(p: Producto, score: number): Candidato {
  return { id: p.id, nombre: p.nombre, sku: p.sku, score: Math.round(score * 100) / 100 };
}

/**
 * Compara un renglón del remito contra el catálogo. Primero por código (si el
 * remito lo trae y coincide con un SKU, es exacto), después por parecido de
 * nombre. Nunca decide sola cuando la cosa está pareja: devuelve "duda" y los
 * candidatos para que se elija a mano.
 */
export function clasificarItem(item: ItemRemito, catalogo: Producto[]): LineaClasificada {
  const codigo = normalizar(item.codigo);
  if (codigo) {
    const porCodigo = catalogo.find((p) => normalizar(p.sku) === codigo);
    if (porCodigo) {
      return { ...item, productoId: porCodigo.id, estado: "match", candidatos: [candidato(porCodigo, 1)] };
    }
  }

  const puntuados = catalogo
    .map((p) => ({ p, score: similitud(item.descripcion, p.nombre) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATOS);

  const mejor = puntuados[0];
  if (!mejor) return { ...item, productoId: null, estado: "nuevo", candidatos: [] };

  const candidatos = puntuados.map((x) => candidato(x.p, x.score));
  const segundo = puntuados[1];
  const empatado = Boolean(segundo && mejor.score - segundo.score < EMPATE);

  let estado = clasificar(mejor.score);
  if (estado === "match" && empatado) estado = "duda";

  return {
    ...item,
    // En "duda" y en "nuevo" no se preselecciona nada: que la línea quede
    // vinculada sola es justamente lo que queremos evitar.
    productoId: estado === "match" ? mejor.p.id : null,
    estado,
    candidatos,
  };
}

export async function clasificarItems(items: ItemRemito[]): Promise<LineaClasificada[]> {
  const catalogo = await db.select().from(productos).where(eq(productos.activo, true));
  return items.map((it) => clasificarItem(it, catalogo));
}

/** Reclasifica una descripción suelta (cuando se edita una línea a mano). */
export async function reclasificar(item: ItemRemito): Promise<LineaClasificada> {
  const catalogo = await db.select().from(productos).where(eq(productos.activo, true));
  return clasificarItem(item, catalogo);
}

/** Buscador del selector de producto del borrador. */
export async function buscarProductos(q: string, limite = 12): Promise<Candidato[]> {
  const texto = q.trim();
  if (!texto) return [];
  const catalogo = await db.select().from(productos).where(eq(productos.activo, true));
  const n = normalizar(texto);
  return catalogo
    .map((p) => {
      // El que empieza igual a lo tipeado va primero aunque el parecido global
      // sea bajo: es lo que espera quien está escribiendo en el buscador.
      const empieza = normalizar(p.nombre).startsWith(n) || normalizar(p.sku).startsWith(n);
      const score = Math.max(similitud(texto, p.nombre), empieza ? UMBRAL_MATCH + 0.2 : 0);
      return candidato(p, score);
    })
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}
