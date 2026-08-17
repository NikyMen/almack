import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { tieneAcceso } from "@/lib/permisos";

// Los comprobantes NO viven en /public por dos motivos:
//  1. Next solo sirve /public con lo que existía al momento del build, así que
//     una foto subida en producción nunca se vería.
//  2. Son documentos internos del negocio: se sirven detrás del login.
const RAIZ = path.join(process.cwd(), "uploads");

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ ruta: string[] }> }) {
  const usuario = await getUsuarioActual();
  if (!usuario || !tieneAcceso(usuario, "compras")) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { ruta } = await ctx.params;
  const destino = path.join(RAIZ, ...ruta);
  // Defensa contra path traversal: el archivo resuelto tiene que caer dentro
  // de la carpeta de subidas.
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
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
