"use server";

import { unificarBorrador } from "@/lib/unificar-borrador";
import { cantidadValida, stockDespues, type UnidadMedida, type ModoStock } from "@/lib/cantidades";
import { confirmarStockEnTransaccion } from "@/lib/confirmar-stock";
import { extraerDocumentoStock } from "@/lib/documento-stock";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  compras,
  compraHistorial,
  compraItems,
  stockSucursal,
  compraLineas,
  productos,
  type Compra,
  type CompraLinea,
} from "@/db/schema";
import { getUsuarioActual, requireAcceso, requireCargaStock } from "@/lib/auth";
import {
  transcribirImagen,
  leerRemitoImagen,
  leerRemitoTexto,
  type ImagenEntrada,
} from "@/lib/ai";
import { esEstadoCompra } from "@/lib/compras";
import { getContextoSucursal, sucursalOperativaId } from "@/lib/sucursal";
import { leerReglasStock, multiplicadorProducto, precioDesdeCosto } from "@/lib/reglas-stock";
import { diferenciaCosto, type ImpactoLinea } from "@/lib/precios-stock";
import type { ResumenRecepcion } from "@/lib/recepcion";
import {
  buscarProductos,
  clasificarItems,
  reclasificar,
  type LineaClasificada,
} from "@/lib/matching";
import type { UsuarioActual } from "@/lib/permisos";

// Fuera de /public a propósito: Next solo sirve /public con lo que existía al
// hacer el build, y además estos comprobantes deben quedar detrás del login.
// Se entregan por /api/uploads (ver src/app/api/uploads/[...ruta]/route.ts).
const DIR_SUBIDAS = path.join(process.cwd(), "uploads", "compras");
const URL_PUBLICA = "/api/uploads/compras";
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};
const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Etiquetas legibles de cada campo, para que el historial se lea como una frase
// y no como nombres de columna.
const ETIQUETA_CAMPO: Record<string, string> = {
  proveedor: "Proveedor",
  total: "Total",
  estado: "Estado",
  detalle: "Detalle",
  imagen: "Imagen",
};

async function getCompra(id: number): Promise<Compra | null> {
  const [c] = await db.select().from(compras).where(eq(compras.id, id));
  const usuario = await getUsuarioActual();
  if (usuario?.rol === "miembro" && c?.sucursalId !== usuario.sucursalId) return null;
  return c ?? null;
}

/**
 * Compara el antes/después de una compra y deja una fila de auditoría por cada
 * campo que realmente cambió. Es el único lugar que escribe el historial.
 */
async function registrarCambios(
  compraId: number,
  antes: Partial<Compra>,
  despues: Partial<Compra>,
  usuario: UsuarioActual
) {
  const filas = Object.keys(despues)
    .filter((campo) => {
      const a = antes[campo as keyof Compra];
      const d = despues[campo as keyof Compra];
      return String(a ?? "") !== String(d ?? "");
    })
    .map((campo) => ({
      compraId,
      usuarioId: usuario.id || null,
      usuarioNombre: usuario.nombre,
      campo: ETIQUETA_CAMPO[campo] ?? campo,
      antes: recortar(antes[campo as keyof Compra]),
      despues: recortar(despues[campo as keyof Compra]),
    }));

  if (filas.length > 0) await db.insert(compraHistorial).values(filas);
  return filas.length;
}

