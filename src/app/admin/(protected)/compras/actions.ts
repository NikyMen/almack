"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  compras,
  compraHistorial,
  compraItems,
  compraLineas,
  productos,
  type Compra,
  type CompraLinea,
} from "@/db/schema";
import { requireAcceso } from "@/lib/auth";
import {
  transcribirImagen,
  leerRemitoImagen,
  leerRemitoTexto,
  type ImagenEntrada,
} from "@/lib/ai";
import { esEstadoCompra } from "@/lib/compras";
import { sumarStockEnTx } from "@/lib/stock";
import { sucursalOperativaId } from "@/lib/sucursal";
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
  revalidatePath("/compras");
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
  revalidatePath("/compras");
  return { ok: true as const };
}

export async function eliminarCompra(compraId: number) {
  await requireAcceso("compras");
  const compra = await getCompra(compraId);
  if (compra?.imagen) await borrarArchivo(compra.imagen);
  // Se van el borrador y los items junto con la compra. El stock ya cargado NO
  // se revierte: borrar el papel no devuelve la mercadería al proveedor. Si hay
  // que descontarlo, se hace desde Stock.
  await db.delete(compraLineas).where(eq(compraLineas.compraId, compraId));
  await db.delete(compraItems).where(eq(compraItems.compraId, compraId));
  await db.delete(compraHistorial).where(eq(compraHistorial.compraId, compraId));
  await db.delete(compras).where(eq(compras.id, compraId));
  revalidatePath("/compras");
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
  const usuario = await requireAcceso("compras");
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

  revalidatePath("/compras");
  return { ok: true as const, imagen: ruta };
}

/**
 * Lee la foto del remito y la vuelca al detalle usando visión.
 * No pisa nada por accidente: si ya hay detalle, hay que pasar reemplazar=true.
 */
export async function transcribirImagenCompra(compraId: number, reemplazar = false) {
  const usuario = await requireAcceso("compras");
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
  revalidatePath("/compras");
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
  return l ?? null;
}

/** Renglones del borrador, los pendientes primero y en el orden en que entraron. */
export async function lineasCompra(compraId: number) {
  await requireAcceso("compras");
  return db
    .select()
    .from(compraLineas)
    .where(eq(compraLineas.compraId, compraId))
    .orderBy(asc(compraLineas.id));
}

async function pendientesDe(compraId: number) {
  return db
    .select()
    .from(compraLineas)
    .where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false)));
}

// Guarda la lectura en el borrador. `agregar` mantiene lo que ya había (sirve
// para el remito de varias hojas: una foto por hoja).
async function guardarLectura(
  compraId: number,
  items: LineaClasificada[],
  modo: "reemplazar" | "agregar"
) {
  if (modo === "reemplazar") {
    // Solo lo pendiente: lo ya aplicado al stock es historia y no se borra.
    await db
      .delete(compraLineas)
      .where(and(eq(compraLineas.compraId, compraId), eq(compraLineas.aplicado, false)));
  }
  if (items.length === 0) return;
  await db.insert(compraLineas).values(
    items.map((it) => ({
      compraId,
      descripcion: it.descripcion,
      codigo: it.codigo,
      cantidad: it.cantidad,
      precioUnit: it.precioUnit,
      productoId: it.productoId,
      estado: it.estado,
      candidatos: JSON.stringify(it.candidatos),
      origen: "ia",
    }))
  );
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
  const usuario = await requireAcceso("compras");
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
  revalidatePath("/compras");
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
  const usuario = await requireAcceso("compras");
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
  revalidatePath("/compras");
  return {
    ok: true as const,
    lineas: items.length,
    sugerencias: { proveedor: lectura.proveedor, total: lectura.total },
  };
}

/** Renglón cargado a mano: el que estaba tachado, el que la IA no vio. */
export async function agregarLineaCompra(compraId: number, datos: DatosLinea) {
  await requireAcceso("compras");
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  const descripcion = String(datos.descripcion || "").trim();
  if (!descripcion) return { ok: false as const, error: "Escribí qué producto es." };

  const item = await reclasificar({
    descripcion,
    codigo: String(datos.codigo || "").trim(),
    cantidad: enteroPositivo(datos.cantidad, 1),
    precioUnit: montoPositivo(datos.precioUnit),
  });

  const [linea] = await db
    .insert(compraLineas)
    .values({
      compraId,
      descripcion: item.descripcion,
      codigo: item.codigo,
      cantidad: item.cantidad,
      precioUnit: item.precioUnit,
      precioVenta: montoPositivo(datos.precioVenta),
      productoId: item.productoId,
      estado: item.estado,
      candidatos: JSON.stringify(item.candidatos),
      origen: "manual",
    })
    .returning({ id: compraLineas.id });

  return { ok: true as const, lineaId: linea.id };
}

