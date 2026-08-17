"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { compras, compraHistorial, type Compra } from "@/db/schema";
import { requireAcceso } from "@/lib/auth";
import { transcribirImagen } from "@/lib/ai";
import { esEstadoCompra } from "@/lib/compras";
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

  const ext = path.extname(antes.imagen).toLowerCase().replace(".", "");
  const mediaType = (
    { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const
  )[ext];
  if (!mediaType) return { ok: false as const, error: "El formato de la imagen no se puede transcribir." };

  const archivo = archivoDe(antes.imagen);
  if (!archivo) return { ok: false as const, error: "No se encontró el archivo de la imagen." };

  let texto: string;
  try {
    const buffer = await readFile(archivo);
    texto = await transcribirImagen({ base64: buffer.toString("base64"), mediaType });
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  if (!texto) return { ok: false as const, error: "La IA no pudo leer nada en la imagen." };

  await db.update(compras).set({ detalle: texto }).where(eq(compras.id, compraId));
  await registrarCambios(compraId, antes, { detalle: texto }, usuario);
  revalidatePath("/compras");
  return { ok: true as const, detalle: texto };
}