// El detalle transcripto puede ser larguísimo: en el historial guardamos un
// extracto, alcanza para saber qué pasó.
function recortar(v: unknown): string {
  const s = String(v ?? "");
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

export async function historialCompra(compraId: number) {
  await requireAcceso("compras");
  if (!await getCompra(compraId)) return [];
  return db
    .select()
    .from(compraHistorial)
    .where(eq(compraHistorial.compraId, compraId))
    .orderBy(desc(compraHistorial.id));
}

export async function editarCompra(compraId: number, formData: FormData) {
  const usuario = await requireAcceso("compras");
  const antes = await getCompra(compraId);
  if (!antes) return { ok: false as const, error: "La compra no existe." };

  const proveedor = String(formData.get("proveedor") || "").trim();
  if (!proveedor) return { ok: false as const, error: "El proveedor es obligatorio." };

  const totalCrudo = Number(formData.get("total"));
  const estado = String(formData.get("estado") || antes.estado);

  const despues = {
    proveedor,
    total: Number.isFinite(totalCrudo) && totalCrudo >= 0 ? totalCrudo : antes.total,
    estado: esEstadoCompra(estado) ? estado : antes.estado,
    detalle: String(formData.get("detalle") ?? antes.detalle),
  };

  await db.update(compras).set(despues).where(eq(compras.id, compraId));
  await registrarCambios(compraId, antes, despues, usuario);
  revalidatePath("/admin/compras");
  revalidatePath("/");
  return { ok: true as const };
}

export async function cambiarEstadoCompra(compraId: number, estado: string) {
  const usuario = await requireAcceso("compras");
  if (!esEstadoCompra(estado)) return { ok: false as const, error: "Estado inválido." };
  const antes = await getCompra(compraId);
  if (!antes) return { ok: false as const, error: "La compra no existe." };
  if (antes.estado === estado) return { ok: true as const };

  await db.update(compras).set({ estado }).where(eq(compras.id, compraId));
  await registrarCambios(compraId, antes, { estado }, usuario);
  revalidatePath("/admin/compras");
  return { ok: true as const };
}

export async function eliminarCompra(compraId: number) {
  await requireAcceso("compras");
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };
  const [aplicado] = await db.select({ id: compraItems.id }).from(compraItems).where(eq(compraItems.compraId, compraId)).limit(1);
  if (aplicado && !compra.stockRevertido) return { ok: false as const, error: "Primero revertí la carga de stock desde Stock → Cargar stock." };
  if (compra.imagen) await borrarArchivo(compra.imagen);
  // Se van el borrador y los items junto con la compra. El stock ya cargado NO
  // se revierte: borrar el papel no devuelve la mercadería al proveedor. Si hay
  // que descontarlo, se hace desde Stock.
  await db.delete(compraLineas).where(eq(compraLineas.compraId, compraId));
  await db.delete(compraItems).where(eq(compraItems.compraId, compraId));
  await db.delete(compraHistorial).where(eq(compraHistorial.compraId, compraId));
  await db.delete(compras).where(eq(compras.id, compraId));
  revalidatePath("/admin/compras");
  revalidatePath("/");
  return { ok: true as const };
}

// Traduce la URL guardada en la DB al archivo real en disco. Devuelve null si
// la ruta no es una de las nuestras (nunca tocamos algo fuera de /uploads).
function archivoDe(rutaPublica: string): string | null {
  const nombre = path.basename(rutaPublica);
  if (!rutaPublica.startsWith(`${URL_PUBLICA}/`) || !nombre || nombre.includes("..")) return null;
  return path.join(DIR_SUBIDAS, nombre);
}

async function borrarArchivo(rutaPublica: string) {
  const archivo = archivoDe(rutaPublica);
  if (!archivo) return;
  try {
    await unlink(archivo);
  } catch {
    /* ya no estaba → nada que hacer */
  }
}

