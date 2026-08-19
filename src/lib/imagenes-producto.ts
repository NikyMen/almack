import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Igual que los comprobantes de Compras, las fotos de productos viven fuera de
// /public: Next solo sirve /public con lo que existía al hacer el build, así que
// una imagen subida en producción nunca se vería. Se entregan por
// /api/tienda/imagenes (ruta pública: la tienda la ven clientes sin login).
const DIR_SUBIDAS = path.join(process.cwd(), "uploads", "productos");
export const URL_PUBLICA = "/api/tienda/imagenes";

const MAX_BYTES = 8 * 1024 * 1024;

export const TIPOS_IMAGEN: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Ruta en disco de una imagen nuestra, o null si la URL no nos pertenece. */
export function archivoDeImagen(rutaPublica: string): string | null {
  const nombre = path.basename(rutaPublica);
  if (!rutaPublica.startsWith(`${URL_PUBLICA}/`) || !nombre || nombre.includes("..")) return null;
  return path.join(DIR_SUBIDAS, nombre);
}

export type ResultadoImagen = { ok: true; ruta: string } | { ok: false; error: string };

/** Guarda el archivo subido y devuelve la URL pública para la columna `imagen`. */
export async function guardarImagenProducto(archivo: File): Promise<ResultadoImagen> {
  if (archivo.size > MAX_BYTES) {
    return { ok: false, error: "La imagen no puede superar los 8 MB." };
  }
  const ext = TIPOS_IMAGEN[archivo.type];
  if (!ext) {
    return { ok: false, error: "Formato no soportado. Usá JPG, PNG, WEBP o GIF." };
  }

  await mkdir(DIR_SUBIDAS, { recursive: true });
  const nombre = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(path.join(DIR_SUBIDAS, nombre), Buffer.from(await archivo.arrayBuffer()));
  return { ok: true, ruta: `${URL_PUBLICA}/${nombre}` };
}

/** Borra la imagen de disco. Ignora las URLs externas (http://…) y las que ya no están. */
export async function borrarImagenProducto(rutaPublica: string) {
  const archivo = archivoDeImagen(rutaPublica);
  if (!archivo) return;
  try {
    await unlink(archivo);
  } catch {
    /* ya no estaba → nada que hacer */
  }
}
