import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Fotos de productos: se sirven SIN login porque la tienda online es pública.
// Ojo: esta carpeta es sólo la de productos, no la raíz de /uploads (ahí viven
// los comprobantes de Compras, que sí están detrás de sesión).
const RAIZ = path.join(process.cwd(), "uploads", "productos");

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await ctx.params;
  const destino = path.join(RAIZ, archivo);
  // Defensa contra path traversal: el archivo resuelto tiene que caer dentro
  // de la carpeta de imágenes de productos.
  if (!destino.startsWith(RAIZ + path.sep)) {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  const tipo = TIPOS[path.extname(destino).toLowerCase()];
  if (!tipo) return new NextResponse("Tipo no soportado", { status: 400 });

  try {
    const [info, datos] = await Promise.all([stat(destino), readFile(destino)]);
    return new NextResponse(new Uint8Array(datos), {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(info.size),
        // Los nombres llevan un sufijo aleatorio: el contenido nunca cambia.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