export async function subirImagenCompra(compraId: number, formData: FormData) {
  const usuario = await requireCargaStock();
  const antes = await getCompra(compraId);
  if (!antes) return { ok: false as const, error: "La compra no existe." };

  const archivo = formData.get("imagen");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: "Elegí una imagen." };
  }
  if (archivo.size > MAX_BYTES) {
    return { ok: false as const, error: "La imagen no puede superar los 8 MB." };
  }
  const tipo = TIPOS[archivo.type];
  if (!tipo) {
    return { ok: false as const, error: "Formato no soportado. Usá JPG, PNG, WEBP o GIF." };
  }

  await mkdir(DIR_SUBIDAS, { recursive: true });
  const nombre = `${compraId}-${randomBytes(6).toString("hex")}.${EXTENSIONES[tipo]}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());
  await writeFile(path.join(DIR_SUBIDAS, nombre), buffer);

  const ruta = `${URL_PUBLICA}/${nombre}`;
  await db.update(compras).set({ imagen: ruta }).where(eq(compras.id, compraId));
  await registrarCambios(compraId, antes, { imagen: ruta }, usuario);
  // La imagen anterior queda huérfana si no la borramos.
  if (antes.imagen) await borrarArchivo(antes.imagen);

  revalidatePath("/admin/compras");
  return { ok: true as const, imagen: ruta };
}

/**
 * Lee la foto del remito y la vuelca al detalle usando visión.
 * No pisa nada por accidente: si ya hay detalle, hay que pasar reemplazar=true.
 */
export async function transcribirImagenCompra(compraId: number, reemplazar = false) {
  const usuario = await requireCargaStock();
  const antes = await getCompra(compraId);
  if (!antes) return { ok: false as const, error: "La compra no existe." };
  if (!antes.imagen) return { ok: false as const, error: "Esta compra todavía no tiene imagen." };
  if (antes.detalle.trim() && !reemplazar) {
    return { ok: false as const, error: "Ya hay un detalle cargado.", requiereConfirmacion: true as const };
  }

  let texto: string;
  try {
    texto = await transcribirImagen(await cargarImagen(antes));
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  if (!texto) return { ok: false as const, error: "La IA no pudo leer nada en la imagen." };

  await db.update(compras).set({ detalle: texto }).where(eq(compras.id, compraId));
  await registrarCambios(compraId, antes, { detalle: texto }, usuario);
  revalidatePath("/admin/compras");
  return { ok: true as const, detalle: texto };
}

// ---------------------------------------------------------------------------
// Recepción: de la foto del remito al stock
// ---------------------------------------------------------------------------
// El borrador (compra_lineas) es una zona de trabajo: se puede leer una foto,
// leer otra y sumarla, editar renglones, agregar los que la IA no vio y borrar
// los que sobran. NADA de eso toca el stock. El stock se mueve solamente en
// aplicarRecepcion(), y solo si se confirmó explícitamente.

type DatosLinea = {
  descripcion?: string;
  codigo?: string;
  cantidad?: number;
  precioUnit?: number;
  precioVenta?: number;
  unidadMedida?: UnidadMedida;
  modoStock?: ModoStock;
};

const MEDIA_TYPES: Record<string, ImagenEntrada["mediaType"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Deja una línea de auditoría suelta (las que no son un cambio de campo). */
async function anotar(compraId: number, usuario: UsuarioActual, campo: string, despues: string) {
  await db.insert(compraHistorial).values({
    compraId,
    usuarioId: usuario.id || null,
    usuarioNombre: usuario.nombre,
    campo,
    antes: "",
    despues: recortar(despues),
  });
}

async function cargarImagen(compra: Compra): Promise<ImagenEntrada> {
  if (!compra.imagen) throw new Error("Esta compra todavía no tiene imagen.");
  const ext = path.extname(compra.imagen).toLowerCase().replace(".", "");
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) throw new Error("El formato de la imagen no se puede leer.");
  const archivo = archivoDe(compra.imagen);
  if (!archivo) throw new Error("No se encontró el archivo de la imagen.");
  const buffer = await readFile(archivo);
  return { base64: buffer.toString("base64"), mediaType };
}

async function getLinea(lineaId: number): Promise<CompraLinea | null> {
  const [l] = await db.select().from(compraLineas).where(eq(compraLineas.id, lineaId));
  if (!l || !await getCompra(l.compraId)) return null;
  return l;
}

/** Renglones del borrador, los pendientes primero y en el orden en que entraron. */
export async function lineasCompra(compraId: number) {
  const usuario = await requireCargaStock();
  if (!await getCompra(compraId)) throw new Error("La compra no existe.");
  const config = await leerReglasStock();
  const lineas = await db.select().from(compraLineas).where(eq(compraLineas.compraId, compraId)).orderBy(asc(compraLineas.id));
  return lineas.map(linea => ({ ...linea, multiplicador: multiplicadorProducto(config, linea.productoId), permitePrecioManual: usuario.rol === "admin" }));
}
async function pendientesDe(compraId: number) {
  if (!await getCompra(compraId)) throw new Error("La compra no existe.");
  return db
    .select()
    .from(compraLineas)
    .where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false))).orderBy(asc(compraLineas.id));
}

// Guarda la lectura en el borrador. `agregar` mantiene lo que ya había (sirve
// para el remito de varias hojas: una foto por hoja).
async function guardarLectura(
  compraId: number,
  items: LineaClasificada[],
  modo: "reemplazar" | "agregar"
) {
  if (items.length === 0) return;
  const configPrecios = await leerReglasStock();
  await db.transaction(async tx => {
    if (modo === "reemplazar") {
      // La sustitución es atómica: una importación fallida conserva el borrador.
      await tx.delete(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false)));
    }
    await tx.insert(compraLineas).values(items.map((it) => ({
      compraId,
      descripcion: it.descripcion,
      codigo: it.codigo,
      cantidad: it.cantidad,
      modoStock: it.modoStock ?? "sumar",
      unidadMedida: it.unidadMedida ?? "unidad",
      precioUnit: it.precioUnit,
      precioVenta: it.estado === "nuevo" ? (it.precioVenta ?? precioDesdeCosto(it.precioUnit, configPrecios.multiplicador ?? 2)) : 0,
      productoId: it.productoId,
      estado: it.estado,
      candidatos: JSON.stringify(it.candidatos),
      origen: "ia",
    })));
  });
}

function resumenLectura(items: LineaClasificada[]): string {
  const n = (e: string) => items.filter((i) => i.estado === e).length;
  return `${items.length} renglones · ${n("match")} ya en stock · ${n("duda")} a revisar · ${n("nuevo")} nuevos`;
}

/**
 * Lee la foto del remito y arma el borrador. No toca el stock ni la compra:
 * solo deja los renglones listos para revisar.
 */
export async function leerRemitoCompra(compraId: number, modo?: "reemplazar" | "agregar") {
  const usuario = await requireCargaStock();
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  // Si ya hay borrador, preguntamos antes: puede ser la segunda hoja del remito
  // (agregar) o una foto mejor de la misma (reemplazar).
  if (!modo) {
    const pendientes = await pendientesDe(compraId);
    if (pendientes.length > 0) {
      return {
        ok: false as const,
        error: `Ya hay ${pendientes.length} renglones en el borrador.`,
        requiereConfirmacion: true as const,
        pendientes: pendientes.length,
      };
    }
    modo = "agregar";
  }

  let lectura;
  try {
    lectura = await leerRemitoImagen(await cargarImagen(compra));
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  if (lectura.items.length === 0) {
    return { ok: false as const, error: "No se reconoció ningún renglón de mercadería en la foto." };
  }

  const items = await clasificarItems(lectura.items);
  await guardarLectura(compraId, items, modo);
  await anotar(compraId, usuario, "Lectura del remito", resumenLectura(items));
  revalidatePath("/admin/compras");
  return {
    ok: true as const,
    lineas: items.length,
    // Datos del comprobante que se leyeron de paso. Se muestran como sugerencia;
    // no se pisa la compra sin que alguien lo pida.
    sugerencias: { proveedor: lectura.proveedor, total: lectura.total },
  };
}

/**
 * Igual que la anterior pero partiendo del texto del detalle. Es la ruta que
 * anda siempre con DeepSeek (el modelo de texto), y también sirve para pegar
 * un remito escrito a mano.
 */
export async function analizarDetalleCompra(
  compraId: number,
  modo?: "reemplazar" | "agregar",
  texto?: string
) {
  const usuario = await requireCargaStock();
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  const fuente = (texto ?? compra.detalle).trim();
  if (!fuente) return { ok: false as const, error: "No hay detalle para analizar." };

  if (!modo) {
    const pendientes = await pendientesDe(compraId);
    if (pendientes.length > 0) {
      return {
        ok: false as const,
        error: `Ya hay ${pendientes.length} renglones en el borrador.`,
        requiereConfirmacion: true as const,
        pendientes: pendientes.length,
      };
    }
    modo = "agregar";
  }

  let lectura;
  try {
    lectura = await leerRemitoTexto(fuente);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  if (lectura.items.length === 0) {
    return { ok: false as const, error: "No se reconoció ningún renglón de mercadería en el detalle." };
  }

  const items = await clasificarItems(lectura.items);
  await guardarLectura(compraId, items, modo);
  await anotar(compraId, usuario, "Lectura del detalle", resumenLectura(items));
  revalidatePath("/admin/compras");
  return {
    ok: true as const,
    lineas: items.length,
    sugerencias: { proveedor: lectura.proveedor, total: lectura.total },
  };
}

/** Renglón cargado a mano: el que estaba tachado, el que la IA no vio. */
export async function agregarLineaCompra(compraId: number, datos: DatosLinea) {
  const usuario = await requireCargaStock();
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  if (datos.cantidad !== undefined && !cantidadValida(datos.cantidad, datos.unidadMedida ?? "unidad", datos.modoStock === "fijar")) return { ok: false as const, error: "Revisá la cantidad y la unidad de medida." };
  if ([datos.precioUnit, datos.precioVenta].some(v => v !== undefined && (!Number.isFinite(v) || v < 0))) return { ok: false as const, error: "Los precios deben ser números positivos o cero." };
  const descripcion = String(datos.descripcion || "").trim();
  if (!descripcion) return { ok: false as const, error: "Escribí qué producto es." };

  const item = await reclasificar({
    descripcion,
    codigo: String(datos.codigo || "").trim(),
    cantidad: datos.cantidad ?? 1,
    modoStock: datos.modoStock ?? "sumar",
    unidadMedida: datos.unidadMedida ?? "unidad",
    precioUnit: montoPositivo(datos.precioUnit),
  });

  const [linea] = await db
    .insert(compraLineas)
    .values({
      compraId,
      descripcion: item.descripcion,
      codigo: item.codigo,
      cantidad: item.cantidad,
      modoStock: item.modoStock ?? "sumar",
      unidadMedida: item.unidadMedida ?? "unidad",
      precioUnit: item.precioUnit,
      precioVenta: usuario.rol === "admin" ? montoPositivo(datos.precioVenta) : precioDesdeCosto(item.precioUnit, (await leerReglasStock()).multiplicador ?? 2),
      productoId: item.productoId,
      estado: item.estado,
      candidatos: JSON.stringify(item.candidatos),
      origen: "manual",
    })
    .returning({ id: compraLineas.id });

  return { ok: true as const, lineaId: linea.id };
}

export async function actualizarLineaCompra(lineaId: number, datos: DatosLinea) {
  const usuario = await requireCargaStock();
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };

  const modoStock = datos.modoStock ?? (linea.modoStock as ModoStock);
  const unidadMedida = datos.unidadMedida ?? (linea.unidadMedida as UnidadMedida);
  if (!["sumar", "fijar"].includes(modoStock) || !["unidad", "kg"].includes(unidadMedida) ||
    (datos.cantidad !== undefined && !cantidadValida(datos.cantidad, unidadMedida, modoStock === "fijar"))) return { ok: false as const, error: "Revisá la cantidad y la unidad de medida." };
  if ([datos.precioUnit, datos.precioVenta].some(v => v !== undefined && (!Number.isFinite(v) || v < 0))) return { ok: false as const, error: "Los precios deben ser números positivos o cero." };
  const descripcion = datos.descripcion !== undefined ? String(datos.descripcion).trim() : linea.descripcion;
  if (!descripcion) return { ok: false as const, error: "La descripción no puede quedar vacía." };
  const codigo = datos.codigo !== undefined ? String(datos.codigo).trim() : linea.codigo;

  const cambios: {
    descripcion: string;
    codigo: string;
    cantidad: number;
    modoStock: ModoStock;
    unidadMedida: UnidadMedida;
    precioUnit: number;
    precioVenta: number;
    productoId?: number | null;
    estado?: string;
    candidatos?: string;
  } = {
    descripcion,
    codigo,
    cantidad: datos.cantidad ?? linea.cantidad,
    modoStock,
    unidadMedida,
    precioUnit: datos.precioUnit !== undefined ? montoPositivo(datos.precioUnit) : linea.precioUnit,
    precioVenta: datos.precioVenta !== undefined ? montoPositivo(datos.precioVenta) : linea.precioVenta,
  };

  if (usuario.rol !== "admin") cambios.precioVenta = cambios.precioUnit > 0 ? precioDesdeCosto(cambios.precioUnit, (await leerReglasStock()).multiplicador ?? 2) : linea.precioVenta;
  // Si cambió lo que identifica al producto, la clasificación anterior ya no
  // vale. Salvo que alguien haya elegido el producto a mano: ahí manda la
  // persona, no el algoritmo.
  const cambioIdentidad = descripcion !== linea.descripcion || codigo !== linea.codigo;
  if (cambioIdentidad && !linea.confirmado) {
    const item = await reclasificar({
      descripcion,
      codigo,
      cantidad: cambios.cantidad,
      modoStock: cambios.modoStock,
      unidadMedida: cambios.unidadMedida,
      precioUnit: cambios.precioUnit,
    });
    cambios.productoId = item.productoId;
    cambios.estado = item.estado;
    cambios.candidatos = JSON.stringify(item.candidatos);
  }

  await db.update(compraLineas).set(cambios).where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

/**
 * Vincula el renglón a un producto del stock, o lo marca como producto nuevo
 * (productoId = null). Elegir a mano cuenta como confirmación.
 */
export async function vincularLineaCompra(lineaId: number, productoId: number | null) {
  await requireCargaStock();
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };

  if (productoId !== null) {
    const [p] = await db.select().from(productos).where(eq(productos.id, productoId));
    if (!p || !p.activo) return { ok: false as const, error: "Ese producto ya no está disponible." };
    await db
      .update(compraLineas)
      .set({
        productoId,
        estado: "match",
        confirmado: true,
        // Guardamos el elegido como candidato único: así la fila puede mostrar
        // el nombre del producto aunque se haya buscado a mano.
        candidatos: JSON.stringify([{ id: p.id, nombre: p.nombre, sku: p.sku, score: 1 }]),
      })
      .where(eq(compraLineas.id, lineaId));
    return { ok: true as const };
  }

  // La creación se revisa en la confirmación general de la carga.
  await db
    .update(compraLineas)
    .set({ productoId: null, estado: "nuevo", confirmado: false })
    .where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

/** El visto bueno por renglón (crear el producto nuevo / aceptar la duda). */
export async function confirmarLineaCompra(lineaId: number, confirmado: boolean) {
  await requireCargaStock();
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };
  await db.update(compraLineas).set({ confirmado }).where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

export async function confirmarNuevosCompra(compraId: number) {
  await requireCargaStock();
  if (!await getCompra(compraId)) return { ok: false as const, error: "La carga no existe." };
  const r = await db.update(compraLineas).set({ confirmado: true })
    .where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false), eq(compraLineas.estado, "nuevo"), isNull(compraLineas.productoId), eq(compraLineas.confirmado, false)));
  return { ok: true as const, cantidad: r.rowsAffected };
}

export async function ponerNegativosEnCero(compraId: number) {
  await requireCargaStock();
  if (!await getCompra(compraId)) return { ok: false as const, error: "La carga no existe." };
  const r = await db.update(compraLineas).set({ cantidad: 0 })
    .where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false), eq(compraLineas.modoStock, "fijar"), lt(compraLineas.cantidad, 0)));
  return { ok: true as const, cantidad: r.rowsAffected };
}

export async function eliminarLineaCompra(lineaId: number) {
  await requireCargaStock();
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: true as const };
  if (linea.aplicado) {
    return { ok: false as const, error: "Ese renglón ya se cargó al stock: no se puede borrar." };
  }
  await db.delete(compraLineas).where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

export async function cancelarCargaStock(compraId: number) {
  const usuario = await requireCargaStock();
  if (!await getCompra(compraId)) return { ok: false as const, error: "La carga no existe." };
  try {
    await db.transaction(async tx => {
      const r = await tx.delete(compraLineas).where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false)));
      await tx.insert(compraHistorial).values({ compraId, usuarioId: usuario.id || null,
        usuarioNombre: usuario.nombre, campo: "Carga cancelada", antes: "", despues: `${r.rowsAffected} renglones pendientes descartados` });
    });
    revalidatePath("/admin/stock/carga");
    revalidatePath("/admin/compras");
    return { ok: true as const };
  } catch { return { ok: false as const, error: "No se pudo cancelar la carga. Intentá nuevamente." }; }
}

export async function buscarProductosCompra(q: string) {
  await requireCargaStock();
  return buscarProductos(q);
}

function armarResumen(pendientes: CompraLinea[]): ResumenRecepcion {
  const conProducto = pendientes.filter((l) => l.productoId !== null);
  const sinProducto = pendientes.filter((l) => l.productoId === null);
  const cantidad = (l: CompraLinea) => l.modoStock === "fijar" ? stockDespues(0, l.cantidad, "fijar") : l.cantidad;
  const suma = (ls: CompraLinea[]) => ls.reduce((a, l) => a + cantidad(l), 0);
  return {
    pendientes: pendientes.length,
    existentes: { lineas: conProducto.length, unidades: suma(conProducto) },
    nuevos: {
      lineas: sinProducto.length,
      unidades: suma(sinProducto),
      nombres: sinProducto.map((l) => l.descripcion),
    },
    dudas: pendientes.filter((l) => l.estado === "duda" && !l.confirmado).length,
    sinConfirmar: sinProducto.filter((l) => l.estado !== "nuevo" && !l.confirmado).length,
    costo: pendientes.reduce((a, l) => a + cantidad(l) * l.precioUnit, 0),
    inventario: pendientes.filter(l => l.modoStock === "fijar").length,
    noPositivos: pendientes.filter(l => l.modoStock === "fijar" && l.cantidad <= 0).length,
  };
}

export async function unificarLineasCompra(compraId: number) {
  await requireCargaStock();
  if (!await getCompra(compraId)) throw new Error("La compra no existe.");
  return unificarBorrador(compraId);
}

/** Qué pasaría si se confirma. Es lo que se muestra en el cartel de confirmación. */
export async function resumenRecepcion(compraId: number): Promise<ResumenRecepcion> {
  await requireCargaStock();
  return armarResumen(await pendientesDe(compraId));
}

/**
 * Único punto donde la compra toca el stock.
 *
 * Suma unidades y actualiza costos si se eligió. La revalorización de venta
 * requiere selección individual; no toca publicación ni descripción web. Los productos
 * nuevos se crean sin publicar, para que aparecer en la tienda siga siendo una
 * decisión aparte.
 */
export async function aplicarRecepcion(
  compraId: number,
  opciones: { confirmado: boolean; aceptarNoPositivos?: boolean; actualizarCosto?: boolean; revalorizar?: number[]; impactos?: ImpactoLinea[] }
) {
  const usuario = await requireCargaStock();
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  // El cartel de confirmación se puede saltear desde el cliente: la regla vive
  // acá, en el servidor.
  if (!opciones?.confirmado) {
    return { ok: false as const, error: "Hay que confirmar antes de cargar al stock." };
  }

  if (usuario.rol !== "admin" && opciones.revalorizar?.length) return { ok: false as const, error: "Solo el administrador puede elegir una revalorización manual." };
  const pendientes = await pendientesDe(compraId);
  if (pendientes.length === 0) {
    return { ok: false as const, error: "No hay renglones pendientes para cargar." };
  }

  const resumen = armarResumen(pendientes);
  if (resumen.dudas > 0) {
    return {
      ok: false as const,
      error: `Hay ${resumen.dudas} renglones a revisar. Elegí el producto o marcalos como nuevos antes de cargar.`,
    };
  }
  if (resumen.sinConfirmar > 0) {
    return {
      ok: false as const,
      error: `Hay ${resumen.sinConfirmar} productos nuevos sin confirmar. Revisá que no sean un producto que ya tenés escrito distinto.`,
    };
  }
  if (resumen.noPositivos > 0 && !opciones.aceptarNoPositivos) return { ok: false as const, error: "Confirmá expresamente los saldos en cero o negativos del inventario." };
  const invalidas = pendientes.filter((l) => !cantidadValida(l.cantidad, l.unidadMedida as UnidadMedida, l.modoStock === "fijar") || !Number.isFinite(l.precioUnit) || l.precioUnit < 0 || !l.descripcion.trim());
  if (invalidas.length > 0) {
    return { ok: false as const, error: "Hay renglones con descripción o cantidad inválida." };
  }

  const creados: string[] = [];

  // La mercadería entra al local que recibe el remito: el de la compra, o el que
  // esté abierto en el panel si la compra es anterior a las sucursales.
  const sucursalId = compra.sucursalId ?? (await sucursalOperativaId());

  try {
    creados.push(...await confirmarStockEnTransaccion({ compraId, pendientes: pendientes.slice(0, 20), sucursalId, usuario, opciones }));
  } catch (e) {
    return { ok: false as const, error: `No se cargó nada al stock: ${(e as Error).message}` };
  }

  const aplicadasAhora = pendientes.slice(0, 20);
  const unidades = aplicadasAhora.reduce((n, l) => n + l.cantidad, 0);

  revalidatePath("/admin/compras");
  revalidatePath("/admin/stock");
  revalidatePath("/admin/compras/diferencias-precios");
  revalidatePath("/tienda");
  revalidatePath("/");
  return {
    ok: true as const,
    lineas: aplicadasAhora.length,
    unidades,
    creados: creados.length,
    actualizados: aplicadasAhora.filter(l => l.productoId !== null).length,
    pendientesRestantes: Math.max(0, pendientes.length - aplicadasAhora.length),
  };
}

function montoPositivo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}


export async function impactosRecepcion(compraId: number): Promise<ImpactoLinea[]> {
  await requireCargaStock();
  const compra = await getCompra(compraId);
  if (!compra) throw new Error("La compra no existe.");
  const sucursalId = compra.sucursalId ?? await sucursalOperativaId();
  const pendientes = await pendientesDe(compraId);
  const configPrecios = await leerReglasStock();
  const resultado: ImpactoLinea[] = [];
  for (const linea of pendientes) {
    const [p] = linea.productoId === null ? [] : await db.select().from(productos).where(eq(productos.id, linea.productoId));
    const [ultima] = p ? await db.select().from(compraItems).where(and(eq(compraItems.productoId, p.id), sql`${compraItems.precioUnit} > 0`)).orderBy(desc(compraItems.id)).limit(1) : [];
    const [local] = p && sucursalId ? await db.select().from(stockSucursal).where(and(eq(stockSucursal.productoId, p.id), eq(stockSucursal.sucursalId, sucursalId))) : [];
    const anterior = sucursalId ? (local?.cantidad ?? 0) : (p?.stock ?? 0);
    const costoAnterior = ultima?.precioUnit ?? p?.precioCompra ?? 0;
    const multiplicador = multiplicadorProducto(configPrecios, linea.productoId);
    resultado.push({ cantidad: linea.cantidad, modoStock: linea.modoStock as ModoStock, unidadMedida: linea.unidadMedida as UnidadMedida, multiplicador, ventaNueva: multiplicador !== null && linea.precioUnit > 0 ? precioDesdeCosto(linea.precioUnit, multiplicador) : p?.precioVenta ?? linea.precioVenta, lineaId: linea.id, nombre: p?.nombre ?? linea.descripcion, codigo: p?.sku ?? linea.codigo,
      stockAnterior: anterior, stockNuevo: stockDespues(anterior, linea.cantidad, linea.modoStock as ModoStock), costoAnterior,
      costoNuevo: linea.precioUnit, ventaAnterior: p?.precioVenta ?? 0,
      ...diferenciaCosto(costoAnterior, linea.precioUnit, p?.precioVenta ?? 0, multiplicador) });
  }
  return resultado;
}

export async function importarArchivoCompra(compraId: number, formData: FormData, modo: "reemplazar" | "agregar" = "agregar") {
  const usuario = await requireCargaStock();
  if (!await getCompra(compraId)) return { ok: false as const, error: "La compra no existe." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false as const, error: "Elegí un archivo." };
  try {
    const lectura = await extraerDocumentoStock(archivo);
    if (!lectura.items.length || lectura.items.length > 1000) throw new Error("Se permiten entre 1 y 1000 productos por archivo.");
    await guardarLectura(compraId, await clasificarItems(lectura.items), modo);
    await anotar(compraId, usuario, "Archivo importado", `${archivo.name}: ${lectura.items.length} renglones`);
    revalidatePath("/admin/compras");
    return { ok: true as const, lineas: lectura.items.length, omitidos: lectura.omitidos ?? 0 };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function crearCargaStock(formData: FormData) {
  await requireCargaStock();
  const { lista, activaId } = await getContextoSucursal();
  const sucursalId = activaId ?? Number(formData.get("sucursalId"));
  if (!lista.some(s => s.id === sucursalId)) return { ok: false as const, error: "Elegí una sucursal de destino activa." };
  const proveedor = String(formData.get("proveedor") ?? "").trim();
  if (!proveedor) return { ok: false as const, error: "Escribí el proveedor." };
  const [compra] = await db.insert(compras).values({ proveedor, sucursalId, estado: "falta_controlar" }).returning();
  revalidatePath("/admin/compras");
  return { ok: true as const, compra };
}