export async function actualizarLineaCompra(lineaId: number, datos: DatosLinea) {
  await requireAcceso("compras");
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };

  const descripcion = datos.descripcion !== undefined ? String(datos.descripcion).trim() : linea.descripcion;
  if (!descripcion) return { ok: false as const, error: "La descripción no puede quedar vacía." };
  const codigo = datos.codigo !== undefined ? String(datos.codigo).trim() : linea.codigo;

  const cambios: {
    descripcion: string;
    codigo: string;
    cantidad: number;
    precioUnit: number;
    precioVenta: number;
    productoId?: number | null;
    estado?: string;
    candidatos?: string;
  } = {
    descripcion,
    codigo,
    cantidad: enteroPositivo(datos.cantidad, linea.cantidad),
    precioUnit: datos.precioUnit !== undefined ? montoPositivo(datos.precioUnit) : linea.precioUnit,
    precioVenta: datos.precioVenta !== undefined ? montoPositivo(datos.precioVenta) : linea.precioVenta,
  };

  // Si cambió lo que identifica al producto, la clasificación anterior ya no
  // vale. Salvo que alguien haya elegido el producto a mano: ahí manda la
  // persona, no el algoritmo.
  const cambioIdentidad = descripcion !== linea.descripcion || codigo !== linea.codigo;
  if (cambioIdentidad && !linea.confirmado) {
    const item = await reclasificar({
      descripcion,
      codigo,
      cantidad: cambios.cantidad,
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
  await requireAcceso("compras");
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };

  if (productoId !== null) {
    const [p] = await db.select().from(productos).where(eq(productos.id, productoId));
    if (!p) return { ok: false as const, error: "Ese producto ya no existe." };
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

  // Pasa a "nuevo": vuelve a pedir confirmación, porque crear un producto de
  // más es el error caro de todo este flujo.
  await db
    .update(compraLineas)
    .set({ productoId: null, estado: "nuevo", confirmado: false })
    .where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

/** El visto bueno por renglón (crear el producto nuevo / aceptar la duda). */
export async function confirmarLineaCompra(lineaId: number, confirmado: boolean) {
  await requireAcceso("compras");
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: false as const, error: "El renglón no existe." };
  if (linea.aplicado) return { ok: false as const, error: "Ese renglón ya se cargó al stock." };
  await db.update(compraLineas).set({ confirmado }).where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

export async function eliminarLineaCompra(lineaId: number) {
  await requireAcceso("compras");
  const linea = await getLinea(lineaId);
  if (!linea) return { ok: true as const };
  if (linea.aplicado) {
    return { ok: false as const, error: "Ese renglón ya se cargó al stock: no se puede borrar." };
  }
  await db.delete(compraLineas).where(eq(compraLineas.id, lineaId));
  return { ok: true as const };
}

export async function buscarProductosCompra(q: string) {
  await requireAcceso("compras");
  return buscarProductos(q);
}

function armarResumen(pendientes: CompraLinea[]): ResumenRecepcion {
  const conProducto = pendientes.filter((l) => l.productoId !== null);
  const sinProducto = pendientes.filter((l) => l.productoId === null);
  const suma = (ls: CompraLinea[]) => ls.reduce((a, l) => a + l.cantidad, 0);
  return {
    pendientes: pendientes.length,
    existentes: { lineas: conProducto.length, unidades: suma(conProducto) },
    nuevos: {
      lineas: sinProducto.length,
      unidades: suma(sinProducto),
      nombres: sinProducto.map((l) => l.descripcion),
    },
    dudas: pendientes.filter((l) => l.estado === "duda" && !l.confirmado).length,
    sinConfirmar: sinProducto.filter((l) => !l.confirmado).length,
    costo: pendientes.reduce((a, l) => a + l.cantidad * l.precioUnit, 0),
  };
}

/** Qué pasaría si se confirma. Es lo que se muestra en el cartel de confirmación. */
export async function resumenRecepcion(compraId: number): Promise<ResumenRecepcion> {
  await requireAcceso("compras");
  return armarResumen(await pendientesDe(compraId));
}

/**
 * Único punto donde la compra toca el stock.
 *
 * A los productos que ya existen les suma unidades y nada más: no se toca
 * `publicado`, ni el precio de venta, ni la descripción web. Los productos
 * nuevos se crean sin publicar, para que aparecer en la tienda siga siendo una
 * decisión aparte.
 */
export async function aplicarRecepcion(
  compraId: number,
  opciones: { confirmado: boolean; actualizarCosto?: boolean }
) {
  const usuario = await requireAcceso("compras");
  const compra = await getCompra(compraId);
  if (!compra) return { ok: false as const, error: "La compra no existe." };

  // El cartel de confirmación se puede saltear desde el cliente: la regla vive
  // acá, en el servidor.
  if (!opciones?.confirmado) {
    return { ok: false as const, error: "Hay que confirmar antes de cargar al stock." };
  }

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
  const invalidas = pendientes.filter((l) => l.cantidad <= 0 || !l.descripcion.trim());
  if (invalidas.length > 0) {
    return { ok: false as const, error: "Hay renglones sin descripción o con cantidad en cero." };
  }

  const creados: string[] = [];
  const ahora = new Date();

  // La mercadería entra al local que recibe el remito: el de la compra, o el que
  // esté abierto en el panel si la compra es anterior a las sucursales.
  const sucursalId = compra.sucursalId ?? (await sucursalOperativaId());

  try {
    await db.transaction(async (tx) => {
      for (const linea of pendientes) {
        let productoId = linea.productoId;

        if (productoId === null) {
          const [nuevo] = await tx
            .insert(productos)
            .values({
              nombre: linea.descripcion,
              sku: linea.codigo || `SKU-${Date.now()}-${linea.id}`,
              categoria: "General",
              stock: linea.cantidad,
              precioCompra: linea.precioUnit,
              precioVenta: linea.precioVenta,
              // publicado queda en false por defecto: entra al stock, no a la tienda.
            })
            .returning({ id: productos.id });
          productoId = nuevo.id;
          creados.push(`${linea.descripcion} (#${productoId}) +${linea.cantidad}`);
          if (sucursalId) await sumarStockEnTx(tx, productoId, sucursalId, linea.cantidad);
        } else {
          const set: { stock?: SQL; precioCompra?: number } = {};
          // Sin sucursales (base previa a la migración) se suma al total, como antes.
          if (!sucursalId) set.stock = sql`${productos.stock} + ${linea.cantidad}`;
          // El costo solo se pisa si se pidió y si el remito trae precio.
          if (opciones.actualizarCosto && linea.precioUnit > 0) set.precioCompra = linea.precioUnit;

          if (Object.keys(set).length > 0) {
            const r = await tx.update(productos).set(set).where(eq(productos.id, productoId));
            if (!r.rowsAffected) {
              throw new Error(`El producto de "${linea.descripcion}" ya no existe en el stock.`);
            }
          } else {
            // Sin campos que pisar igual hay que confirmar que el producto sigue
            // existiendo: si no, la línea sumaría stock a un id fantasma.
            const [existe] = await tx
              .select({ id: productos.id })
              .from(productos)
              .where(eq(productos.id, productoId));
            if (!existe) {
              throw new Error(`El producto de "${linea.descripcion}" ya no existe en el stock.`);
            }
          }
          if (sucursalId) await sumarStockEnTx(tx, productoId, sucursalId, linea.cantidad);
        }

        await tx.insert(compraItems).values({
          compraId,
          productoId,
          cantidad: linea.cantidad,
          precioUnit: linea.precioUnit,
        });

        await tx
          .update(compraLineas)
          .set({ productoId, aplicado: true, aplicadoEn: ahora })
          .where(eq(compraLineas.id, linea.id));
      }
    });
  } catch (e) {
    return { ok: false as const, error: `No se cargó nada al stock: ${(e as Error).message}` };
  }

  const unidades = resumen.existentes.unidades + resumen.nuevos.unidades;
  await anotar(
    compraId,
    usuario,
    "Carga al stock",
    `${resumen.pendientes} renglones · ${unidades} unidades · ${creados.length} productos nuevos`
  );
  for (const c of creados) await anotar(compraId, usuario, "Producto creado", c);

  revalidatePath("/compras");
  revalidatePath("/stock");
  revalidatePath("/");
  return {
    ok: true as const,
    lineas: resumen.pendientes,
    unidades,
    creados: creados.length,
    actualizados: resumen.existentes.lineas,
  };
}

function enteroPositivo(v: unknown, porDefecto: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

function montoPositivo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
